// api/summary-cron.js — Resumo financeiro por e-mail (semanal + mensal)
// Vercel Cron: todo dia às 23h UTC (20h BRT) — um único agendamento/função
// (limite de 12 funções serverless no plano Hobby da Vercel) que decide
// internamente o que fazer: sexta-feira manda o resumo da semana, último
// dia do mês manda o fechamento mensal com insights. Uma única invocação
// por dia evita o risco de duplicar envio nos raros anos em que a sexta
// coincide com o último dia do mês (que aconteceria se fossem 2 crons
// separados apontando pro mesmo horário).

import { hojeSP, ultimosNDias, ehUltimoDiaDoMes, fmtDataBR, mesRefLabel } from './_dateUtils.js';
import { resumoSemanal, resumoMensal, fmtBRL } from './_financeSummary.js';
import { enviarEmail } from './_email.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

const sbHeaders = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

const EMAIL_FALLBACK = 'info.marcio@gmail.com';

async function usuariosAtivos() {
  const r = await fetch(`${SB_URL}/rest/v1/accounts?active=eq.true&select=user_id`, { headers: sbHeaders });
  const contas = await r.json();
  return [...new Set((contas || []).map(c => c.user_id))];
}

async function emailDoUsuario(userId) {
  const r = await fetch(
    `${SB_URL}/rest/v1/user_settings?user_id=eq.${userId}&setting_key=eq.perfil_email_notif&select=setting_value`,
    { headers: sbHeaders }
  );
  const data = await r.json();
  return data?.[0]?.setting_value || EMAIL_FALLBACK;
}

function formatarSemanal(periodo, resumo) {
  const linhas = [
    `📊 RESUMO DA SEMANA — FinZen`,
    `${fmtDataBR(periodo.inicio)} a ${fmtDataBR(periodo.fim)}`,
    '',
    `💰 Receitas: ${fmtBRL(resumo.receitas)}`,
    `💸 Despesas: ${fmtBRL(resumo.despesas)}`,
    `${resumo.resultado >= 0 ? '✅' : '🔴'} Resultado: ${fmtBRL(resumo.resultado)}`,
  ];
  if (resumo.top3.length > 0) {
    linhas.push('', 'Top categorias de despesa:');
    resumo.top3.forEach((c, i) => linhas.push(`${i + 1}º ${c.nome} — ${fmtBRL(c.valor)}`));
  }
  linhas.push('', '— Enviado automaticamente toda sexta às 20h.');
  return linhas.join('\n');
}

function formatarMensal(mesRef, resumo) {
  const linhas = [
    `📆 FECHAMENTO DO MÊS — FinZen`,
    mesRefLabel(mesRef),
    '',
    `💰 Receitas: ${fmtBRL(resumo.receitas)}`,
    `💸 Despesas: ${fmtBRL(resumo.despesas)}`,
    `${resumo.resultado >= 0 ? '✅' : '🔴'} Resultado: ${fmtBRL(resumo.resultado)}`,
    `📈 Taxa de poupança: ${resumo.poupPct.toFixed(1)}%`,
  ];
  if (resumo.patrimonioMes !== null) {
    const variacao = resumo.varPatrimPct !== null
      ? ` (${resumo.varPatrimPct >= 0 ? '↑' : '↓'} ${Math.abs(resumo.varPatrimPct).toFixed(1)}% vs mês anterior)`
      : '';
    linhas.push(`🏦 Patrimônio líquido: ${fmtBRL(resumo.patrimonioMes)}${variacao}`);
  }
  if (resumo.top3.length > 0) {
    linhas.push('', 'Top categorias de despesa:');
    resumo.top3.forEach((c, i) => linhas.push(`${i + 1}º ${c.nome} — ${fmtBRL(c.valor)}`));
  }
  if (resumo.insights.length > 0) {
    linhas.push('', 'Insights do mês:');
    resumo.insights.forEach(i => linhas.push(`→ ${i}`));
  }
  linhas.push('', '— Enviado automaticamente no último dia do mês às 20h.');
  return linhas.join('\n');
}

async function processarSemanal(usuarios, hoje, resultado) {
  const periodo = ultimosNDias(hoje, 7);
  for (const userId of usuarios) {
    try {
      const resumo = await resumoSemanal(userId, periodo, sbHeaders, SB_URL);
      if (resumo.receitas === 0 && resumo.despesas === 0) { resultado.semanal.pulados++; continue; }
      const email = await emailDoUsuario(userId);
      const envio = await enviarEmail({
        destinatario: email,
        titulo: 'Resumo da Semana — FinZen',
        data: periodo.fim,
        tipo: 'Resumo Semanal',
        descricao: formatarSemanal(periodo, resumo),
      });
      if (!envio.ok) resultado.semanal.erros.push({ userId, erro: envio.erro });
      else resultado.semanal.processados++;
    } catch (e) {
      resultado.semanal.erros.push({ userId, erro: e.message });
    }
  }
}

async function processarMensal(usuarios, hoje, resultado) {
  const [ano, mes] = hoje.split('-').map(Number);
  for (const userId of usuarios) {
    try {
      const resumo = await resumoMensal(userId, { ano, mes }, sbHeaders, SB_URL);
      if (resumo.receitas === 0 && resumo.despesas === 0) { resultado.mensal.pulados++; continue; }
      const email = await emailDoUsuario(userId);
      const envio = await enviarEmail({
        destinatario: email,
        titulo: 'Fechamento do Mês — FinZen',
        data: hoje,
        tipo: 'Resumo Mensal',
        descricao: formatarMensal(resumo.mesRef, resumo),
      });
      if (!envio.ok) resultado.mensal.erros.push({ userId, erro: envio.erro });
      else resultado.mensal.processados++;
    } catch (e) {
      resultado.mensal.erros.push({ userId, erro: e.message });
    }
  }
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET não configurado' });
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const hoje = hojeSP();
  const diaSemana = new Date(hoje + 'T12:00:00').getDay(); // 5 = sexta
  const ehSexta = diaSemana === 5;
  const ehFimDeMes = ehUltimoDiaDoMes(hoje);

  if (!ehSexta && !ehFimDeMes) {
    return res.status(200).json({ ok: true, skip: true, motivo: 'nem sexta nem último dia do mês' });
  }

  const resultado = {
    data: hoje,
    semanal: ehSexta ? { processados: 0, pulados: 0, erros: [] } : null,
    mensal: ehFimDeMes ? { processados: 0, pulados: 0, erros: [] } : null,
  };

  try {
    const usuarios = await usuariosAtivos();
    if (ehSexta) await processarSemanal(usuarios, hoje, resultado);
    if (ehFimDeMes) await processarMensal(usuarios, hoje, resultado);

    const houveErro = (resultado.semanal?.erros.length || 0) + (resultado.mensal?.erros.length || 0) > 0;
    res.status(houveErro ? 500 : 200).json({ ok: !houveErro, ...resultado });
  } catch (e) {
    console.error('summary-cron:', e.message);
    res.status(500).json({ ok: false, fatal: e.message });
  }
}

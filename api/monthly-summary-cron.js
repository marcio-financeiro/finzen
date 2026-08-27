// api/monthly-summary-cron.js — Resumo financeiro mensal + insights por e-mail
// Vercel Cron: dias 28-31 às 23h UTC (20h BRT); só processa de fato quando
// "amanhã" (fuso America/Sao_Paulo) cai no dia 1 — ou seja, quando hoje é
// realmente o último dia do mês (cron não tem operador "último dia").

import { hojeSP, ehUltimoDiaDoMes, mesRefLabel } from './_dateUtils.js';
import { resumoMensal, fmtBRL } from './_financeSummary.js';
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

function formatarTexto(mesRef, resumo) {
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

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET não configurado' });
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const hoje = hojeSP();
  if (!ehUltimoDiaDoMes(hoje)) {
    return res.status(200).json({ ok: true, skip: true, motivo: 'não é o último dia do mês' });
  }

  const [ano, mes] = hoje.split('-').map(Number);
  const resultado = { mes: `${ano}-${String(mes).padStart(2, '0')}`, processados: 0, pulados: 0, erros: [] };

  try {
    const usuarios = await usuariosAtivos();

    for (const userId of usuarios) {
      try {
        const resumo = await resumoMensal(userId, { ano, mes }, sbHeaders, SB_URL);
        if (resumo.receitas === 0 && resumo.despesas === 0) {
          resultado.pulados++;
          continue;
        }
        const email = await emailDoUsuario(userId);
        const envio = await enviarEmail({
          destinatario: email,
          titulo: 'Fechamento do Mês — FinZen',
          data: hoje,
          tipo: 'Resumo Mensal',
          descricao: formatarTexto(resumo.mesRef, resumo),
        });
        if (!envio.ok) resultado.erros.push({ userId, erro: envio.erro });
        else resultado.processados++;
      } catch (e) {
        resultado.erros.push({ userId, erro: e.message });
      }
    }

    if (resultado.erros.length) return res.status(500).json({ ok: false, ...resultado });
    res.status(200).json({ ok: true, ...resultado });
  } catch (e) {
    console.error('monthly-summary-cron:', e.message);
    res.status(500).json({ ok: false, fatal: e.message });
  }
}

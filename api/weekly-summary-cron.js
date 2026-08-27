// api/weekly-summary-cron.js — Resumo financeiro semanal por e-mail
// Vercel Cron: toda sexta-feira às 23h UTC (20h BRT)

import { hojeSP, ultimosNDias, fmtDataBR } from './_dateUtils.js';
import { resumoSemanal, fmtBRL } from './_financeSummary.js';
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

function formatarTexto(periodo, resumo) {
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

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET não configurado' });
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const periodo = ultimosNDias(hojeSP(), 7);
  const resultado = { periodo, processados: 0, pulados: 0, erros: [] };

  try {
    const usuarios = await usuariosAtivos();

    for (const userId of usuarios) {
      try {
        const resumo = await resumoSemanal(userId, periodo, sbHeaders, SB_URL);
        if (resumo.receitas === 0 && resumo.despesas === 0) {
          resultado.pulados++;
          continue;
        }
        const email = await emailDoUsuario(userId);
        const envio = await enviarEmail({
          destinatario: email,
          titulo: 'Resumo da Semana — FinZen',
          data: periodo.fim,
          tipo: 'Resumo Semanal',
          descricao: formatarTexto(periodo, resumo),
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
    console.error('weekly-summary-cron:', e.message);
    res.status(500).json({ ok: false, fatal: e.message });
  }
}

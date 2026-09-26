// api/cotacao-cron.js — Cotações de fechamento diário via Vercel Cron
// Vercel Cron: 0 22 * * 1-5 (22h UTC = 19h BRT, seg-sex)

import { isBR, isEUA, buscarCotacoes, montarResumoCarteira } from './_cotacaoResumo.js';
import { hojeSP } from './_dateUtils.js';

// SUPABASE_URL/SUPABASE_KEY: nunca hardcode aqui — as RPCs cotacao_get_ativos/
// cotacao_patch_ativo passam a exigir service_role (migration de segurança da
// Fase 0), então a anon key não teria mais acesso de qualquer forma.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VERCEL_URL    = 'https://finzen-rho.vercel.app';

function isRF(tipo) { return tipo === 'renda_fixa'; }

async function sbRpc(fn, params) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  if (!r.ok) throw new Error(`Supabase RPC ${fn} ${r.status}: ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

async function enviarTelegram(mensagem) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('Telegram não configurado');
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: mensagem, parse_mode: 'HTML' }),
  });
}

async function sbUpsert(table, rows, onConflict) {
  if (!rows.length) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`Supabase upsert ${table} ${r.status}: ${await r.text()}`);
}

// Snapshot do valor total da carteira por usuário (todos ativos ativos, RF
// incluída) pra alimentar investment_value_history — base do cálculo de
// variação de mercado semanal no e-mail de resumo (api/_financeSummary.js).
// `valoresHoje` traz o valor recém-calculado pros ativos que tiveram cotação
// encontrada hoje; os demais (RF, ou sem cotação no dia) usam o
// valor_atual_brl já salvo no banco.
function gravarSnapshotCarteira(todos, valoresHoje) {
  const porUsuario = new Map();
  for (const a of todos) {
    const valor = valoresHoje.has(a.id) ? valoresHoje.get(a.id) : Number(a.valor_atual_brl || 0);
    porUsuario.set(a.user_id, (porUsuario.get(a.user_id) || 0) + valor);
  }
  const hoje = hojeSP();
  return Array.from(porUsuario.entries()).map(([user_id, valorTotalBRL]) => ({
    user_id, date: hoje, valor_total_brl: Number(valorTotalBRL.toFixed(2)),
  }));
}

async function executar() {
  const dataFmt = new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const todos = await sbRpc('cotacao_get_ativos', {});
  if (!todos.length) return { ok: true, msg: 'Sem investimentos cadastrados' };

  const ativos = todos.filter(a => !isRF(a.tipo));
  const valoresHoje = new Map();
  let resultado = { ok: true, ativos: 0, snapshot: 0 };

  if (ativos.length) {
    const tickersBR  = [...new Set(ativos.filter(a => isBR(a.tipo)).map(a => a.ticker.toUpperCase()))];
    const tickersEUA = [...new Set(ativos.filter(a => isEUA(a.tipo)).map(a => a.ticker.toUpperCase()))];
    const allTickers = [...tickersBR, ...tickersEUA];

    if (allTickers.length) {
      const quotes = await buscarCotacoes(VERCEL_URL, allTickers);
      const dolar  = quotes['USD-BRL'] || 0;

      // Persiste a cotação do dia em cada ativo (exclusivo do cron — o comando
      // interativo "fechamento" só consulta, não grava)
      const agora = new Date().toISOString();
      for (const a of ativos) {
        const key = a.ticker.toUpperCase();
        const novaCotacao = quotes[key];
        if (!novaCotacao) continue;

        const moeda = a.moeda || 'BRL';
        const fx    = moeda === 'USD' ? (dolar || 1) : 1;
        const qtd   = Number(a.quantidade);
        const valorBRL = novaCotacao * qtd * fx;
        valoresHoje.set(a.id, valorBRL);

        await sbRpc('cotacao_patch_ativo', {
          p_id:            a.id,
          p_cotacao:       novaCotacao,
          p_valor_brl:     valorBRL,
          p_exchange_rate: moeda === 'USD' && dolar > 0 ? dolar : 0,
          p_atualizado_em: agora,
        });
      }

      const { texto } = montarResumoCarteira({ ativos, quotes, dolar, dataFmt });
      await enviarTelegram(texto);
      resultado.ativos = ativos.length;
    }
  }

  const snapshots = gravarSnapshotCarteira(todos, valoresHoje);
  await sbUpsert('investment_value_history', snapshots, 'user_id,date');
  resultado.snapshot = snapshots.length;

  return resultado;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET não configurado' });
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await executar();
    res.status(200).json(result);
  } catch (e) {
    console.error('cotacao-cron:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
}

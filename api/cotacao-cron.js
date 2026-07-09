// api/cotacao-cron.js — Cotações de fechamento diário via Vercel Cron
// Vercel Cron: 0 22 * * 1-5 (22h UTC = 19h BRT, seg-sex)

import { isBR, isEUA, buscarCotacoes, montarResumoCarteira } from './_cotacaoResumo.js';

const SUPABASE_URL = 'https://qgamphwnlrriwalcbhbl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnYW1waHdubHJyaXdhbGNiaGJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNTkzMzUsImV4cCI6MjA5NjYzNTMzNX0.AV0mCZqYlNyqz9XVWeHImMljnpt4klxpUjBa1HHlYkM';
const VERCEL_URL   = 'https://finzen-rho.vercel.app';

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

async function executar() {
  const dataFmt = new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const todos = await sbRpc('cotacao_get_ativos', {});
  const ativos = todos.filter(a => !isRF(a.tipo));
  if (!ativos.length) return { ok: true, msg: 'Sem ativos negociáveis' };

  const tickersBR  = [...new Set(ativos.filter(a => isBR(a.tipo)).map(a => a.ticker.toUpperCase()))];
  const tickersEUA = [...new Set(ativos.filter(a => isEUA(a.tipo)).map(a => a.ticker.toUpperCase()))];
  const allTickers = [...tickersBR, ...tickersEUA];
  if (!allTickers.length) return { ok: true, msg: 'Sem tickers' };

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

    await sbRpc('cotacao_patch_ativo', {
      p_id:            a.id,
      p_cotacao:       novaCotacao,
      p_valor_brl:     novaCotacao * qtd * fx,
      p_exchange_rate: moeda === 'USD' && dolar > 0 ? dolar : 0,
      p_atualizado_em: agora,
    });
  }

  const { texto } = montarResumoCarteira({ ativos, quotes, dolar, dataFmt });
  await enviarTelegram(texto);
  return { ok: true, ativos: ativos.length };
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await executar();
    res.status(200).json(result);
  } catch (e) {
    console.error('cotacao-cron:', e.message);
    res.status(200).json({ ok: false, error: e.message });
  }
}

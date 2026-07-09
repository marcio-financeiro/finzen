// api/cotacao-cron.js — Cotações de fechamento diário via Vercel Cron
// Vercel Cron: 0 22 * * 1-5 (22h UTC = 19h BRT, seg-sex)

const SUPABASE_URL = 'https://qgamphwnlrriwalcbhbl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnYW1waHdubHJyaXdhbGNiaGJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNTkzMzUsImV4cCI6MjA5NjYzNTMzNX0.AV0mCZqYlNyqz9XVWeHImMljnpt4klxpUjBa1HHlYkM';
const VERCEL_URL   = 'https://finzen-rho.vercel.app';

const TIPOS_BR  = ['acao_br', 'fii', 'etf_br'];
const TIPOS_EUA = ['acao_eua', 'etf_eua'];
function isBR(tipo)  { return TIPOS_BR.includes(tipo); }
function isEUA(tipo) { return TIPOS_EUA.includes(tipo); }
function isRF(tipo)  { return tipo === 'renda_fixa'; }

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

async function buscarCotacoes(tickers) {
  const params = new URLSearchParams({ tickers: tickers.join(','), dolar: 'true', change: 'true' });
  const r = await fetch(`${VERCEL_URL}/api/quotes?${params}`, {
    headers: { 'User-Agent': 'FinZen-Cron/1.0' },
  });
  if (!r.ok) throw new Error(`Proxy cotações ${r.status}`);
  return r.json();
}

function fmt(v, dec = 2) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function varEmoji(pct) {
  if (pct > 0.05)  return '📈';
  if (pct < -0.05) return '📉';
  return '➡️';
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

  const quotes = await buscarCotacoes(allTickers);
  const dolar  = quotes['USD-BRL'] || 0;

  const agora  = new Date().toISOString();
  const grupos = {};
  let deltaBR = 0, deltaEUA = 0;
  let deltaValidoBR = true, deltaValidoEUA = true;
  const semCotacao = [];

  for (const a of ativos) {
    const key = a.ticker.toUpperCase();
    const novaCotacao = quotes[key];
    if (!novaCotacao) { semCotacao.push(key); continue; }

    const changePct = quotes[`${key}_chg`] ?? null;
    const moeda     = a.moeda || 'BRL';
    const fx        = moeda === 'USD' ? (dolar || 1) : 1;
    const qtd       = Number(a.quantidade);

    if (changePct !== null && dolar > 0) {
      const delta = (changePct / 100) * novaCotacao * qtd * fx;
      if (isEUA(a.tipo)) deltaEUA += delta; else deltaBR += delta;
    } else {
      if (isEUA(a.tipo)) deltaValidoEUA = false; else deltaValidoBR = false;
    }

    await sbRpc('cotacao_patch_ativo', {
      p_id:            a.id,
      p_cotacao:       novaCotacao,
      p_valor_brl:     novaCotacao * qtd * fx,
      p_exchange_rate: moeda === 'USD' && dolar > 0 ? dolar : 0,
      p_atualizado_em: agora,
    });

    const corretora = a.corretora || 'Outros';
    if (!grupos[corretora]) grupos[corretora] = [];
    grupos[corretora].push({ ticker: key, cotacao: novaCotacao, moeda, changePct });
  }

  const linhas = [`📊 <b>Carteira — ${dataFmt}</b>`];
  if (dolar > 0) linhas.push(`💵 USD/BRL: R$ ${fmt(dolar, 4)}`);
  linhas.push('');

  for (const corretora of Object.keys(grupos).sort()) {
    linhas.push(`<b>${corretora}</b>`);
    for (const a of grupos[corretora].sort((x, y) => x.ticker.localeCompare(y.ticker))) {
      const simbolo = a.moeda === 'USD' ? 'US$' : 'R$';
      const cotStr  = `${simbolo} ${fmt(a.cotacao)}`;
      const varStr  = a.changePct !== null
        ? `${varEmoji(a.changePct)} ${a.changePct >= 0 ? '+' : ''}${fmt(a.changePct)}%`
        : '➡️ —';
      linhas.push(`• ${a.ticker}  ${cotStr}  ${varStr}`);
    }
    linhas.push('');
  }

  const linhaDelta = (label, delta) => {
    const sinal = delta >= 0 ? '+' : '';
    const emoji = delta > 0 ? '📈' : delta < 0 ? '📉' : '➡️';
    return `${emoji} <b>Hoje ${label}: ${sinal}R$ ${fmt(Math.abs(delta))}</b>`;
  };
  if (deltaValidoBR && tickersBR.length)   linhas.push(linhaDelta('Nacional', deltaBR));
  if (deltaValidoEUA && tickersEUA.length) linhas.push(linhaDelta('EUA', deltaEUA));

  // Avisa quais ativos ficaram sem cotação hoje (falha momentânea da API de
  // cotações) em vez de eles simplesmente sumirem da lista sem explicação
  if (semCotacao.length) {
    linhas.push('');
    linhas.push(`⚠️ Sem cotação hoje: ${semCotacao.join(', ')}`);
  }

  await enviarTelegram(linhas.join('\n').trim());
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

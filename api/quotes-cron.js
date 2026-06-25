// api/quotes-cron.js — Cotações da carteira via Telegram
// Vercel Cron: 22h UTC = 19h BRT (seg–sex)

const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const SB_URL      = process.env.SUPABASE_URL;
const SB_KEY      = process.env.SUPABASE_SERVICE_KEY;
const BRAPI_TOKEN = process.env.BRAPI_TOKEN || 'bGZu7dGPyW94PcfXVCiA7t';

const sbH = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

async function enviar(chatId, texto) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML' }),
  });
}

async function getDolar() {
  try {
    const r = await fetch(`https://brapi.dev/api/v2/currency?currency=USD-BRL&token=${BRAPI_TOKEN}`);
    if (r.ok) {
      const j = await r.json();
      const v = parseFloat(j?.currency?.[0]?.bidPrice || 0);
      if (v > 0) return v;
    }
  } catch (_) {}
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    if (r.ok) {
      const j = await r.json();
      const v = parseFloat(j?.USDBRL?.bid || 0);
      if (v > 0) return v;
    }
  } catch (_) {}
  return null;
}

async function getCotacaoBR(ticker) {
  try {
    const r = await fetch(
      `https://brapi.dev/api/quote/${ticker}?token=${BRAPI_TOKEN}`,
      { headers: { 'User-Agent': 'FinZen/1.0' } }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const i = j.results?.[0];
    if (!i?.regularMarketPrice) return null;
    return {
      price:  parseFloat(i.regularMarketPrice),
      change: parseFloat(i.regularMarketChangePercent || 0),
    };
  } catch (_) { return null; }
}

async function getCotacaoEUA(ticker) {
  const endpoints = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
  ];
  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal });
      clearTimeout(timer);
      if (!r.ok) continue;
      const j = await r.json();
      const meta = j?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) continue;
      return {
        price:  parseFloat(meta.regularMarketPrice),
        change: parseFloat(meta.regularMarketChangePercent || 0),
      };
    } catch (_) {}
  }
  return null;
}

function fmt(n) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  const s = n >= 0 ? '+' : '';
  return `${s}${n.toFixed(2)}%`;
}

function dataHojeBRT() {
  const d = new Date();
  d.setTime(d.getTime() - 3 * 60 * 60 * 1000);
  const [ano, mes, dia] = d.toISOString().split('T')[0].split('-');
  return `${dia}/${mes}/${ano}`;
}

async function enviarCotacoes() {
  // Buscar todos os usuários com Telegram vinculado
  const rLinks = await fetch(
    `${SB_URL}/rest/v1/telegram_links?select=user_id,chat_id`,
    { headers: sbH }
  );
  const links = await rLinks.json();
  if (!Array.isArray(links) || !links.length) return;

  // Dólar (busca única, compartilhada)
  const dolar = await getDolar();

  for (const { user_id, chat_id } of links) {
    const rInv = await fetch(
      `${SB_URL}/rest/v1/investments?user_id=eq.${user_id}&select=ticker`,
      { headers: sbH }
    );
    const investments = await rInv.json();
    if (!Array.isArray(investments) || !investments.length) continue;

    const tickers = [...new Set(investments.map(i => i.ticker.toUpperCase()))];
    const br  = tickers.filter(t => /\d/.test(t));
    const eua = tickers.filter(t => /^[A-Z]{1,5}$/.test(t));

    const [resBR, resEUA] = await Promise.all([
      Promise.allSettled(br.map(t  => getCotacaoBR(t).then(r  => ({ ticker: t,  ...r  })))),
      Promise.allSettled(eua.map(t => getCotacaoEUA(t).then(r => ({ ticker: t,  ...r  })))),
    ]);

    const linhasBR = resBR
      .filter(r => r.status === 'fulfilled' && r.value?.price)
      .map(({ value: { ticker, price, change } }) => {
        const e = change >= 0 ? '🟢' : '🔴';
        return `${e} <b>${ticker}</b>  R$ ${fmt(price)}  <i>${fmtPct(change)}</i>`;
      });

    const linhasEUA = resEUA
      .filter(r => r.status === 'fulfilled' && r.value?.price)
      .map(({ value: { ticker, price, change } }) => {
        const e = change >= 0 ? '🟢' : '🔴';
        return `${e} <b>${ticker}</b>  USD ${fmt(price)}  <i>${fmtPct(change)}</i>`;
      });

    if (!linhasBR.length && !linhasEUA.length && !dolar) continue;

    let msg = `📊 <b>Cotações — ${dataHojeBRT()} 19h</b>`;
    if (linhasBR.length)  msg += `\n\n🇧🇷 <b>Brasil</b>\n${linhasBR.join('\n')}`;
    if (linhasEUA.length) msg += `\n\n🇺🇸 <b>EUA</b>\n${linhasEUA.join('\n')}`;
    if (dolar)            msg += `\n\n💵 <b>Dólar</b>  R$ ${fmt(dolar)}`;

    await enviar(chat_id, msg);
  }
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    await enviarCotacoes();
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('quotes-cron:', e.message);
    res.status(200).json({ ok: true });
  }
}

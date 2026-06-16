// api/quotes.js — FinZen
// Vercel Serverless (Node.js) — mais compatível com brapi.dev

const BRAPI_TOKEN = 'bGZu7dGPyW94PcfXVCiA7t';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if(req.method === 'OPTIONS') return res.status(200).end();

  const tickers = (req.query.tickers || '')
    .split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  const dolar = req.query.dolar === 'true';
  const resultado = {};

  // ── Dólar via brapi ──────────────────────────────────
  if(dolar) {
    try {
      const r = await fetch(
        `https://brapi.dev/api/v2/currency?currency=USD-BRL&token=${BRAPI_TOKEN}`
      );
      if(r.ok) {
        const j = await r.json();
        const v = parseFloat(j?.currency?.[0]?.bidPrice || 0);
        if(v > 0) resultado['USD-BRL'] = v;
      }
    } catch(_) {}

    if(!resultado['USD-BRL']) {
      try {
        const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
        if(r.ok) {
          const j = await r.json();
          const v = parseFloat(j?.USDBRL?.bid || 0);
          if(v > 0) resultado['USD-BRL'] = v;
        }
      } catch(_) {}
    }
  }

  if(!tickers.length) return res.status(200).json(resultado);

  const tickersBR  = tickers.filter(t => /\d/.test(t));
  const tickersEUA = tickers.filter(t => !/\d/.test(t));

  // ── BR: brapi.dev com token ──────────────────────────
  if(tickersBR.length) {
    try {
      const r = await fetch(
        `https://brapi.dev/api/quote/${tickersBR.join(',')}?token=${BRAPI_TOKEN}&fundamental=false&dividends=false`
      );
      if(r.ok) {
        const j = await r.json();
        (j.results || []).forEach(i => {
          if(i.symbol && i.regularMarketPrice) {
            resultado[i.symbol.toUpperCase()] = parseFloat(i.regularMarketPrice);
          }
        });
      }
    } catch(_) {}
  }

  // ── EUA: Yahoo Finance ───────────────────────────────
  if(tickersEUA.length) {
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickersEUA.join(',')}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if(r.ok) {
        const j = await r.json();
        (j?.quoteResponse?.result || []).forEach(i => {
          if(i.symbol && i.regularMarketPrice)
            resultado[i.symbol] = parseFloat(i.regularMarketPrice);
        });
      }
    } catch(_) {}

    // Fallback individual
    for(const ticker of tickersEUA.filter(t => !resultado[t])) {
      try {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        if(r.ok) {
          const j = await r.json();
          const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if(p) resultado[ticker] = parseFloat(p);
        }
      } catch(_) {}
    }
  }

  // ── IBOV via BCB ──────────────────────────────────────
  if(tickers.includes("IBOV")) {
    try {
      const hoje = new Date();
      const pad = n => String(n).padStart(2,"0");
      const fim = `${pad(hoje.getDate())}/${pad(hoje.getMonth()+1)}/${hoje.getFullYear()}`;
      const d1 = new Date(hoje); d1.setFullYear(hoje.getFullYear()-1);
      const ini = `${pad(d1.getDate())}/${pad(d1.getMonth()+1)}/${d1.getFullYear()}`;
      const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.7/dados?formato=json&dataInicial=${ini}&dataFinal=${fim}`);
      if(r.ok) {
        const j = await r.json();
        if(j?.length >= 2) {
          const p0 = parseFloat(j[0].valor.replace(",","."));
          const p1 = parseFloat(j[j.length-1].valor.replace(",","."));
          if(p0 > 0 && p1 > 0) resultado["IBOV"] = (p1 - p0) / p0 * 100;
        }
      }
    } catch(_) {}
  }

  return res.status(200).json(resultado);
}

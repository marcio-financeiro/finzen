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
  const fundamental = req.query.fundamental === 'true';
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
        `https://brapi.dev/api/quote/${tickersBR.join(',')}?token=${BRAPI_TOKEN}&fundamental=${fundamental}&dividends=false`
      );
      if(r.ok) {
        const j = await r.json();
        (j.results || []).forEach(i => {
          if(i.symbol && i.regularMarketPrice) {
            const sym = i.symbol.toUpperCase();
            resultado[sym] = parseFloat(i.regularMarketPrice);
            // Campos fundamentalistas quando solicitados
            if(fundamental) {
              resultado[`${sym}_fund`] = {
                pl   : i.priceEarnings        ?? null,
                roe  : i.returnOnEquity        ?? null,
                dy   : i.dividendYield         ?? null,
                pvpa : i.priceToBook           ?? null,
              };
            }
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
          if(i.symbol && i.regularMarketPrice) {
            resultado[i.symbol] = parseFloat(i.regularMarketPrice);
            if(fundamental) {
              resultado[`${i.symbol}_fund`] = {
                pl   : i.trailingPE                      ?? null,
                roe  : i.returnOnEquity != null ? i.returnOnEquity * 100 : null,
                dy   : i.trailingAnnualDividendYield != null ? i.trailingAnnualDividendYield * 100 : null,
                pvpa : i.priceToBook                     ?? null,
              };
            }
          }
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

  return res.status(200).json(resultado);
}

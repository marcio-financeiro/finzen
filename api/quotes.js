// api/quotes.js — FinZen
// brapi.dev com API key + Yahoo Finance para EUA

export const config = { runtime: 'edge' };

const BRAPI_TOKEN = 'bGZu7dGPyW94PcfXVCiA7t';

export default async function handler(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=300',
  };

  if(req.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  const url     = new URL(req.url);
  const tickers = (url.searchParams.get('tickers') || '')
    .split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  const dolar   = url.searchParams.get('dolar') === 'true';
  const resultado = {};

  // ── Dólar ─────────────────────────────────────────────
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

    // Fallback dólar
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

  if(!tickers.length) {
    return new Response(JSON.stringify(resultado), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }

  const tickersBR  = tickers.filter(t => /\d/.test(t));
  const tickersEUA = tickers.filter(t => !/\d/.test(t));

  // ── BR: brapi.dev com token ───────────────────────────
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

  // ── EUA: Yahoo Finance ────────────────────────────────
  if(tickersEUA.length) {
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickersEUA.join(',')}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          }
        }
      );
      if(r.ok) {
        const j = await r.json();
        (j?.quoteResponse?.result || []).forEach(i => {
          if(i.symbol && i.regularMarketPrice) {
            resultado[i.symbol] = parseFloat(i.regularMarketPrice);
          }
        });
      }
    } catch(_) {}

    // Fallback individual para EUA
    const faltando = tickersEUA.filter(t => !resultado[t]);
    for(const ticker of faltando) {
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

  return new Response(JSON.stringify(resultado), {
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

// api/quotes.js
// Proxy de cotações — resolve CORS do Yahoo Finance e brapi.dev
// GET /api/quotes?tickers=PETR4,AAPL,BBAS3&dolar=true

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=300', // cache 5 min
  };

  if(req.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  const url     = new URL(req.url);
  const tickers = (url.searchParams.get('tickers') || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  const dolar   = url.searchParams.get('dolar') === 'true';

  const resultado = {};

  // ── Dólar ────────────────────────────────────────────
  if(dolar) {
    try {
      const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
      const j = await r.json();
      const v = parseFloat(j?.USDBRL?.bid || 0);
      if(v > 0) resultado['USD-BRL'] = v;
    } catch(_) {}
  }

  if(!tickers.length) {
    return new Response(JSON.stringify(resultado), { headers: { ...headers, 'Content-Type': 'application/json' } });
  }

  // Separar BR (sem ponto) de EUA (com ponto ou letras apenas)
  // Tickers BR: PETR4, BBAS3, MXRF11, BOVA11 etc
  // Tickers EUA: AAPL, VTI, IVVB11 (ETF BR), BDR: AAPL34
  const tickersBR  = tickers.filter(t => /^\w{4,6}(F11|[0-9]|3B)?$/.test(t) && !/^[A-Z]{1,5}$/.test(t));
  const tickersEUA = tickers.filter(t => /^[A-Z]{1,5}$/.test(t));

  // ── Cotações BR — brapi.dev ───────────────────────────
  if(tickersBR.length) {
    try {
      const r = await fetch(
        `https://brapi.dev/api/quote/${[...new Set(tickersBR)].join(',')}?token=anonymous`,
        { headers: { 'User-Agent': 'FinZen/1.0' } }
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

  // ── Cotações EUA — Yahoo Finance (sem CORS no servidor) ──
  for(const ticker of [...new Set(tickersEUA)]) {
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if(!r.ok) continue;
      const j = await r.json();
      const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if(p) resultado[ticker] = parseFloat(p);
    } catch(_) {}
  }

  // Tentar todos via brapi para os que não vieram do Yahoo
  const faltando = tickers.filter(t => !resultado[t] && t !== 'USD-BRL');
  if(faltando.length) {
    try {
      const r = await fetch(
        `https://brapi.dev/api/quote/${[...new Set(faltando)].join(',')}?token=anonymous`,
        { headers: { 'User-Agent': 'FinZen/1.0' } }
      );
      if(r.ok) {
        const j = await r.json();
        (j.results || []).forEach(i => {
          if(i.symbol && i.regularMarketPrice && !resultado[i.symbol.toUpperCase()]) {
            resultado[i.symbol.toUpperCase()] = parseFloat(i.regularMarketPrice);
          }
        });
      }
    } catch(_) {}
  }

  return new Response(JSON.stringify(resultado), {
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

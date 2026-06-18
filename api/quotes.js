// api/quotes.js — FinZen
// Vercel Serverless (Node.js) — proxy para cotações com fallbacks robustos

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

  // ── Dólar ─────────────────────────────────────────────────────────────
  if(dolar) {
    // Tentativa 1: brapi.dev
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

    // Tentativa 2: AwesomeAPI
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

  // ── BR: brapi.dev com token ────────────────────────────────────────────
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
            if(fundamental) {
              resultado[`${sym}_fund`] = {
                pl  : i.priceEarnings   ?? null,
                roe : i.returnOnEquity  ?? null,
                dy  : i.dividendYield   ?? null,
                pvpa: i.priceToBook     ?? null,
              };
            }
          }
        });
      }
    } catch(_) {}
  }

  // ── EUA: Yahoo Finance query2 (mais estável, sem crumb) ───────────────
  if(tickersEUA.length) {
    const YAHOO_HEADERS = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json,text/plain,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://finance.yahoo.com/',
      'Origin': 'https://finance.yahoo.com',
    };

    // Tentativa 1: query2 v8/chart (lote)
    const tickersFaltando = [...tickersEUA];
    try {
      const r = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${tickersEUA[0]}?interval=1d&range=1d`,
        { headers: YAHOO_HEADERS }
      );
      if(r.ok) {
        const j = await r.json();
        const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
        const sym = tickersEUA[0];
        if(p) {
          resultado[sym] = parseFloat(p);
          tickersFaltando.splice(tickersFaltando.indexOf(sym), 1);
          if(fundamental) {
            resultado[`${sym}_fund`] = {
              pl  : j?.chart?.result?.[0]?.meta?.trailingPE ?? null,
              roe : null, dy: null, pvpa: null,
            };
          }
        }
      }
    } catch(_) {}

    // Para os demais tickers EUA individualmente via query2
    for(const ticker of tickersFaltando) {
      if(resultado[ticker]) continue;

      // Tentativa A: query2 v8/chart
      try {
        const r = await fetch(
          `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
          { headers: YAHOO_HEADERS }
        );
        if(r.ok) {
          const j = await r.json();
          const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if(p) { resultado[ticker] = parseFloat(p); continue; }
        }
      } catch(_) {}

      // Tentativa B: query1 v8/chart (fallback)
      try {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
          { headers: YAHOO_HEADERS }
        );
        if(r.ok) {
          const j = await r.json();
          const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if(p) { resultado[ticker] = parseFloat(p); continue; }
        }
      } catch(_) {}

      // Tentativa C: brapi.dev para tickers internacionais (alguns suporta)
      try {
        const r = await fetch(
          `https://brapi.dev/api/quote/${ticker}?token=${BRAPI_TOKEN}`
        );
        if(r.ok) {
          const j = await r.json();
          const p = j?.results?.[0]?.regularMarketPrice;
          if(p) resultado[ticker] = parseFloat(p);
        }
      } catch(_) {}
    }
  }

  return res.status(200).json(resultado);
}

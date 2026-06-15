// api/quotes.js
// Proxy de cotações — brapi.dev (BR) + Yahoo Finance (EUA)

export const config = { runtime: 'edge' };

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
  const tickers = (url.searchParams.get('tickers') || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  const dolar   = url.searchParams.get('dolar') === 'true';
  const resultado = {};

  // ── Dólar ─────────────────────────────────────────────
  if(dolar) {
    try {
      const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
      const j = await r.json();
      const v = parseFloat(j?.USDBRL?.bid || 0);
      if(v > 0) resultado['USD-BRL'] = v;
    } catch(_) {}
  }

  if(!tickers.length) {
    return new Response(JSON.stringify(resultado), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }

  // ── Separar BR (tem número) de EUA (só letras) ────────
  const tickersBR  = tickers.filter(t => /\d/.test(t));
  const tickersEUA = tickers.filter(t => /^[A-Z]{1,6}$/.test(t) && !/\d/.test(t));

  // ── Cotações BR — tentar múltiplas fontes ─────────────
  if(tickersBR.length) {

    // Fonte 1: brapi.dev com User-Agent de browser real
    let brapiOk = false;
    try {
      const r = await fetch(
        `https://brapi.dev/api/quote/${tickersBR.join(',')}?token=anonymous&fundamental=false&dividends=false`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Referer': 'https://brapi.dev/',
          }
        }
      );
      if(r.ok) {
        const j = await r.json();
        if(j.results?.length) {
          brapiOk = true;
          j.results.forEach(i => {
            if(i.symbol && i.regularMarketPrice) {
              resultado[i.symbol.toUpperCase()] = parseFloat(i.regularMarketPrice);
            }
          });
        }
      }
    } catch(_) {}

    // Fonte 2: Yahoo Finance para BR (adiciona .SA)
    if(!brapiOk || tickersBR.some(t => !resultado[t])) {
      const faltandoBR = tickersBR.filter(t => !resultado[t]);
      for(const ticker of faltandoBR) {
        try {
          const r = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.SA?interval=1d&range=1d`,
            { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
          );
          if(!r.ok) continue;
          const j = await r.json();
          const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if(p) resultado[ticker] = parseFloat(p);
        } catch(_) {}
      }
    }

    // Fonte 3: Yahoo Finance via v7 (endpoint alternativo)
    const aindaFaltando = tickersBR.filter(t => !resultado[t]);
    if(aindaFaltando.length) {
      try {
        const symbols = aindaFaltando.map(t => `${t}.SA`).join(',');
        const r = await fetch(
          `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        if(r.ok) {
          const j = await r.json();
          (j?.quoteResponse?.result || []).forEach(i => {
            const ticker = i.symbol?.replace('.SA','');
            if(ticker && i.regularMarketPrice) {
              resultado[ticker] = parseFloat(i.regularMarketPrice);
            }
          });
        }
      } catch(_) {}
    }
  }

  // ── Cotações EUA — Yahoo Finance ──────────────────────
  if(tickersEUA.length) {
    try {
      const symbols = tickersEUA.join(',');
      const r = await fetch(
        `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if(r.ok) {
        const j = await r.json();
        (j?.quoteResponse?.result || []).forEach(i => {
          if(i.symbol && i.regularMarketPrice) {
            resultado[i.symbol.toUpperCase()] = parseFloat(i.regularMarketPrice);
          }
        });
      }
    } catch(_) {}

    // Fallback individual para EUA não encontrados
    const faltandoEUA = tickersEUA.filter(t => !resultado[t]);
    for(const ticker of faltandoEUA) {
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
  }

  return new Response(JSON.stringify(resultado), {
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

// api/quotes.js — FinZen
// Proxy de cotações: Yahoo Finance v7 para BR (.SA) e EUA

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
  const tickers = (url.searchParams.get('tickers') || '')
    .split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  const dolar   = url.searchParams.get('dolar') === 'true';
  const resultado = {};

  // ── Dólar ─────────────────────────────────────────────
  if(dolar) {
    try {
      const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if(r.ok) {
        const j = await r.json();
        const v = parseFloat(j?.USDBRL?.bid || 0);
        if(v > 0) resultado['USD-BRL'] = v;
      }
    } catch(_) {}
  }

  if(!tickers.length) {
    return new Response(JSON.stringify(resultado), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }

  // ── Separar BR (tem número) de EUA (só letras) ────────
  const tickersBR  = tickers.filter(t => /\d/.test(t));
  const tickersEUA = tickers.filter(t => !/\d/.test(t));

  // ── Yahoo Finance v7 em lote (BR com .SA + EUA juntos) ─
  // Estratégia: uma única chamada com todos os symbols
  const symbolsBR  = tickersBR.map(t => `${t}.SA`);
  const symbolsEUA = tickersEUA;
  const todosSymbols = [...symbolsBR, ...symbolsEUA];

  if(todosSymbols.length) {
    try {
      const url2 = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${todosSymbols.join(',')}&fields=regularMarketPrice,symbol`;
      const r = await fetch(url2, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Cookie': 'A1=d=AQABBHs...; A3=d=AQABBHs...',
        }
      });
      if(r.ok) {
        const j = await r.json();
        (j?.quoteResponse?.result || []).forEach(i => {
          if(!i.regularMarketPrice) return;
          // Remove .SA do símbolo para BR
          const ticker = (i.symbol || '').replace('.SA', '');
          resultado[ticker] = parseFloat(i.regularMarketPrice);
        });
      }
    } catch(_) {}

    // Fallback: query2 se query1 falhar
    const faltando = todosSymbols.filter(s => {
      const t = s.replace('.SA','');
      return !resultado[t];
    });

    if(faltando.length) {
      try {
        const url3 = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${faltando.join(',')}`;
        const r = await fetch(url3, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/json',
          }
        });
        if(r.ok) {
          const j = await r.json();
          (j?.quoteResponse?.result || []).forEach(i => {
            if(!i.regularMarketPrice) return;
            const ticker = (i.symbol || '').replace('.SA', '');
            if(!resultado[ticker]) resultado[ticker] = parseFloat(i.regularMarketPrice);
          });
        }
      } catch(_) {}
    }
  }

  // ── Fallback final: brapi.dev para BR ainda sem cotação ─
  const brSemCot = tickersBR.filter(t => !resultado[t]);
  if(brSemCot.length) {
    try {
      const r = await fetch(
        `https://brapi.dev/api/quote/${brSemCot.join(',')}?token=anonymous`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          }
        }
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

  return new Response(JSON.stringify(resultado), {
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

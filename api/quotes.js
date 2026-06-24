// api/quotes.js — Proxy de cotações
// Node.js serverless (não Edge — Edge bloqueia chamadas externas)
// GET /api/quotes?tickers=PETR4,AAPL&dolar=true

export default async function handler(req, res) {

  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=300'); // cache 5 min no browser

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { tickers: tickersRaw, dolar, fundamental } = req.query;
  const tickers = (tickersRaw || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  const resultado = {};

  const BRAPI_TOKEN = process.env.BRAPI_TOKEN || 'bGZu7dGPyW94PcfXVCiA7t';

  // ── Dólar — brapi primário + awesomeapi fallback ─────────────────────────
  if (dolar === 'true') {
    // Primário: brapi.dev
    try {
      const r = await fetch(
        `https://brapi.dev/api/v2/currency?currency=USD-BRL&token=${BRAPI_TOKEN}`
      );
      if (r.ok) {
        const j = await r.json();
        const v = parseFloat(j?.currency?.[0]?.bidPrice || 0);
        if (v > 0) resultado['USD-BRL'] = v;
      }
    } catch (_) {}

    // Fallback: AwesomeAPI
    if (!resultado['USD-BRL']) {
      try {
        const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
        if (r.ok) {
          const j = await r.json();
          const v = parseFloat(j?.USDBRL?.bid || 0);
          if (v > 0) resultado['USD-BRL'] = v;
        }
      } catch (_) {}
    }
  }

  if (!tickers.length) {
    return res.status(200).json(resultado);
  }

  // ── Separar BR de EUA ─────────────────────────────────────────────────────
  // BR: contém número (PETR4, BBAS3, MXRF11...)
  // EUA: só letras A-Z, 1 a 5 caracteres (AAPL, VTI...)
  const tickersBR  = tickers.filter(t => /\d/.test(t));
  const tickersEUA = tickers.filter(t => /^[A-Z]{1,5}$/.test(t));

  // ── Cotações BR — brapi.dev (1 ativo por req no plano free → paralelo) ────
  if (tickersBR.length) {
    const fundParams = fundamental === 'true' ? '&fundamental=true' : '';
    const fetchBR = async (ticker) => {
      try {
        const r = await fetch(
          `https://brapi.dev/api/quote/${ticker}?token=${BRAPI_TOKEN}${fundParams}`,
          { headers: { 'User-Agent': 'FinZen/1.0' } }
        );
        if (!r.ok) return null;
        const j = await r.json();
        return j.results?.[0] || null;
      } catch (_) { return null; }
    };

    const resBR = await Promise.allSettled(
      [...new Set(tickersBR)].map(t => fetchBR(t))
    );
    resBR.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        const i = r.value;
        if (i.symbol && i.regularMarketPrice) {
          const key = i.symbol.toUpperCase();
          resultado[key] = parseFloat(i.regularMarketPrice);
          if (fundamental === 'true') {
            resultado[`${key}_fund`] = {
              nome:          i.longName || i.shortName || '',
              setor:         i.sector   || '',
              pl:            i.priceEarnings              ?? null,
              pvp:           i.priceToBook                ?? null,
              dy:            i.dividendYield              ?? null,
              roe:           i.returnOnEquity             ?? null,
              margemLiquida: i.netMargin                  ?? null,
              lpa:           i.earningsPerShare           ?? null,
              vpa:           i.bookValuePerShare          ?? null,
              varPct:        i.regularMarketChangePercent ?? null,
              maxAnual:      i.fiftyTwoWeekHigh           ?? null,
              minAnual:      i.fiftyTwoWeekLow            ?? null,
              volumeMedio:   i.averageDailyVolume3Month   ?? null,
              marketCap:     i.marketCap                  ?? null,
            };
          }
        }
      }
    });
  }

  // ── Cotações EUA — Yahoo Finance (paralelo, com timeout e fallback query2) ─
  if (tickersEUA.length) {
    const YAHOO_TIMEOUT_MS = 5000;

    const fetchYahoo = async (ticker) => {
      const endpoints = [
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
        `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
      ];
      for (const url of endpoints) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), YAHOO_TIMEOUT_MS);
          const r = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (!r.ok) continue;
          const j = await r.json();
          const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (p) return { ticker, price: parseFloat(p) };
        } catch (_) {}
      }
      return null;
    };

    const resultados = await Promise.allSettled(
      [...new Set(tickersEUA)].map(t => fetchYahoo(t))
    );
    resultados.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        resultado[r.value.ticker] = r.value.price;
      }
    });
  }

  // ── Fallback brapi para tickers EUA que não vieram do Yahoo ──────────────
  const faltando = tickers.filter(t => !resultado[t] && t !== 'USD-BRL');
  if (faltando.length) {
    try {
      const lista = [...new Set(faltando)].join(',');
      const r = await fetch(
        `https://brapi.dev/api/quote/${lista}?token=${BRAPI_TOKEN}`,
        { headers: { 'User-Agent': 'FinZen/1.0' } }
      );
      if (r.ok) {
        const j = await r.json();
        (j.results || []).forEach(i => {
          if (i.symbol && i.regularMarketPrice && !resultado[i.symbol.toUpperCase()]) {
            resultado[i.symbol.toUpperCase()] = parseFloat(i.regularMarketPrice);
          }
        });
      }
    } catch (_) {}
  }

  return res.status(200).json(resultado);
}

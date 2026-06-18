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

  // Token brapi via variável de ambiente (nunca exposto no código)
  const BRAPI_TOKEN = process.env.BRAPI_TOKEN || 'anonymous';

  // ── Dólar ─────────────────────────────────────────────────────────────────
  if (dolar === 'true') {
    try {
      const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
      const j = await r.json();
      const v = parseFloat(j?.USDBRL?.bid || 0);
      if (v > 0) resultado['USD-BRL'] = v;
    } catch (_) {}
  }

  if (!tickers.length) {
    return res.status(200).json(resultado);
  }

  // ── Separar BR de EUA ─────────────────────────────────────────────────────
  // BR: contém número (PETR4, BBAS3, MXRF11...)
  // EUA: só letras A-Z, 1 a 5 caracteres (AAPL, VTI...)
  const tickersBR  = tickers.filter(t => /\d/.test(t));
  const tickersEUA = tickers.filter(t => /^[A-Z]{1,5}$/.test(t));

  // ── Cotações BR — brapi.dev ───────────────────────────────────────────────
  if (tickersBR.length) {
    try {
      const lista = [...new Set(tickersBR)].join(',');
      const params = fundamental === 'true' ? '&fundamental=true' : '';
      const r = await fetch(
        `https://brapi.dev/api/quote/${lista}?token=${BRAPI_TOKEN}${params}`,
        { headers: { 'User-Agent': 'FinZen/1.0' } }
      );
      if (r.ok) {
        const j = await r.json();
        (j.results || []).forEach(i => {
          if (i.symbol && i.regularMarketPrice) {
            resultado[i.symbol.toUpperCase()] = parseFloat(i.regularMarketPrice);
          }
        });
      }
    } catch (_) {}
  }

  // ── Cotações EUA — Yahoo Finance ──────────────────────────────────────────
  for (const ticker of [...new Set(tickersEUA)]) {
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (!r.ok) continue;
      const j = await r.json();
      const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (p) resultado[ticker] = parseFloat(p);
    } catch (_) {}
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

// scripts/cotacao-fim-dia.js — Cotações de fechamento + atualização do banco
// Roda no GitHub Actions (Node 20, fetch nativo). Sem dependências externas.
// Chama o proxy Vercel (já tem BRAPI_TOKEN) — sem novos secrets necessários.
// Usa SUPABASE_SERVICE_KEY para contornar RLS.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID      = process.env.TELEGRAM_CHAT_ID;
const VERCEL_URL   = 'https://finzen-rho.vercel.app';

// Mesma classificação de investments.js
const TIPOS_BR  = ['acao_br', 'fii', 'etf_br'];
const TIPOS_EUA = ['acao_eua', 'etf_eua'];
function isBR(tipo)  { return TIPOS_BR.includes(tipo); }
function isEUA(tipo) { return TIPOS_EUA.includes(tipo); }
function isRF(tipo)  { return tipo === 'renda_fixa'; }

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase GET ${r.status}: ${await r.text()}`);
  return r.json();
}

async function sbPatch(table, filter, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase PATCH ${r.status}: ${await r.text()}`);
}

// ── Cotações via proxy Vercel (já tem BRAPI_TOKEN) ────────────────────────────
// CORS não se aplica a Node.js — chamada HTTPS direta funciona normalmente.

async function buscarCotacoes(tickers) {
  const params = new URLSearchParams({
    tickers: tickers.join(','),
    dolar:  'true',
    change: 'true',   // retorna TICKER_chg com % variação do dia
  });
  const r = await fetch(`${VERCEL_URL}/api/quotes?${params}`, {
    headers: { 'User-Agent': 'FinZen-GH-Actions/1.0' },
  });
  if (!r.ok) throw new Error(`Proxy cotações ${r.status}`);
  return r.json();
}

// ── Utilitários ────────────────────────────────────────────────────────────────

function fmt(v, dec = 2) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function varEmoji(pct) {
  if (pct > 0.05)  return '📈';
  if (pct < -0.05) return '📉';
  return '➡️';
}

// ── Telegram ──────────────────────────────────────────────────────────────────

async function enviarTelegram(mensagem) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text: mensagem, parse_mode: 'HTML' }),
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${await r.text()}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dataFmt = new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  });
  console.log(`Cotações de fechamento — ${dataFmt}`);

  // 1. Busca ativos negociáveis
  const todos = await sbGet(
    'investments?ativo=eq.true&select=id,ticker,tipo,moeda,quantidade,cotacao_atual,corretora,exchange_rate'
  );
  const ativos = todos.filter(a => !isRF(a.tipo));
  if (!ativos.length) { console.log('Nenhum ativo negociável. Encerrando.'); return; }

  // 2. Monta lista de tickers únicos por mercado
  const tickersBR  = [...new Set(ativos.filter(a => isBR(a.tipo)).map(a => a.ticker.toUpperCase()))];
  const tickersEUA = [...new Set(ativos.filter(a => isEUA(a.tipo)).map(a => a.ticker.toUpperCase()))];
  const allTickers = [...tickersBR, ...tickersEUA];
  if (!allTickers.length) { console.log('Sem tickers para buscar.'); return; }

  // 3. Busca cotações + variação do dia
  const quotes = await buscarCotacoes(allTickers);
  const dolar = quotes['USD-BRL'] || 0;
  console.log(`USD-BRL: ${dolar}, tickers: ${allTickers.join(', ')}`);

  // 4. Atualiza banco e agrupa dados para a mensagem
  const agora = new Date().toISOString();
  const grupos = {};   // { corretora: [{ ticker, cotacao, moeda, changePct, deltaBRL }] }
  let deltaTotal = 0;
  let deltaValido = true; // false se algum ativo não tinha cotacao_atual prévia

  for (const a of ativos) {
    const key = a.ticker.toUpperCase();
    const novaCotacao = quotes[key];
    if (!novaCotacao) { console.warn(`Sem cotação para ${key} — pulando`); continue; }

    const changePct  = quotes[`${key}_chg`] ?? null;  // % do dia, vem da API
    const moeda      = a.moeda || 'BRL';
    const fx         = moeda === 'USD' ? (dolar || 1) : 1;
    const qtd        = Number(a.quantidade);

    // Delta: usa changePct da API quando disponível (mais preciso que comparar com DB)
    if (changePct !== null && dolar > 0) {
      deltaTotal += (changePct / 100) * novaCotacao * qtd * fx;
    } else {
      deltaValido = false; // ao menos um ativo sem variação — não exibe total
    }

    // Grava no banco: cotacao_atual, atualizado_em, valor_atual_brl, exchange_rate (USD)
    const patch = {
      cotacao_atual:   novaCotacao,
      atualizado_em:   agora,
      valor_atual_brl: novaCotacao * qtd * fx,
    };
    if (moeda === 'USD' && dolar > 0) patch.exchange_rate = dolar;

    await sbPatch('investments', `id=eq.${a.id}`, patch);

    // Acumula para mensagem
    const corretora = a.corretora || 'Outros';
    if (!grupos[corretora]) grupos[corretora] = [];
    grupos[corretora].push({ ticker: key, cotacao: novaCotacao, moeda, changePct });
  }

  // 5. Monta mensagem Telegram
  const linhas = [`📊 <b>Carteira — ${dataFmt}</b>`];
  if (dolar > 0) linhas.push(`💵 USD/BRL: R$ ${fmt(dolar, 4)}`);
  linhas.push('');

  for (const corretora of Object.keys(grupos).sort()) {
    linhas.push(`<b>${corretora}</b>`);
    for (const a of grupos[corretora].sort((x, y) => x.ticker.localeCompare(y.ticker))) {
      const simbolo = a.moeda === 'USD' ? 'US$' : 'R$';
      const cotStr  = `${simbolo} ${fmt(a.cotacao)}`;
      const varStr  = a.changePct !== null
        ? `${varEmoji(a.changePct)} ${a.changePct >= 0 ? '+' : ''}${fmt(a.changePct)}%`
        : '➡️ —';
      linhas.push(`• ${a.ticker}  ${cotStr}  ${varStr}`);
    }
    linhas.push('');
  }

  if (deltaValido && deltaTotal !== 0) {
    const sinal = deltaTotal >= 0 ? '+' : '';
    const emoji = deltaTotal > 0 ? '📈' : '📉';
    linhas.push(`${emoji} <b>Hoje: ${sinal}R$ ${fmt(Math.abs(deltaTotal))}</b>`);
  }

  await enviarTelegram(linhas.join('\n').trim());
  console.log(`✓ Enviado — ${ativos.length} ativo(s) atualizados`);
}

main().catch(err => { console.error(err.message); process.exit(1); });

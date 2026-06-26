// scripts/aviso-vencimento.js — Aviso diário de vencimentos via Telegram
// Roda no GitHub Actions (Node 20, fetch nativo). Sem dependências externas.
// Usa anon key + funções RPC SECURITY DEFINER (sem service key necessária).
// Telegram via proxy Vercel (token fica no env var do Vercel, não no GitHub).

const SUPABASE_URL = 'https://qgamphwnlrriwalcbhbl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnYW1waHdubHJyaXdhbGNiaGJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNTkzMzUsImV4cCI6MjA5NjYzNTMzNX0.AV0mCZqYlNyqz9XVWeHImMljnpt4klxpUjBa1HHlYkM';
const VERCEL_URL   = 'https://finzen-rho.vercel.app';

// ── Utilitários ────────────────────────────────────────────────────────────────

function hojePartes() {
  const dataStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [ano, mes, dia] = dataStr.split('-');
  return { dataStr, dia: Number(dia), ref: `${ano}-${mes}` };
}

function fmt(valor) {
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Supabase RPC helper ───────────────────────────────────────────────────────

async function sbRpc(fn, params) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  if (!r.ok) throw new Error(`Supabase RPC ${fn} ${r.status}: ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : [];
}

// ── Seção 1: Despesas pendentes com date = hoje ────────────────────────────────

async function buscarDespesas(dataStr) {
  return sbRpc('aviso_get_despesas', { p_data: dataStr });
}

// ── Seção 2: Faturas de cartão com vencimento_dia = hoje ──────────────────────

async function buscarFaturas(dia, ref) {
  const cartoes = await sbRpc('aviso_get_cartoes_hoje', { p_dia: dia });
  if (!cartoes.length) return [];

  const ids = cartoes.map(c => c.id);
  const txs = await sbRpc('aviso_get_faturas_cartao', { p_ids: ids, p_ref: ref });

  const totais = {};
  txs.forEach(t => {
    totais[t.card_id] = (totais[t.card_id] || 0) + Number(t.valor_parcela);
  });

  return cartoes
    .filter(c => (totais[c.id] || 0) > 0)
    .map(c => ({ nome: c.nome, total: totais[c.id] }));
}

// ── Telegram via proxy Vercel ─────────────────────────────────────────────────

async function enviarTelegram(mensagem) {
  const r = await fetch(`${VERCEL_URL}/api/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'FinZen-GH-Actions/1.0' },
    body: JSON.stringify({ message: mensagem }),
  });
  if (!r.ok) throw new Error(`Telegram proxy ${r.status}: ${await r.text()}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { dataStr, dia, ref } = hojePartes();
  console.log(`Verificando ${dataStr} (fatura_referencia ${ref}, dia ${dia})...`);

  const [despesas, faturas] = await Promise.all([
    buscarDespesas(dataStr),
    buscarFaturas(dia, ref),
  ]);

  if (!despesas.length && !faturas.length) {
    console.log('Nada vence hoje. Mensagem não enviada.');
    return;
  }

  const secoes = [];

  if (despesas.length) {
    const total = despesas.reduce((s, t) => s + Number(t.amount), 0);
    const lista = despesas.map(t => `• ${t.description} — R$ ${fmt(t.amount)}`).join('\n');
    secoes.push(`💸 <b>Despesas vencendo hoje</b>\n${lista}\n<b>Total: R$ ${fmt(total)}</b>`);
  }

  if (faturas.length) {
    const lista = faturas.map(f => `• ${f.nome} — R$ ${fmt(f.total)}`).join('\n');
    secoes.push(`💳 <b>Faturas vencendo hoje</b>\n${lista}`);
  }

  const dataFmt = dataStr.split('-').reverse().join('/');
  const mensagem = `📅 <b>${dataFmt}</b>\n\n` + secoes.join('\n\n');

  await enviarTelegram(mensagem);
  console.log(`✓ Enviado — ${despesas.length} despesa(s), ${faturas.length} fatura(s)`);
}

main().catch(err => { console.error(err.message); process.exit(1); });

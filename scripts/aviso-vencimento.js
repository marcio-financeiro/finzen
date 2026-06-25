// scripts/aviso-vencimento.js — Aviso diário de vencimentos via Telegram
// Roda no GitHub Actions (Node 20, fetch nativo). Sem dependências externas.
// Usa SUPABASE_SERVICE_KEY para contornar RLS (script server-side, sem sessão de usuário).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID      = process.env.TELEGRAM_CHAT_ID;

// ── Utilitários ────────────────────────────────────────────────────────────────

function hojePartes() {
  // Garante data em São Paulo (UTC-3), formato YYYY-MM-DD
  const dataStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [ano, mes, dia] = dataStr.split('-');
  return { dataStr, dia: Number(dia), ref: `${ano}-${mes}` };
}

function fmt(valor) {
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Supabase REST helper ───────────────────────────────────────────────────────

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

// ── Seção 1: Despesas pendentes com date = hoje ────────────────────────────────

async function buscarDespesas(dataStr) {
  return sbGet(
    `transactions?status=eq.pendente&type=eq.despesa&date=eq.${dataStr}&select=description,amount`
  );
}

// ── Seção 2: Faturas de cartão com vencimento_dia = hoje ──────────────────────
// Lógica: cartões com vencimento_dia = diaHoje → fatura_referencia = mês atual
// (mesma regra do dashboard.js renderFaturas — vencimento_dia === diaHoje nunca avança mês)

async function buscarFaturas(dia, ref) {
  // 1. Cartões ativos com vencimento hoje
  const cartoes = await sbGet(
    `credit_cards?vencimento_dia=eq.${dia}&ativo=eq.true&select=id,nome`
  );
  if (!cartoes.length) return [];

  // 2. Transações abertas/pendentes da fatura deste mês para esses cartões
  const ids = cartoes.map(c => c.id).join(',');
  const txs = await sbGet(
    `card_transactions?card_id=in.(${ids})&fatura_referencia=eq.${ref}&status=in.(aberta,pendente)&select=card_id,valor_parcela`
  );

  // 3. Agrupa por cartão e filtra cartões com saldo > 0
  const totais = {};
  txs.forEach(t => {
    totais[t.card_id] = (totais[t.card_id] || 0) + Number(t.valor_parcela);
  });

  return cartoes
    .filter(c => (totais[c.id] || 0) > 0)
    .map(c => ({ nome: c.nome, total: totais[c.id] }));
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

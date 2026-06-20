// api/telegram-webhook.js — FinZen Assessor Telegram (bidirecional)
// Registrar webhook: GET /api/telegram-webhook?setup=1

const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID    = process.env.TELEGRAM_CHAT_ID;
const SB_URL     = process.env.SUPABASE_URL;
const SB_KEY     = process.env.SUPABASE_SERVICE_KEY;
const USER_ID    = process.env.FINZEN_USER_ID;

// ── Supabase REST helpers ────────────────────────────────────────────────────
const sbHeaders = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

async function sbGet(table, qs = '') {
  const r = await fetch(
    `${SB_URL}/rest/v1/${table}?user_id=eq.${USER_ID}${qs ? '&' + qs : ''}`,
    { headers: sbHeaders }
  );
  return r.json();
}

async function sbPost(table, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  });
  return r.status;
}

async function sbPatch(table, id, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}&user_id=eq.${USER_ID}`, {
    method: 'PATCH',
    headers: sbHeaders,
    body: JSON.stringify(body),
  });
  return r.status;
}

// ── Telegram helper ──────────────────────────────────────────────────────────
async function enviar(texto) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text: texto, parse_mode: 'HTML' }),
  });
}

function normalizar(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function fmt(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hoje() {
  return new Date().toISOString().split('T')[0];
}

// ── Comandos ─────────────────────────────────────────────────────────────────
async function cmdAjuda() {
  await enviar(
    `🤖 <b>FinZen · Assessor</b>\n\n` +
    `<b>Lançamentos:</b>\n` +
    `  <code>despesa 50 café</code>\n` +
    `  <code>despesa 50 café @nubank</code>\n` +
    `  <code>d 50 café @itaú</code>  (atalho)\n` +
    `  <code>r 1000 salário @nubank</code>  (atalho)\n\n` +
    `<b>Consultas:</b>\n` +
    `  <code>saldo</code> — saldos das contas\n` +
    `  <code>extrato</code> — últimas 10 movimentações\n` +
    `  <code>resumo</code> — receitas e despesas do mês`
  );
}

async function cmdSaldo() {
  const contas = await sbGet('accounts', 'active=eq.true&order=sort_order.asc,nome.asc');
  if (!Array.isArray(contas) || !contas.length) {
    await enviar('Nenhuma conta ativa encontrada.'); return;
  }
  const total = contas.reduce((s, a) => s + Number(a.saldo_atual || 0), 0);
  const lista  = contas.map(a => `🏦 ${a.nome}: <b>R$ ${fmt(a.saldo_atual)}</b>`).join('\n');
  await enviar(`💳 <b>Saldos</b>\n\n${lista}\n\n💰 Total: <b>R$ ${fmt(total)}</b>`);
}

async function cmdExtrato() {
  const txs = await sbGet(
    'transactions',
    'select=date,type,description,amount,status&order=date.desc,created_at.desc&limit=10'
  );
  if (!Array.isArray(txs) || !txs.length) {
    await enviar('Nenhuma movimentação encontrada.'); return;
  }
  const lista = txs.map(t => {
    const emoji = t.type === 'receita' ? '💰' : t.type === 'despesa' ? '💸' : '🔄';
    const data  = (t.date || '').split('T')[0];
    return `${emoji} ${data} — ${t.description} — <b>R$ ${fmt(t.amount)}</b>`;
  }).join('\n');
  await enviar(`📋 <b>Extrato recente</b>\n\n${lista}`);
}

async function cmdResumo() {
  const agora    = new Date();
  const ano      = agora.getFullYear();
  const mesNum   = agora.getMonth() + 1;
  const mesLabel = `${ano}-${String(mesNum).padStart(2, '0')}`;
  const inicio   = `${mesLabel}-01`;
  // Primeiro dia do próximo mês como limite superior (exclusive)
  const proxMes  = mesNum === 12 ? 1 : mesNum + 1;
  const proxAno  = mesNum === 12 ? ano + 1 : ano;
  const proximo  = `${proxAno}-${String(proxMes).padStart(2, '0')}-01`;

  const txs = await sbGet('transactions', `date=gte.${inicio}&date=lt.${proximo}`);
  if (!Array.isArray(txs)) { await enviar('Erro ao consultar resumo.'); return; }

  const receitas = txs.filter(t => t.type === 'receita').reduce((s, t) => s + Number(t.amount || 0), 0);
  const despesas = txs.filter(t => t.type === 'despesa').reduce((s, t) => s + Number(t.amount || 0), 0);
  const saldo    = receitas - despesas;

  await enviar(
    `📊 <b>Resumo — ${mesLabel}</b>\n\n` +
    `💰 Receitas: <b>R$ ${fmt(receitas)}</b>\n` +
    `💸 Despesas: <b>R$ ${fmt(despesas)}</b>\n` +
    `${saldo >= 0 ? '✅' : '🔴'} Resultado: <b>R$ ${fmt(saldo)}</b>`
  );
}

async function cmdLancar(tipo, textoOriginal) {
  // Sintaxe: "despesa 50 café @nubank" ou "d 50 café" (usa primeira conta)
  const partes = textoOriginal.trim().split(/\s+/);
  partes.shift(); // remove "despesa" | "d" | "receita" | "r"

  const valor = parseFloat((partes.shift() || '').replace(',', '.'));
  if (!valor || valor <= 0 || isNaN(valor)) {
    await enviar(`❌ Valor inválido.\nEx: <code>${tipo} 50 descrição @conta</code>`);
    return;
  }

  // Separar @conta da descrição (se houver)
  let contaBusca = null;
  const filtrado = partes.filter(p => {
    if (p.startsWith('@')) { contaBusca = p.slice(1).toLowerCase(); return false; }
    return true;
  });
  const descricao = filtrado.join(' ').trim() || (tipo === 'despesa' ? 'Despesa' : 'Receita');

  // Buscar contas ativas
  const todasContas = await sbGet('accounts', 'active=eq.true&order=sort_order.asc,nome.asc');
  if (!Array.isArray(todasContas) || !todasContas.length) {
    await enviar('Nenhuma conta ativa encontrada.'); return;
  }

  let conta = null;
  if (contaBusca) {
    conta = todasContas.find(c => normalizar(c.nome).includes(normalizar(contaBusca)));
    if (!conta) {
      const lista = todasContas.map(c => `• @${normalizar(c.nome.split(' ')[0])} → ${c.nome}`).join('\n');
      await enviar(`❌ Conta "@${contaBusca}" não encontrada.\n\nContas disponíveis:\n${lista}`);
      return;
    }
  } else {
    // Sem @conta: usa a segunda conta ativa (sort_order 1) como padrão mais comum
    // Se só tiver uma, usa ela
    conta = todasContas.find(c => c.sort_order >= 1) || todasContas[0];
  }

  await sbPost('transactions', {
    user_id:     USER_ID,
    account_id:  conta.id,
    type:        tipo,
    amount:      valor,
    description: descricao,
    date:        hoje(),
    status:      'pago',
  });

  const novoSaldo = Number(conta.saldo_atual || 0) + (tipo === 'receita' ? valor : -valor);
  await sbPatch('accounts', conta.id, { saldo_atual: novoSaldo });

  const emoji = tipo === 'receita' ? '💰' : '💸';
  const sinal = tipo === 'receita' ? '+' : '-';
  await enviar(
    `${emoji} <b>Lançado!</b>\n\n` +
    `📝 ${descricao}\n` +
    `💵 R$ ${sinal}${fmt(valor)}\n` +
    `🏦 ${conta.nome}\n` +
    `💳 Novo saldo: <b>R$ ${fmt(novoSaldo)}</b>`
  );
}

// ── Processador principal ────────────────────────────────────────────────────
async function processar(message) {
  const raw   = (message.text || '').trim();
  const texto = raw.toLowerCase();

  if (!raw) { await cmdAjuda(); return; }

  if (['/start', '/ajuda', 'ajuda', 'help'].includes(texto)) {
    await cmdAjuda();
  } else if (['saldo', '/saldo'].includes(texto)) {
    await cmdSaldo();
  } else if (['extrato', '/extrato'].includes(texto)) {
    await cmdExtrato();
  } else if (['resumo', '/resumo'].includes(texto)) {
    await cmdResumo();
  } else if (/^(despesa|d) /i.test(texto)) {
    await cmdLancar('despesa', raw);
  } else if (/^(receita|r) /i.test(texto)) {
    await cmdLancar('receita', raw);
  } else {
    await enviar(`❓ Não entendi "<i>${raw}</i>".\nDigite <code>ajuda</code> para ver os comandos.`);
  }
}

// ── Handler principal ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Setup: registrar webhook no Telegram
  if (req.method === 'GET' && req.query?.setup === '1') {
    const url = `https://${req.headers.host}/api/telegram-webhook`;
    const r   = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${url}`);
    return res.status(200).json(await r.json());
  }

  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const { message } = req.body || {};

  // Segurança: só aceita mensagens do chat correto
  if (message && String(message.chat?.id) === String(CHAT_ID)) {
    try {
      await processar(message);
    } catch (e) {
      await enviar('⚠️ Erro interno: ' + e.message).catch(() => {});
    }
  }

  res.status(200).json({ ok: true });
}

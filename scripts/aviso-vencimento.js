// scripts/aviso-vencimento.js — Aviso diário de vencimentos via Telegram
// Roda no GitHub Actions (Node 20, fetch nativo). Sem dependências externas.
// Usa SUPABASE_SERVICE_KEY para contornar RLS (script server-side, sem sessão de usuário).

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const BOT_TOKEN     = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID       = process.env.TELEGRAM_CHAT_ID;

function hoje() {
  // Garante a data em São Paulo (UTC-3), formato YYYY-MM-DD
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function fmt(valor) {
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function buscarPendentes(data) {
  const url =
    `${SUPABASE_URL}/rest/v1/transactions` +
    `?status=eq.pendente&type=eq.despesa&date=eq.${data}&select=description,amount`;
  const r = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

async function enviarTelegram(mensagem) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text: mensagem, parse_mode: 'HTML' }),
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${await r.text()}`);
}

async function main() {
  const data = hoje();
  console.log(`Verificando vencimentos para ${data}...`);

  const transacoes = await buscarPendentes(data);

  if (!transacoes.length) {
    console.log('Nenhuma despesa pendente hoje. Mensagem não enviada.');
    return;
  }

  const total = transacoes.reduce((s, t) => s + Number(t.amount), 0);
  const lista  = transacoes.map(t => `• ${t.description} — R$ ${fmt(t.amount)}`).join('\n');

  const mensagem =
    `💸 <b>Vencimentos de Hoje</b>\n` +
    `📅 ${data.split('-').reverse().join('/')}\n\n` +
    `${lista}\n\n` +
    `💵 <b>Total: R$ ${fmt(total)}</b>`;

  await enviarTelegram(mensagem);
  console.log(`✓ Mensagem enviada — ${transacoes.length} despesa(s), total R$ ${fmt(total)}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });

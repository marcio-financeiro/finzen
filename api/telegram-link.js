// api/telegram-link.js — Vinculação Telegram ↔ FinZen
// POST { action:'generate', user_id } → gera código
// POST { action:'unlink',   user_id } → desvincula
// GET  ?user_id=xxx                   → status do vínculo

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

const sbH = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

function gerarCodigo() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `FZ-${n}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://finzen-rho.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return res.status(403).json({ error: 'Forbidden' });
  const token = auth.slice(7);
  const authRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_SERVICE_KEY },
  });
  if (!authRes.ok) return res.status(403).json({ error: 'Forbidden' });

  // GET — verificar se usuário já está vinculado
  if (req.method === 'GET') {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id obrigatório' });

    const r = await fetch(`${SB_URL}/rest/v1/telegram_links?user_id=eq.${userId}&select=chat_id,linked_at`, { headers: sbH });
    const data = await r.json();
    const link = data[0] || null;
    return res.status(200).json({ vinculado: !!link, chat_id: link?.chat_id || null, linked_at: link?.linked_at || null });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { action, user_id } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });

  // POST action=generate — gerar código de vinculação
  if (action === 'generate') {
    // Apagar códigos antigos do usuário
    await fetch(`${SB_URL}/rest/v1/telegram_pending?user_id=eq.${user_id}`, {
      method: 'DELETE', headers: sbH,
    });

    const code = gerarCodigo();
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await fetch(`${SB_URL}/rest/v1/telegram_pending`, {
      method: 'POST',
      headers: { ...sbH, Prefer: 'return=minimal' },
      body: JSON.stringify({ code, user_id, expires_at: expires }),
    });

    return res.status(200).json({ code, expires_at: expires });
  }

  // POST action=unlink — desvincular
  if (action === 'unlink') {
    await fetch(`${SB_URL}/rest/v1/telegram_links?user_id=eq.${user_id}`, {
      method: 'DELETE', headers: sbH,
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'action inválida' });
}

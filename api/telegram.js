export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://finzen-rho.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Antes este endpoint era público: qualquer um podia mandar mensagens ao chat.
  // Agora exige o JWT Supabase do usuário, como os endpoints de IA.
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return res.status(403).json({ error: 'Forbidden' });
  const jwt = auth.slice(7);
  const authRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: process.env.SUPABASE_SERVICE_KEY },
  });
  if (!authRes.ok) return res.status(403).json({ error: 'Forbidden' });

  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });

  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({ error: 'Telegram not configured' });
  }

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
    const data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

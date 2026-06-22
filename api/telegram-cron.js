// api/telegram-cron.js — Lembretes de eventos via Telegram
// Vercel Cron: executa a cada hora (0 * * * *)
// Toda hora: lembrete de eventos com hora definida em ~1 hora

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SB_URL    = process.env.SUPABASE_URL;
const SB_KEY    = process.env.SUPABASE_SERVICE_KEY;

const sbHeaders = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

function emojiTipo(tipo) {
  if (tipo === 'saude')      return '🏥';
  if (tipo === 'financeiro') return '💰';
  if (tipo === 'pessoal')    return '🙋';
  return '📅';
}

async function getChatId(userId) {
  const r = await fetch(
    `${SB_URL}/rest/v1/telegram_links?user_id=eq.${userId}&select=chat_id`,
    { headers: sbHeaders }
  );
  const data = await r.json();
  return data[0]?.chat_id || null;
}

async function enviar(chatId, texto) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML' }),
  });
}

// Lembrete 1 hora antes: eventos com hora definida em 50–70 min
async function lembreteUmaHora() {
  const agora = new Date();
  // Janela BRT: agora+50min até agora+70min
  const brtMs = agora.getTime() - 3 * 60 * 60 * 1000;
  const min50 = new Date(brtMs + 50 * 60 * 1000);
  const min70 = new Date(brtMs + 70 * 60 * 1000);

  const dataHj = new Date(brtMs).toISOString().split('T')[0];

  // Se a janela cruzar meia-noite, ignora (evento de madrugada)
  if (min50.toISOString().split('T')[0] !== dataHj) return;

  const h50 = `${String(min50.getUTCHours()).padStart(2,'0')}:${String(min50.getUTCMinutes()).padStart(2,'0')}`;
  const h70 = `${String(min70.getUTCHours()).padStart(2,'0')}:${String(min70.getUTCMinutes()).padStart(2,'0')}`;

  const r = await fetch(
    `${SB_URL}/rest/v1/calendar_events?data_inicio=eq.${dataHj}&status=eq.pendente&hora=gte.${h50}&hora=lte.${h70}&select=user_id,titulo,hora,tipo`,
    { headers: sbHeaders }
  );
  const eventos = await r.json();
  if (!Array.isArray(eventos) || !eventos.length) return;

  for (const e of eventos) {
    const chatId = await getChatId(e.user_id);
    if (!chatId) continue;
    await enviar(chatId,
      `⏰ <b>Lembrete — em 1 hora</b>\n\n${emojiTipo(e.tipo)} ${e.titulo}\n🕐 ${e.hora}`
    );
  }
}

export default async function handler(req, res) {
  // Vercel Cron envia Authorization header com CRON_SECRET
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await lembreteUmaHora();

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('telegram-cron:', e.message);
    res.status(200).json({ ok: true }); // sempre 200 para o Vercel não retentar
  }
}

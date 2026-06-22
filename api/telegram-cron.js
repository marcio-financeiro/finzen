// api/telegram-cron.js — Lembretes de eventos via Telegram
// Vercel Cron: executa uma vez por dia às 11h UTC (08h BRT)
// Envia todos os eventos do dia atual

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SB_URL    = process.env.SUPABASE_URL;
const SB_KEY    = process.env.SUPABASE_SERVICE_KEY;

const sbHeaders = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

function hoje() {
  const d = new Date();
  d.setTime(d.getTime() - 3 * 60 * 60 * 1000); // UTC-3 → BRT
  return d.toISOString().split('T')[0];
}

function formatarData(dateStr) {
  const [ano, mes, dia] = dateStr.split('-');
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${dia}/${meses[parseInt(mes) - 1]}/${ano}`;
}

function emojiTipo(tipo) {
  if (tipo === 'saude')       return '🏥';
  if (tipo === 'financeiro')  return '💰';
  if (tipo === 'compromisso') return '🎯';
  if (tipo === 'tarefa')      return '📋';
  if (tipo === 'offshore')    return '⚓';
  if (tipo === 'manutencao')  return '🔧';
  if (tipo === 'documento')   return '📄';
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

async function lembretesDiarios() {
  const data = hoje();
  const r = await fetch(
    `${SB_URL}/rest/v1/calendar_events?data_inicio=eq.${data}&status=eq.pendente&order=hora.asc&select=user_id,titulo,hora,tipo`,
    { headers: sbHeaders }
  );
  const eventos = await r.json();
  if (!Array.isArray(eventos) || !eventos.length) return;

  // Agrupar por usuário
  const porUsuario = {};
  for (const e of eventos) {
    (porUsuario[e.user_id] = porUsuario[e.user_id] || []).push(e);
  }

  for (const [userId, evts] of Object.entries(porUsuario)) {
    const chatId = await getChatId(userId);
    if (!chatId) continue;

    const lista = evts.map(e => {
      const hora = e.hora ? ` às ${e.hora}` : '';
      return `${emojiTipo(e.tipo)} ${e.titulo}${hora}`;
    }).join('\n');

    await enviar(chatId,
      `📅 <b>Sua agenda de hoje (${formatarData(data)})</b>\n\n${lista}`
    );
  }
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await lembretesDiarios();
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('telegram-cron:', e.message);
    res.status(200).json({ ok: true });
  }
}

// scripts/agenda-diaria.js — Compromissos de hoje e amanhã via Google Calendar
// Roda no GitHub Actions (Node 20, fetch nativo, crypto nativo). Sem dependências externas.
// Autentica como conta de serviço via JWT RS256 — sem googleapis npm.

const crypto = require('crypto');

const SERVICE_ACCOUNT = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
const CALENDAR_ID     = process.env.GOOGLE_CALENDAR_ID;
const BOT_TOKEN       = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID         = process.env.TELEGRAM_CHAT_ID;

// ── JWT RS256 para Google Service Account ─────────────────────────────────────

function b64url(obj) {
  const json = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return Buffer.from(json).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getAccessToken() {
  const { client_email, private_key } = SERVICE_ACCOUNT;
  const now = Math.floor(Date.now() / 1000);

  const header  = b64url({ alg: 'RS256', typ: 'JWT' });
  const payload = b64url({
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(private_key, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const jwt = `${header}.${payload}.${sig}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!r.ok) throw new Error(`Google Auth ${r.status}: ${await r.text()}`);
  const { access_token } = await r.json();
  return access_token;
}

// ── Calendar API ──────────────────────────────────────────────────────────────

// Brasil não tem horário de verão desde 2019 → UTC-3 fixo
// midnight SP = 03:00 UTC → usamos "-03:00" explícito nas queries
function spDateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // "YYYY-MM-DD"
}

async function buscarEventos(token) {
  const hoje   = spDateStr(0);
  const depois = spDateStr(2); // exclusivo: até início do depois de amanhã

  const params = new URLSearchParams({
    timeMin:       `${hoje}T00:00:00-03:00`,
    timeMax:       `${depois}T00:00:00-03:00`,
    singleEvents:  'true',
    orderBy:       'startTime',
    fields:        'items(summary,location,start,end)',
  });

  const r = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) throw new Error(`Google Calendar ${r.status}: ${await r.text()}`);
  const { items } = await r.json();
  return items || [];
}

// ── Formatação ────────────────────────────────────────────────────────────────

// Retorna "YYYY-MM-DD" do evento no fuso SP
function eventDateSp(event) {
  if (event.start.date) return event.start.date;
  return new Date(event.start.dateTime)
    .toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// Retorna "HH:MM" no fuso SP, ou "Dia todo"
function formatHora(event) {
  if (event.start.date) return 'Dia todo';
  return new Date(event.start.dateTime)
    .toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
}

// "2026-06-25" → "qua 25/06"
function formatDiaLabel(dateStr) {
  return new Date(`${dateStr}T12:00:00-03:00`)
    .toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short',
      day:     '2-digit',
      month:   '2-digit',
    }).replace('.', ''); // remove ponto do "qua."
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
  const hoje   = spDateStr(0);
  const amanha = spDateStr(1);
  console.log(`Agenda ${hoje} / ${amanha}`);

  const token  = await getAccessToken();
  const events = await buscarEventos(token);

  // Agrupa por dia
  const porDia = { [hoje]: [], [amanha]: [] };
  for (const ev of events) {
    const d = eventDateSp(ev);
    if (porDia[d]) porDia[d].push(ev);
  }

  const totalEventos = porDia[hoje].length + porDia[amanha].length;
  if (!totalEventos) {
    console.log('Nenhum compromisso hoje nem amanhã. Mensagem não enviada.');
    return;
  }

  const linhas = [`🗓 <b>Agenda</b>`];

  for (const [dia, label] of [[hoje, 'Hoje'], [amanha, 'Amanhã']]) {
    const evs = porDia[dia];
    if (!evs.length) continue;

    linhas.push('');
    linhas.push(`📅 <b>${label}</b> (${formatDiaLabel(dia)})`);

    for (const ev of evs) {
      const hora  = formatHora(ev);
      const local = ev.location ? `  📍 ${ev.location}` : '';
      linhas.push(`• ${hora}  ${ev.summary}${local}`);
    }
  }

  await enviarTelegram(linhas.join('\n'));
  console.log(`✓ Enviado — ${totalEventos} evento(s)`);
}

main().catch(err => { console.error(err.message); process.exit(1); });

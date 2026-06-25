// api/calendar-sync.js — Sincroniza calendar_events ↔ Google Calendar
// Node.js serverless; auth Supabase JWT + JWT RS256 para Google API

import crypto from 'crypto';

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'info.marcio@gmail.com';

// ── JWT RS256 para Google Service Account ─────────────────────────────────────

function b64url(obj) {
  const json = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return Buffer.from(json).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getGoogleToken() {
  const { client_email, private_key } = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);

  const header  = b64url({ alg: 'RS256', typ: 'JWT' });
  const payload = b64url({
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(private_key, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${payload}.${sig}`,
  });
  if (!r.ok) throw new Error(`Google Auth ${r.status}: ${await r.text()}`);
  const { access_token } = await r.json();
  return access_token;
}

// ── Converter evento FinZen → Google Calendar ─────────────────────────────────
// Brasil sem horário de verão desde 2019 → UTC-3 fixo

function nextDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().split('T')[0];
}

function buildGoogleEvent({ titulo, data_inicio, data_fim, hora, local, descricao }) {
  const summary     = titulo;
  const description = descricao || undefined;
  const location    = local     || undefined;

  if (hora) {
    const horaStr  = hora.slice(0, 5);                        // "HH:MM"
    const [hh, mm] = horaStr.split(':').map(Number);
    const endMin   = hh * 60 + mm + 60;                      // +1 hora
    const endDay   = endMin >= 1440 ? nextDay(data_inicio) : data_inicio;
    const endHh    = String(Math.floor(endMin / 60) % 24).padStart(2, '0');
    const endMm    = String(endMin % 60).padStart(2, '0');

    return {
      summary, description, location,
      start: { dateTime: `${data_inicio}T${horaStr}:00-03:00`, timeZone: 'America/Sao_Paulo' },
      end:   { dateTime: `${endDay}T${endHh}:${endMm}:00-03:00`, timeZone: 'America/Sao_Paulo' },
    };
  }

  // Evento de dia inteiro — end.date é exclusivo no Google Calendar
  return {
    summary, description, location,
    start: { date: data_inicio },
    end:   { date: data_fim ? nextDay(data_fim) : nextDay(data_inicio) },
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://finzen-rho.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Autenticação Supabase JWT
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return res.status(403).json({ error: 'Forbidden' });
  const supabaseToken = auth.slice(7);
  const authRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${supabaseToken}`, apikey: process.env.SUPABASE_SERVICE_KEY },
  });
  if (!authRes.ok) return res.status(403).json({ error: 'Forbidden' });

  try {
    const { action, evento, google_event_id } = req.body;
    if (!action) return res.status(400).json({ error: 'action obrigatório' });

    const gToken = await getGoogleToken();
    const base   = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;
    const headers = { Authorization: `Bearer ${gToken}`, 'Content-Type': 'application/json' };

    if (action === 'create') {
      if (!evento) return res.status(400).json({ error: 'evento obrigatório' });
      const r = await fetch(base, {
        method: 'POST', headers,
        body: JSON.stringify(buildGoogleEvent(evento)),
      });
      if (!r.ok) throw new Error(`Google create ${r.status}: ${await r.text()}`);
      const { id } = await r.json();
      return res.status(200).json({ google_event_id: id });
    }

    if (action === 'update') {
      if (!google_event_id) return res.status(400).json({ error: 'google_event_id obrigatório' });
      if (!evento) return res.status(400).json({ error: 'evento obrigatório' });
      const r = await fetch(`${base}/${encodeURIComponent(google_event_id)}`, {
        method: 'PUT', headers,
        body: JSON.stringify(buildGoogleEvent(evento)),
      });
      if (!r.ok) throw new Error(`Google update ${r.status}: ${await r.text()}`);
      return res.status(200).json({ google_event_id });
    }

    if (action === 'delete') {
      if (!google_event_id) return res.status(200).json({});  // nada a deletar
      const r = await fetch(`${base}/${encodeURIComponent(google_event_id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${gToken}` },
      });
      if (!r.ok && r.status !== 404) throw new Error(`Google delete ${r.status}: ${await r.text()}`);
      return res.status(200).json({});
    }

    return res.status(400).json({ error: 'action inválida' });
  } catch (err) {
    console.error('[calendar-sync]', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
}

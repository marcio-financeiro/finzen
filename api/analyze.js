// api/analyze.js — Proxy Claude AI
// Node.js serverless (não Edge — Edge bloqueia chamadas externas)

export default async function handler(req, res) {

  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', 'https://finzen-rho.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-finzen-secret');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Autenticação por secret ───────────────────────────────────────────────
  const secret = req.headers['x-finzen-secret'];
  if (!secret || secret !== process.env.FINZEN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { prompt, system, history } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt é obrigatório' });
    }

    // Monta histórico de mensagens
    const messages = [];
    if (history && Array.isArray(history)) {
      history.slice(0, -1).forEach(h => {
        messages.push({ role: h.role, content: h.content });
      });
    }
    messages.push({ role: 'user', content: prompt });

    const requestBody = {
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      stream: true,
      messages,
    };

    if (system) requestBody.system = system;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      return res.status(anthropicRes.status).json({ error: err });
    }

    // Streaming de resposta
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');

    const reader = anthropicRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value));
    }

    res.end();

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

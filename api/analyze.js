// api/analyze.js — FinZen
// Vercel Serverless (Node.js) — proxy para API Anthropic com streaming

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, system, history } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt é obrigatório' });
    }

    // Monta histórico de mensagens (todas as anteriores, exceto a atual que vem em 'prompt')
    const messages = [];
    if (history && Array.isArray(history)) {
      // O histórico enviado pelo chat.js já inclui a mensagem atual no final
      // Removemos a última (que é a atual) para não duplicar com o 'prompt'
      const historicoPrevio = history.slice(0, -1);
      historicoPrevio.forEach(h => {
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

    if (system) {
      requestBody.system = system;
    }

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

    // Streaming: pipe direto para o cliente
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');

    const reader = anthropicRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }

    res.end();

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

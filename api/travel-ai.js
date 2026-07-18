// api/travel-ai.js — Assistente de viagem do módulo VYNHunter
// Node.js serverless (não Edge — Edge bloqueia chamadas externas)
// Mesmo padrão de api/analyze.js: auth JWT Supabase + rate limiting diário,
// ANTHROPIC_API_KEY fica só no servidor (variável de ambiente da Vercel).

import { checarLimiteIA } from './_aiRateLimit.js';

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', 'https://finzen-rho.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  // ── Autenticação JWT Supabase ─────────────────────────────────────────────
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return res.status(403).json({ error: 'Forbidden' });
  const token = auth.slice(7);
  const authRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_SERVICE_KEY },
  });
  if (!authRes.ok) return res.status(403).json({ error: 'Forbidden' });

  // Rate limiting: protege o custo da API Anthropic (AI_LIMITE_DIARIO/dia)
  const usuario = await authRes.json().catch(() => null);
  if (usuario?.id) {
    const limite = await checarLimiteIA(usuario.id, 'travel-ai');
    if (!limite.permitido) {
      return res.status(429).json({ error: `Limite diário de IA atingido (${limite.limite} chamadas). Tente novamente amanhã.` });
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada na Vercel' });
  }

  const { question, context, history } = req.body || {};
  if (!question) return res.status(400).json({ error: 'Pergunta vazia' });

  const prompt = `Você é o assistente de viagens do FinZen (módulo VYNHunter), app de caça a passagens aéreas baratas.
Responda em português do Brasil, curto e prático (máx. 6 frases), sem markdown pesado.
SEMPRE: (1) indique o grau de confiança (baixo/médio/alto); (2) deixe claro que previsões são estimativas estatísticas, não garantias; (3) baseie-se APENAS nos dados fornecidos. Os preços deste módulo são simulados (modo demonstração).

DADOS DA BUSCA ATUAL: ${context ? JSON.stringify(context) : 'nenhuma busca feita ainda — peça para o usuário buscar primeiro.'}

HISTÓRICO DA CONVERSA: ${JSON.stringify((history || []).slice(-6))}

PERGUNTA: ${question}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }

    const data = await r.json();
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n') || 'Não consegui responder agora. Tente novamente.';

    return res.status(200).json({ text });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Falha ao consultar a IA' });
  }
}

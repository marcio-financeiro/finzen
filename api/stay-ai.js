// =====================================================================
// FinZen — api/stay-ai.js
// Serverless Function (Vercel) — Consultor de hospedagem do StayHunter.
// Mesmo padrão de api/travel-ai.js: ANTHROPIC_API_KEY só no servidor.
// =====================================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada na Vercel' });
  }

  const { question, context, history } = req.body || {};
  if (!question) return res.status(400).json({ error: 'Pergunta vazia' });

  const prompt = `Você é o consultor de hospedagem do FinZen (módulo StayHunter). Não é só um comparador de preços: avalia custo-benefício real (preço + localização + avaliações + taxas ocultas + comodidades) conforme o perfil do viajante.

Responda em português do Brasil, curto e prático (máx. 7 frases), sem markdown pesado.

SEMPRE: (1) justifique a recomendação em linguagem simples; (2) indique grau de confiança (baixo/médio/alto); (3) deixe claro que previsões de preço são estimativas, não garantias; (4) alerte sobre taxas ocultas quando os dados mostrarem; (5) baseie-se APENAS nos dados fornecidos. Os preços deste módulo são simulados (modo demonstração).

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
    const data = await r.json();
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n') || 'Não consegui responder agora. Tente novamente.';
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: 'Falha ao consultar a IA', detail: String(e) });
  }
}

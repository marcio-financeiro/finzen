// api/assistant.js — Orquestrador do Assistente Proativo FinZen
// Coleta contexto financeiro + offshore + calendário e gera insights via Claude

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', 'https://finzen-rho.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return res.status(403).json({ error: 'Forbidden' });
  const token = auth.slice(7);
  const authRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_SERVICE_KEY },
  });
  if (!authRes.ok) return res.status(403).json({ error: 'Forbidden' });

  try {
    const { contexto } = req.body;
    if (!contexto) return res.status(400).json({ error: 'contexto é obrigatório' });

    const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

    const prompt = `Você é o assistente financeiro pessoal do Márcio, um profissional offshore brasileiro.
Hoje é ${hoje}.

Aqui estão os dados financeiros e pessoais atuais:

FINANCEIRO:
- Saldo disponível: R$ ${contexto.saldo}
- Receitas do mês: R$ ${contexto.receitas}
- Despesas do mês: R$ ${contexto.despesas}
- Faturas de cartão abertas: R$ ${contexto.faturas}
- Saldo previsto fim do mês: R$ ${contexto.previsao}
- Transações pendentes próximos 7 dias: ${contexto.pendentes} item(ns)

OFFSHORE:
- Próximo embarque: ${contexto.proximoEmbarque || 'não agendado'}
- Dias até embarque: ${contexto.diasEmbarque ?? '—'}
- Último desembarque: ${contexto.ultimoDesembarque || 'não registrado'}

CALENDÁRIO (próximos 7 dias):
${contexto.eventosCalendario?.length ? contexto.eventosCalendario.map(e => `- ${e.data}: ${e.titulo}`).join('\n') : '- Sem eventos próximos'}

METAS ATIVAS:
${contexto.metas?.length ? contexto.metas.map(m => `- ${m.nome}: ${m.percentual}% concluída`).join('\n') : '- Sem metas ativas'}

Com base nesses dados, gere exatamente 4 insights proativos curtos e diretos.
Cada insight deve ter no máximo 12 palavras.
Foque no que é mais urgente ou relevante AGORA para o Márcio.
Combine dados financeiros com contexto de vida (offshore, eventos, metas).

Responda APENAS com JSON válido, sem markdown, no formato:
{"insights": ["insight 1", "insight 2", "insight 3", "insight 4"]}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';

    // Parse seguro
    let insights = [];
    try {
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      insights = parsed.insights || [];
    } catch (_) {
      // Fallback: extrair frases do texto bruto
      insights = text.split('\n').filter(l => l.trim().length > 5).slice(0, 4);
    }

    return res.status(200).json({ insights });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}

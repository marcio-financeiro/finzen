// api/_aiRateLimit.js — limite diário de chamadas de IA por usuário.
// Arquivos com _ no início não viram endpoint na Vercel.
// Usa a tabela ai_usage (database/2026_07_09_ai_usage.sql); se ela ainda
// não existir, NÃO bloqueia (fail-open — proteção de custo, não de acesso).

const LIMITE_PADRAO = 50;

export async function checarLimiteIA(userId, endpoint) {
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const limite = Number(process.env.AI_LIMITE_DIARIO || LIMITE_PADRAO);
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    const hoje = new Date().toISOString().split('T')[0];
    const r = await fetch(
      `${SB_URL}/rest/v1/ai_usage?user_id=eq.${userId}&created_at=gte.${hoje}T00:00:00Z&select=id`,
      { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }
    );
    if (!r.ok) return { permitido: true }; // tabela ausente → não bloqueia

    const total = Number((r.headers.get('content-range') || '0/0').split('/')[1] || 0);
    if (total >= limite) {
      return { permitido: false, total, limite };
    }

    await fetch(`${SB_URL}/rest/v1/ai_usage`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ user_id: userId, endpoint }),
    }).catch(() => {});

    return { permitido: true, total: total + 1, limite };
  } catch (_) {
    return { permitido: true };
  }
}

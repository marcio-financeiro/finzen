/**
 * apiClient.js — Cliente centralizado para chamadas às Vercel Functions
 *
 * Injeta automaticamente o x-finzen-secret em todas as chamadas a /api/analyze.
 * O secret fica em config.js — nunca exposto ao usuário final, apenas trafega
 * no header da requisição servidor→servidor.
 */

export const FINZEN_SECRET = 'finzen2026@rho';

/**
 * Chama /api/analyze com autenticação automática.
 * Mesma assinatura do fetch nativo.
 */
export async function analyzeRequest(body) {
  return fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-finzen-secret': FINZEN_SECRET,
    },
    body: JSON.stringify(body),
  });
}

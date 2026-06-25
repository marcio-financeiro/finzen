import { supabase } from './supabaseClient.js';

export async function analyzeRequest(body) {
  const { data: sd } = await supabase.auth.getSession();
  const token = sd.session?.access_token;
  if (!token) throw new Error('Não autenticado');
  return fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

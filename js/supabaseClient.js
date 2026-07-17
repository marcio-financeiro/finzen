import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Auth padrão de todo módulo de página: devolve o user logado ou redireciona
 * para o login. Substitui o boilerplate repetido em ~35 arquivos:
 *   const { data: sd } = await supabase.auth.getSession(); if(!sd.session)...
 * Uso: const user = await requireAuth();
 */
export async function requireAuth(loginPath = '../login.html'){
  const { data } = await supabase.auth.getSession();
  if(!data.session){
    window.location.replace(loginPath);
    throw new Error('unauthenticated');
  }
  return data.session.user;
}

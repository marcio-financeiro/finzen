/**
 * dataService.js — Cache de queries compartilhadas dentro de UMA carga de página.
 *
 * Problema que resolve: em toda página, navigation.js (sidebar), dashboard.js
 * (ou outro módulo da página) e, na home, assistantBar.js disparam consultas
 * quase idênticas em paralelo (ex: contas ativas do usuário) — cada uma com
 * sua própria SELECT list, cada uma ignorando que as outras já pediram os
 * mesmos dados.
 *
 * Solução: cache de Promise por chave, válido só durante o ciclo de vida do
 * módulo (ou seja, até a próxima navegação de página — recarrega sempre no
 * F5/troca de rota, nunca serve dado desatualizado entre páginas). Como ES
 * modules são singletons por URL, todo módulo que importar este arquivo na
 * mesma página compartilha o mesmo cache automaticamente.
 *
 * SELECT lists são a UNIÃO do que cada consumidor conhecido já pedia —
 * elimina as variantes divergentes sem tirar nenhum campo que alguém usava.
 *
 * Uso:
 *   import { getActiveAccounts, invalidate } from './services/dataService.js';
 *   const contas = await getActiveAccounts(supabase, user.id);
 *   // após mutação (ex: ajustarSaldo):
 *   invalidate('accounts');
 */

const cache = new Map();

function cached(key, fetcher) {
  if (!cache.has(key)) cache.set(key, fetcher());
  return cache.get(key);
}

/** Limpa o cache (chave específica, ou tudo se nenhuma for passada). */
export function invalidate(...keys) {
  if (!keys.length) { cache.clear(); return; }
  keys.forEach(k => cache.delete(k));
}

export function getActiveAccounts(supabase, userId) {
  return cached(`accounts:${userId}`, async () => {
    const { data, error } = await supabase
      .from('accounts')
      .select('id,nome,currency,saldo_atual,color,icon,tipo,account_kind')
      .eq('user_id', userId)
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('nome', { ascending: true });
    if (error) throw error;
    return data || [];
  });
}

export function getActiveCards(supabase, userId) {
  return cached(`cards:${userId}`, async () => {
    const { data, error } = await supabase
      .from('credit_cards')
      .select('id,nome,banco,limite,fechamento_dia,vencimento_dia,cor')
      .eq('user_id', userId)
      .eq('ativo', true)
      .order('sort_order', { ascending: true })
      .order('nome', { ascending: true });
    if (error) throw error;
    return data || [];
  });
}

export function getActiveGoals(supabase, userId) {
  return cached(`goals:${userId}`, async () => {
    const { data, error } = await supabase
      .from('goals')
      .select('id,nome,valor_alvo,valor_atual,data_alvo,cor')
      .eq('user_id', userId)
      .eq('ativo', true);
    if (error) throw error;
    return data || [];
  });
}

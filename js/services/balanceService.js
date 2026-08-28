/**
 * balanceService.js — Ajuste de saldo de conta.
 *
 * Delta atômico via RPC increment_account_balance (lock de linha —
 * migration database/2026_07_09_saldo_atomico.sql). Nunca fazer
 * SELECT saldo → soma em JS → UPDATE: sujeito a race condition entre abas.
 */
import { supabase } from '../supabaseClient.js';

/**
 * Soma `delta` (pode ser negativo) ao saldo da conta.
 * Retorna true em sucesso; lança Error em falha.
 */
export async function ajustarSaldo(accountId, delta){
  if(!accountId || !delta) return true;

  const { error } = await supabase.rpc('increment_account_balance', {
    p_account_id: accountId,
    p_delta: delta,
  });
  if(error) throw new Error(error.message);
  return true;
}

/** Delta de uma transação sobre o saldo: receita soma, despesa subtrai. */
export function deltaTransacao(tipo, valor, modo = 'apply'){
  const v = Number(valor || 0);
  const sinal = tipo === 'receita' ? 1 : -1;
  return modo === 'apply' ? sinal * v : -sinal * v;
}

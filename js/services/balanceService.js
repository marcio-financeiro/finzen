/**
 * balanceService.js — Ajuste de saldo de conta.
 *
 * Caminho preferido: RPC increment_account_balance (atômica, com lock de
 * linha — migration database/2026_07_09_saldo_atomico.sql). Enquanto a
 * migration não estiver aplicada, cai no caminho legado (SELECT → UPDATE),
 * que funciona mas está sujeito a race condition entre abas.
 */
import { supabase } from '../supabaseClient.js';

let rpcDisponivel = null; // null = ainda não sabemos

/**
 * Soma `delta` (pode ser negativo) ao saldo da conta.
 * Retorna true em sucesso; lança Error em falha.
 */
export async function ajustarSaldo(accountId, delta){
  if(!accountId || !delta) return true;

  if(rpcDisponivel !== false){
    const { error } = await supabase.rpc('increment_account_balance', {
      p_account_id: accountId,
      p_delta: delta,
    });
    if(!error){ rpcDisponivel = true; return true; }
    // 42883/PGRST202 = função não existe ainda → fallback legado
    const naoExiste = error.code === '42883' || error.code === 'PGRST202' ||
      /function .*increment_account_balance/i.test(error.message || '');
    if(!naoExiste) throw new Error(error.message);
    rpcDisponivel = false;
  }

  // Caminho legado (não-atômico) — remover quando a migration estiver aplicada
  const { data, error: e1 } = await supabase
    .from('accounts').select('saldo_atual')
    .eq('id', accountId).single();
  if(e1) throw new Error(e1.message);

  const { error: e2 } = await supabase.from('accounts')
    .update({ saldo_atual: Number(data.saldo_atual || 0) + delta })
    .eq('id', accountId);
  if(e2) throw new Error(e2.message);
  return true;
}

/** Delta de uma transação sobre o saldo: receita soma, despesa subtrai. */
export function deltaTransacao(tipo, valor, modo = 'apply'){
  const v = Number(valor || 0);
  const sinal = tipo === 'receita' ? 1 : -1;
  return modo === 'apply' ? sinal * v : -sinal * v;
}

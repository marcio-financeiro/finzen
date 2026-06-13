import { supabase } from '../supabaseClient.js';
import { validateAmount, validateDifferentAccounts, validateSameCurrency } from './accountService.js';

export function validateTransfer({ fromAccountId, toAccountId, amount, accounts = [] }){
  validateDifferentAccounts(fromAccountId, toAccountId);
  const value = validateAmount(amount);

  const fromAccount = accounts.find(account => account.id === fromAccountId);
  const toAccount = accounts.find(account => account.id === toAccountId);

  validateSameCurrency(fromAccount, toAccount);

  return value;
}

export async function createAccountTransfer({ fromAccountId, toAccountId, amount, date, description }){
  const value = validateAmount(amount);

  const { error } = await supabase.rpc('create_account_transfer', {
    p_from_account_id: fromAccountId,
    p_to_account_id: toAccountId,
    p_amount: value,
    p_date: date,
    p_description: description || null
  });

  if(error){
    throw error;
  }

  return true;
}

export async function deleteAccountTransfer(transferId){
  const { error } = await supabase.rpc('delete_account_transfer', {
    p_transfer_id: transferId
  });

  if(error){
    throw error;
  }

  return true;
}

export async function listAccountTransfers(userId, limit = 50){
  const { data, error } = await supabase
    .from('account_transfers')
    .select(`
      id,
      amount,
      date,
      description,
      created_at,
      from_account:from_account_id (
        nome,
        currency
      ),
      to_account:to_account_id (
        nome,
        currency
      )
    `)
    .eq('user_id', userId)
    .order('date', { ascending:false })
    .order('created_at', { ascending:false })
    .limit(limit);

  if(error){
    throw error;
  }

  return data || [];
}

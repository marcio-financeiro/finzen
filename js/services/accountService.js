import { supabase } from '../supabaseClient.js';
import { toNumber, normalizeCurrency } from './financeService.js';

export async function listActiveAccounts(userId){
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('sort_order', { ascending:true })
    .order('nome', { ascending:true });

  if(error){
    throw error;
  }

  return data || [];
}

export async function listBrokerAccounts(userId){
  const { data, error } = await supabase
    .from('accounts')
    .select('id,nome,bank,currency,saldo_atual')
    .eq('user_id', userId)
    .eq('active', true)
    .eq('account_kind', 'broker')
    .order('nome', { ascending:true });

  if(error){
    throw error;
  }

  return data || [];
}

export async function getAccount(userId, accountId){
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('id', accountId)
    .maybeSingle();

  if(error){
    throw error;
  }

  return data;
}

export function validateAmount(amount){
  const value = toNumber(amount);

  if(value <= 0){
    throw new Error('Informe um valor maior que zero.');
  }

  return value;
}

export function validateDifferentAccounts(fromAccountId, toAccountId){
  if(!fromAccountId || !toAccountId){
    throw new Error('Selecione a conta de origem e destino.');
  }

  if(fromAccountId === toAccountId){
    throw new Error('A conta de origem e destino não podem ser iguais.');
  }
}

export function validateSameCurrency(fromAccount, toAccount){
  const fromCurrency = normalizeCurrency(fromAccount?.currency);
  const toCurrency = normalizeCurrency(toAccount?.currency);

  if(fromCurrency !== toCurrency){
    throw new Error('Transferência entre moedas diferentes ainda não está habilitada.');
  }

  return fromCurrency;
}

export function validateSufficientBalance(account, amount){
  const value = validateAmount(amount);
  const currentBalance = toNumber(account?.saldo_atual);

  if(currentBalance < value){
    throw new Error('Saldo insuficiente na conta de origem.');
  }

  return true;
}

export async function updateAccountBalance(userId, accountId, newBalance){
  const { error } = await supabase
    .from('accounts')
    .update({ saldo_atual:toNumber(newBalance) })
    .eq('id', accountId)
    .eq('user_id', userId);

  if(error){
    throw error;
  }

  return true;
}

export async function debitAccount(userId, accountId, amount){
  const account = await getAccount(userId, accountId);

  if(!account){
    throw new Error('Conta não encontrada.');
  }

  const value = validateAmount(amount);
  validateSufficientBalance(account, value);

  const newBalance = toNumber(account.saldo_atual) - value;
  await updateAccountBalance(userId, accountId, newBalance);

  return newBalance;
}

export async function creditAccount(userId, accountId, amount){
  const account = await getAccount(userId, accountId);

  if(!account){
    throw new Error('Conta não encontrada.');
  }

  const value = validateAmount(amount);
  const newBalance = toNumber(account.saldo_atual) + value;
  await updateAccountBalance(userId, accountId, newBalance);

  return newBalance;
}

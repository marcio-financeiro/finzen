import { supabase } from '../supabaseClient.js';
import { validateAmount, validateDifferentAccounts, validateSameCurrency } from './accountService.js';
import { calculateCurrencyExchange, normalizeCurrency, toNumber } from './financeService.js';

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

export function validateCurrencyExchange({ fromAccountId, toAccountId, sourceAmount, exchangeRate, accounts = [] }){
  validateDifferentAccounts(fromAccountId, toAccountId);

  const amount = validateAmount(sourceAmount);
  const rate = toNumber(exchangeRate);

  if(rate <= 0){
    throw new Error('Informe uma taxa de câmbio válida.');
  }

  const fromAccount = accounts.find(account => account.id === fromAccountId);
  const toAccount = accounts.find(account => account.id === toAccountId);

  if(!fromAccount || !toAccount){
    throw new Error('Selecione contas válidas para a conversão.');
  }

  if(fromAccount.account_kind !== 'broker' || toAccount.account_kind !== 'broker'){
    throw new Error('Conversão cambial deve ser feita entre contas de corretora.');
  }

  const fromCurrency = normalizeCurrency(fromAccount.currency);
  const toCurrency = normalizeCurrency(toAccount.currency);

  if(fromCurrency === toCurrency){
    throw new Error('A conversão exige contas com moedas diferentes.');
  }

  if(!((fromCurrency === 'BRL' && toCurrency === 'USD') || (fromCurrency === 'USD' && toCurrency === 'BRL'))){
    throw new Error('Nesta versão, a conversão suporta apenas BRL e USD.');
  }

  if(toNumber(fromAccount.saldo_atual) < amount){
    throw new Error('Saldo insuficiente na conta de origem.');
  }

  return calculateCurrencyExchange({
    sourceAmount:amount,
    exchangeRate:rate,
    fromCurrency,
    toCurrency
  });
}

export async function createCurrencyExchange({ fromAccountId, toAccountId, sourceAmount, exchangeRate, date, description }){
  const amount = validateAmount(sourceAmount);
  const rate = toNumber(exchangeRate);

  if(rate <= 0){
    throw new Error('Informe uma taxa de câmbio válida.');
  }

  const { data, error } = await supabase.rpc('create_currency_exchange', {
    p_from_account_id: fromAccountId,
    p_to_account_id: toAccountId,
    p_source_amount: amount,
    p_exchange_rate: rate,
    p_date: date,
    p_description: description || null
  });

  if(error){
    throw error;
  }

  return data;
}

export async function listCurrencyExchanges(userId, limit = 50){
  const { data, error } = await supabase
    .from('exchange_transactions')
    .select(`
      id,
      from_currency,
      to_currency,
      source_amount,
      target_amount,
      exchange_rate,
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

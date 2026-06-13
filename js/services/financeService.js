import { supabase } from '../supabaseClient.js';

export const DEFAULT_CURRENCY = 'BRL';
export const DEFAULT_USD_BRL = 5.15;

export function normalizeCurrency(currency){
  return currency || DEFAULT_CURRENCY;
}

export function toNumber(value, fallback = 0){
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function formatCurrency(value, currency = DEFAULT_CURRENCY){
  return toNumber(value).toLocaleString('pt-BR', {
    style:'currency',
    currency:normalizeCurrency(currency)
  });
}

export function formatUSD(value){
  return 'US$ ' + toNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits:2,
    maximumFractionDigits:2
  });
}

export function formatPercent(value){
  return toNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits:2,
    maximumFractionDigits:2
  }) + '%';
}

export function convertToBRL(value, currency = DEFAULT_CURRENCY, usdBrlRate = DEFAULT_USD_BRL){
  const normalizedCurrency = normalizeCurrency(currency);

  if(normalizedCurrency === 'USD'){
    return toNumber(value) * toNumber(usdBrlRate, DEFAULT_USD_BRL);
  }

  return toNumber(value);
}

export async function getUsdBrlRate(userId){
  const { data, error } = await supabase
    .from('user_settings')
    .select('setting_value')
    .eq('user_id', userId)
    .eq('setting_key', 'usd_brl')
    .maybeSingle();

  if(error){
    throw error;
  }

  return toNumber(data?.setting_value, DEFAULT_USD_BRL);
}

export async function saveUsdBrlRate(userId, rate){
  const value = toNumber(rate);

  if(value <= 0){
    throw new Error('Informe uma cotação válida.');
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id:userId,
      setting_key:'usd_brl',
      setting_value:String(value),
      updated_at:new Date().toISOString()
    }, { onConflict:'user_id,setting_key' });

  if(error){
    throw error;
  }

  return value;
}

import { supabase } from '../supabaseClient.js';

export const DEFAULT_CURRENCY = 'BRL';
export const DEFAULT_USD_BRL = 5.15;

export function normalizeCurrency(currency){
  return currency || DEFAULT_CURRENCY;
}

export function toNumber(value, fallback = 0){
  if (value === null || value === undefined || value === '') return fallback;
  // Suporte a vírgula como separador decimal (padrão brasileiro)
  // Ex: "37,25" → 37.25 | "1.234,56" → 1234.56 | "1,234.56" → 1234.56
  if (typeof value === 'string') {
    const s = value.trim();
    // Formato BR: 1.234,56 — ponto como milhar, vírgula como decimal
    if (/^-?[\d.]+,\d{1,2}$/.test(s)) {
      value = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Qualquer outra vírgula isolada → decimal
      value = s.replace(',', '.');
    }
  }
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

export function calculateCurrencyExchange({ sourceAmount, exchangeRate, fromCurrency, toCurrency }){
  const amount = toNumber(sourceAmount);
  const rate = toNumber(exchangeRate);
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);

  if(amount <= 0 || rate <= 0 || from === to){
    return 0;
  }

  if(from === 'BRL' && to === 'USD'){
    return amount / rate;
  }

  if(from === 'USD' && to === 'BRL'){
    return amount * rate;
  }

  throw new Error('Nesta versão, a conversão suporta apenas BRL e USD.');
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

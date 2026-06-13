import { supabase } from '../supabaseClient.js';
import { toNumber, convertToBRL } from './financeService.js';

export function calculateWeightedAveragePrice({ oldQuantity, oldAveragePrice, newQuantity, newPrice }){
  const currentQuantity = toNumber(oldQuantity);
  const currentAverage = toNumber(oldAveragePrice);
  const quantity = toNumber(newQuantity);
  const price = toNumber(newPrice);
  const totalQuantity = currentQuantity + quantity;

  if(totalQuantity <= 0){
    return price;
  }

  return ((currentQuantity * currentAverage) + (quantity * price)) / totalQuantity;
}

export function calculateAppliedValue(investment){
  return toNumber(investment?.quantidade) * toNumber(investment?.preco_medio);
}

export function calculateCurrentValue(investment){
  const price = toNumber(investment?.cotacao_atual || investment?.preco_medio);
  return toNumber(investment?.quantidade) * price;
}

export function calculateBRLValue(investment, value, usdBrlRate){
  return convertToBRL(value, investment?.moeda || 'BRL', usdBrlRate);
}

export async function listActiveInvestments(userId){
  const { data, error } = await supabase
    .from('investments')
    .select('*')
    .eq('user_id', userId)
    .eq('ativo', true)
    .order('ticker', { ascending:true });

  if(error){
    throw error;
  }

  return data || [];
}

export async function findActiveInvestment({ userId, ticker, brokerName, currency }){
  const { data, error } = await supabase
    .from('investments')
    .select('*')
    .eq('user_id', userId)
    .eq('ativo', true)
    .eq('ticker', ticker)
    .eq('corretora', brokerName)
    .eq('moeda', currency)
    .maybeSingle();

  if(error){
    throw error;
  }

  return data;
}

export async function saveInvestmentPosition({
  userId,
  ticker,
  name,
  type,
  quantity,
  averagePrice,
  currentPrice,
  currency,
  brokerName,
  usdBrlRate
}){
  const existing = await findActiveInvestment({
    userId,
    ticker,
    brokerName,
    currency
  });

  let error = null;

  if(existing){
    const newQuantity = toNumber(existing.quantidade) + toNumber(quantity);
    const newAveragePrice = calculateWeightedAveragePrice({
      oldQuantity:existing.quantidade,
      oldAveragePrice:existing.preco_medio,
      newQuantity:quantity,
      newPrice:averagePrice
    });

    const update = await supabase
      .from('investments')
      .update({
        nome:name || existing.nome,
        tipo:type,
        quantidade:newQuantity,
        preco_medio:newAveragePrice,
        cotacao_atual:currentPrice ?? existing.cotacao_atual,
        exchange_rate:currency === 'USD' ? usdBrlRate : null,
        atualizado_em:new Date().toISOString()
      })
      .eq('id', existing.id)
      .eq('user_id', userId);

    error = update.error;
  }else{
    const insert = await supabase
      .from('investments')
      .insert({
        user_id:userId,
        ticker,
        nome:name,
        tipo:type,
        quantidade:toNumber(quantity),
        preco_medio:toNumber(averagePrice),
        moeda:currency,
        corretora:brokerName,
        exchange_rate:currency === 'USD' ? usdBrlRate : null,
        cotacao_atual:currentPrice,
        atualizado_em:currentPrice ? new Date().toISOString() : null,
        ativo:true
      });

    error = insert.error;
  }

  if(error){
    throw error;
  }

  return { existing };
}

export async function softDeleteInvestment(userId, investmentId){
  const { error } = await supabase
    .from('investments')
    .update({ ativo:false })
    .eq('id', investmentId)
    .eq('user_id', userId);

  if(error){
    throw error;
  }

  return true;
}

// Snapshot diário automático de patrimônio (para rentabilidade mensal parcial)

function referenceMonth(date = new Date()){
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

async function sumAccounts(supabase, userId){
  const { data, error } = await supabase
    .from('accounts')
    .select('saldo_atual, active')
    .eq('user_id', userId)
    .eq('active', true);
  if(error) return 0;
  return (data || []).reduce((sum, item) => sum + Number(item.saldo_atual || 0), 0);
}

async function sumOpenCards(supabase, userId){
  const { data, error } = await supabase
    .from('card_transactions')
    .select('valor_parcela, valor_total, status')
    .eq('user_id', userId)
    .eq('status', 'aberta');
  if(error) return 0;
  return (data || []).reduce((sum, item) => {
    const parcela = Number(item.valor_parcela ?? 0);
    const total = Number(item.valor_total ?? 0);
    return sum + (parcela || total);
  }, 0);
}

async function sumInvestmentsSafe(supabase, userId){
  const { data, error } = await supabase
    .from('investments')
    .select('quantidade,cotacao_atual,preco_medio,moeda')
    .eq('user_id', userId);
  if(error || !data?.length) return 0;

  const { data: settings } = await supabase
    .from('user_settings')
    .select('setting_value')
    .eq('user_id', userId)
    .eq('setting_key', 'usd_brl_rate')
    .maybeSingle();

  const usdBrl = settings ? Number(settings.setting_value) || 5.15 : 5.15;

  return data.reduce((sum, a) => {
    const qty   = Number(a.quantidade  ?? 0);
    const price = Number(a.cotacao_atual ?? a.preco_medio ?? 0);
    const brl   = (a.moeda === 'USD') ? qty * price * usdBrl : qty * price;
    return sum + brl;
  }, 0);
}

// Recalcula e salva o snapshot do mês corrente, só se ainda não foi feito hoje.
export async function ensureDailySnapshot(supabase, user){
  const refMonth = referenceMonth();
  const today = new Date().toISOString().substring(0, 10);

  const { data: existing } = await supabase
    .from('patrimony_history')
    .select('updated_at')
    .eq('user_id', user.id)
    .eq('reference_month', refMonth)
    .maybeSingle();

  if(existing?.updated_at?.substring(0, 10) === today) return;

  const [accountsTotal, cardsTotal, investmentsTotal] = await Promise.all([
    sumAccounts(supabase, user.id),
    sumOpenCards(supabase, user.id),
    sumInvestmentsSafe(supabase, user.id)
  ]);
  const netWorth = accountsTotal + investmentsTotal - cardsTotal;

  await supabase.from('patrimony_history').upsert({
    user_id: user.id,
    reference_month: refMonth,
    accounts_total: Number(accountsTotal.toFixed(2)),
    investments_total: Number(investmentsTotal.toFixed(2)),
    cards_total: Number(cardsTotal.toFixed(2)),
    net_worth: Number(netWorth.toFixed(2)),
    notes: 'Snapshot diário automático.',
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,reference_month' });
}

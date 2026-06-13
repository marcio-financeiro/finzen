import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const el = id => document.getElementById(id);

const userEmail = el('userEmail');
const btnLogout = el('btnLogout');
const btnSaveSnapshot = el('btnSaveSnapshot');
const btnReload = el('btnReload');

const currentNetWorth = el('currentNetWorth');
const previousNetWorth = el('previousNetWorth');
const evolutionAmount = el('evolutionAmount');
const evolutionPercent = el('evolutionPercent');

const compositionList = el('compositionList');
const historyList = el('historyList');
const patrimonyMessage = el('patrimonyMessage');

const { data: sessionData } = await supabase.auth.getSession();

if(!sessionData.session){
  navigate('../login.html');
}

const user = sessionData.session.user;
userEmail.innerText = user.email;

let currentSnapshot = {
  accounts_total:0,
  investments_total:0,
  cards_total:0,
  net_worth:0
};

function showMessage(text, type = 'info'){
  patrimonyMessage.className = `message ${type}`;
  patrimonyMessage.innerText = text;
}

function referenceMonth(date = new Date()){
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatMonth(dateISO){
  if(!dateISO) return '-';

  const [year, month] = dateISO.split('-').map(Number);

  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
    month:'long',
    year:'numeric'
  });
}

function percent(value){
  return `${Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })}%`;
}

async function sumAccounts(){
  const { data, error } = await supabase
    .from('accounts')
    .select('saldo_atual, active')
    .eq('user_id', user.id)
    .eq('active', true);

  if(error){
    throw new Error('Erro ao calcular contas: ' + error.message);
  }

  return (data || []).reduce((sum, item) => sum + Number(item.saldo_atual || 0), 0);
}

async function sumOpenCards(){
  const { data, error } = await supabase
    .from('card_transactions')
    .select('valor_parcela, valor_total, status')
    .eq('user_id', user.id)
    .eq('status', 'aberta');

  if(error){
    throw new Error('Erro ao calcular cartões: ' + error.message);
  }

  return (data || []).reduce((sum, item) => {
    const parcela = Number(item.valor_parcela ?? 0);
    const total = Number(item.valor_total ?? 0);

    if(parcela){
      return sum + parcela;
    }

    return sum + total;
  }, 0);
}

async function sumInvestmentsSafe(){
  /*
    Cálculo conservador.
    Como o módulo de investimentos ainda pode estar evoluindo,
    tentamos estruturas comuns sem quebrar a tela.
  */

  const attempts = [
    {
      table:'investment_assets',
      select:'quantity,current_price,average_price,total_value'
    },
    {
      table:'investments',
      select:'quantity,current_price,average_price,total_value'
    },
    {
      table:'investment_positions',
      select:'quantity,current_price,average_price,total_value'
    }
  ];

  for(const attempt of attempts){
    const { data, error } = await supabase
      .from(attempt.table)
      .select(attempt.select)
      .eq('user_id', user.id);

    if(error){
      continue;
    }

    if(!data || !data.length){
      return 0;
    }

    return data.reduce((sum, item) => {
      const total = Number(item.total_value ?? 0);

      if(total){
        return sum + total;
      }

      const quantity = Number(item.quantity ?? 0);
      const current = Number(item.current_price ?? 0);
      const average = Number(item.average_price ?? 0);

      if(quantity && current){
        return sum + (quantity * current);
      }

      if(quantity && average){
        return sum + (quantity * average);
      }

      return sum;
    }, 0);
  }

  return 0;
}

async function calculateSnapshot(){
  showMessage('Calculando patrimônio...');

  try{
    const accountsTotal = await sumAccounts();
    const cardsTotal = await sumOpenCards();
    const investmentsTotal = await sumInvestmentsSafe();

    const netWorth = accountsTotal + investmentsTotal - cardsTotal;

    currentSnapshot = {
      accounts_total:Number(accountsTotal.toFixed(2)),
      investments_total:Number(investmentsTotal.toFixed(2)),
      cards_total:Number(cardsTotal.toFixed(2)),
      net_worth:Number(netWorth.toFixed(2))
    };

    renderComposition();
    await renderSummary();

    showMessage('Cálculo atualizado.', 'success');
  }catch(error){
    showMessage(error.message, 'danger');
  }
}

function renderComposition(){
  compositionList.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Componente</th>
          <th>Valor</th>
          <th>Efeito</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Contas</td>
          <td class="money positive">${formatCurrency(currentSnapshot.accounts_total, 'BRL')}</td>
          <td>Soma ao patrimônio</td>
        </tr>
        <tr>
          <td>Investimentos</td>
          <td class="money positive">${formatCurrency(currentSnapshot.investments_total, 'BRL')}</td>
          <td>Soma ao patrimônio</td>
        </tr>
        <tr>
          <td>Cartões em aberto</td>
          <td class="money negative">${formatCurrency(currentSnapshot.cards_total, 'BRL')}</td>
          <td>Subtrai do patrimônio</td>
        </tr>
        <tr>
          <td><strong>Patrimônio Líquido</strong></td>
          <td class="money"><strong>${formatCurrency(currentSnapshot.net_worth, 'BRL')}</strong></td>
          <td>Contas + Investimentos - Cartões</td>
        </tr>
      </tbody>
    </table>
  `;
}

async function renderSummary(){
  const { data, error } = await supabase
    .from('patrimony_history')
    .select('*')
    .eq('user_id', user.id)
    .order('reference_month', { ascending:false })
    .limit(2);

  if(error){
    currentNetWorth.innerText = formatCurrency(currentSnapshot.net_worth, 'BRL');
    previousNetWorth.innerText = formatCurrency(0, 'BRL');
    evolutionAmount.innerText = formatCurrency(0, 'BRL');
    evolutionPercent.innerText = percent(0);
    return;
  }

  const savedCurrent = (data || []).find(item => item.reference_month === referenceMonth());
  const previous = (data || []).find(item => item.reference_month !== referenceMonth());

  const currentValue = currentSnapshot.net_worth;
  const previousValue = Number(previous?.net_worth || 0);
  const diff = currentValue - previousValue;
  const diffPercent = previousValue ? (diff / previousValue) * 100 : 0;

  currentNetWorth.innerText = formatCurrency(currentValue, 'BRL');
  previousNetWorth.innerText = formatCurrency(previousValue, 'BRL');
  evolutionAmount.innerText = `${diff >= 0 ? '+' : ''}${formatCurrency(diff, 'BRL')}`;
  evolutionPercent.innerText = `${diffPercent >= 0 ? '+' : ''}${percent(diffPercent)}`;
}

async function saveSnapshot(){
  showMessage('Salvando patrimônio do mês...');

  const payload = {
    user_id:user.id,
    reference_month:referenceMonth(),
    accounts_total:currentSnapshot.accounts_total,
    investments_total:currentSnapshot.investments_total,
    cards_total:currentSnapshot.cards_total,
    net_worth:currentSnapshot.net_worth,
    notes:'Snapshot mensal gerado pelo FinZen.',
    updated_at:new Date().toISOString()
  };

  const { error } = await supabase
    .from('patrimony_history')
    .upsert(payload, {
      onConflict:'user_id,reference_month'
    });

  if(error){
    showMessage('Erro ao salvar patrimônio: ' + error.message, 'danger');
    return;
  }

  showMessage('Patrimônio do mês salvo.', 'success');
  await loadHistory();
  await renderSummary();
}

async function loadHistory(){
  const { data, error } = await supabase
    .from('patrimony_history')
    .select('*')
    .eq('user_id', user.id)
    .order('reference_month', { ascending:false })
    .limit(24);

  if(error){
    historyList.innerHTML = '<p class="muted" style="padding:18px">Erro ao carregar histórico.</p>';
    return;
  }

  if(!data || !data.length){
    historyList.innerHTML = '<p class="muted" style="padding:18px">Nenhum histórico salvo ainda.</p>';
    return;
  }

  historyList.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Mês</th>
          <th>Contas</th>
          <th>Investimentos</th>
          <th>Cartões</th>
          <th>Patrimônio</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(item => `
          <tr>
            <td>${formatMonth(item.reference_month)}</td>
            <td class="money">${formatCurrency(item.accounts_total || 0, 'BRL')}</td>
            <td class="money">${formatCurrency(item.investments_total || 0, 'BRL')}</td>
            <td class="money negative">${formatCurrency(item.cards_total || 0, 'BRL')}</td>
            <td class="money positive">${formatCurrency(item.net_worth || 0, 'BRL')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

btnReload.addEventListener('click', calculateSnapshot);
btnSaveSnapshot.addEventListener('click', saveSnapshot);

await calculateSnapshot();
await loadHistory();

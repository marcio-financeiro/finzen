import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');

const accountsList = document.getElementById('accountsList');
const cardsList = document.getElementById('cardsList');
const categoriesList = document.getElementById('categoriesList');

const { data: sessionData } = await supabase.auth.getSession();

if(!sessionData.session){
  navigate('../login.html');
}

const user = sessionData.session.user;
userEmail.innerText = user.email;

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(item => {
      item.classList.remove('btn-primary');
      item.classList.add('btn-secondary');
    });

    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-primary');

    document.querySelectorAll('.tab-panel').forEach(panel => panel.style.display = 'none');
    document.getElementById(`tab-${btn.dataset.tab}`).style.display = '';
  });
});

async function loadAccounts(){
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending:true })
    .order('nome', { ascending:true });

  if(error){
    accountsList.innerHTML = '<p class="muted" style="padding:18px">Erro ao carregar contas.</p>';
    return;
  }

  accountsList.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Conta</th><th>Banco</th><th>Tipo</th><th>Saldo</th><th>Status</th></tr></thead>
      <tbody>
        ${(data || []).map(item => `
          <tr>
            <td>${item.nome}</td>
            <td>${item.bank || '-'}</td>
            <td>${item.type || '-'}</td>
            <td class="money">${formatCurrency(item.saldo_atual || 0, item.currency || 'BRL')}</td>
            <td><span class="badge ${item.active ? 'success' : 'danger'}">${item.active ? 'ativa' : 'inativa'}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function loadCards(){
  const { data, error } = await supabase
    .from('credit_cards')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending:true })
    .order('nome', { ascending:true });

  if(error){
    cardsList.innerHTML = '<p class="muted" style="padding:18px">Erro ao carregar cartões.</p>';
    return;
  }

  cardsList.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Cartão</th><th>Banco</th><th>Limite</th><th>Vencimento</th><th>Status</th></tr></thead>
      <tbody>
        ${(data || []).map(item => `
          <tr>
            <td>${item.nome}</td>
            <td>${item.banco || '-'}</td>
            <td class="money">${formatCurrency(item.limite || 0, 'BRL')}</td>
            <td>${item.vencimento_dia || '-'}</td>
            <td><span class="badge ${item.ativo ? 'success' : 'danger'}">${item.ativo ? 'ativo' : 'inativo'}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function loadCategories(){
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user.id)
    .order('tipo', { ascending:true })
    .order('sort_order', { ascending:true })
    .order('nome', { ascending:true });

  if(error){
    categoriesList.innerHTML = '<p class="muted" style="padding:18px">Erro ao carregar categorias.</p>';
    return;
  }

  const groups = [
    ['receita','Receitas'],
    ['despesa','Despesas'],
    ['investimento','Investimentos'],
    ['transferencia','Transferências']
  ];

  categoriesList.innerHTML = groups.map(([tipo, title]) => {
    const items = (data || []).filter(item => item.tipo === tipo);
    if(!items.length) return '';

    return `
      <div class="panel-header"><h2>${title}</h2></div>
      <table class="data-table">
        <thead><tr><th>Ícone</th><th>Categoria</th><th>Orçamento</th><th>Status</th></tr></thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${item.icon || '-'}</td>
              <td>${item.nome}</td>
              <td class="money">${item.budget_amount ? formatCurrency(item.budget_amount, 'BRL') : '-'}</td>
              <td><span class="badge ${item.ativo ? 'success' : 'danger'}">${item.ativo ? 'ativa' : 'inativa'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }).join('');
}

await Promise.all([loadAccounts(), loadCards(), loadCategories()]);

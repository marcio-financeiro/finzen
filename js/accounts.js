import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');
const btnSalvarConta = document.getElementById('btnSalvarConta');
const nomeConta = document.getElementById('nomeConta');
const bancoConta = document.getElementById('bancoConta');
const accountKindConta = document.getElementById('accountKindConta');
const tipoConta = document.getElementById('tipoConta');
const moedaConta = document.getElementById('moedaConta');
const corConta = document.getElementById('corConta');
const saldoInicial = document.getElementById('saldoInicial');
const statusConta = document.getElementById('statusConta');
const mensagemConta = document.getElementById('mensagemConta');
const listaContas = document.getElementById('listaContas');

const { data } = await supabase.auth.getSession();

if(!data.session){
  navigate('../login.html');
}

const user = data.session.user;
userEmail.innerText = user.email;

function mostrarMensagem(texto, tipo = 'info'){
  mensagemConta.className = `message ${tipo}`;
  mensagemConta.innerText = texto;
}

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

btnSalvarConta.addEventListener('click', salvarConta);

async function salvarConta(){
  mostrarMensagem('Salvando conta...');

  const nome = nomeConta.value.trim();
  const banco = bancoConta.value.trim();
  const accountKind = accountKindConta ? accountKindConta.value : 'bank';
  const tipo = tipoConta.value;
  const moeda = moedaConta.value;
  const cor = corConta.value || '#4f8ef7';
  const saldo = Number(saldoInicial.value || 0);
  const ativo = statusConta.value === 'true';

  if(!nome || !tipo){
    mostrarMensagem('Preencha nome e tipo da conta.', 'warning');
    return;
  }

  const { error } = await supabase.from('accounts').insert({
    user_id:user.id,
    nome:nome,
    bank:banco,
    tipo:tipo,
    account_kind:accountKind,
    broker_name:accountKind === 'broker' ? (banco || nome) : null,
    currency:moeda,
    color:cor,
    saldo_inicial:saldo,
    saldo_atual:saldo,
    active:ativo
  });

  if(error){
    mostrarMensagem('Erro ao salvar: ' + error.message, 'danger');
    return;
  }

  nomeConta.value = '';
  bancoConta.value = '';
  if(accountKindConta) accountKindConta.value = 'bank';
  tipoConta.value = '';
  moedaConta.value = 'BRL';
  corConta.value = '#4f8ef7';
  saldoInicial.value = '';
  statusConta.value = 'true';

  mostrarMensagem('Conta salva com sucesso.', 'success');
  carregarContas();
}

async function carregarContas(){
  const { data: contas, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending:false });

  if(error){
    listaContas.innerHTML = '<p class="muted">Erro ao carregar contas.</p>';
    return;
  }

  if(!contas || contas.length === 0){
    listaContas.innerHTML = '<p class="muted">Nenhuma conta cadastrada.</p>';
    return;
  }

  listaContas.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th></th>
          <th>Conta</th>
          <th>Instituição</th>
          <th>Uso</th>
          <th>Tipo</th>
          <th>Moeda</th>
          <th>Saldo Inicial</th>
          <th>Saldo Atual</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${contas.map(conta => `
          <tr>
            <td><span class="color-dot" style="background:${conta.color || '#4f8ef7'}"></span></td>
            <td>${conta.nome || ''}</td>
            <td>${conta.bank || '-'}</td>
            <td><span class="badge ${conta.account_kind === 'broker' ? 'info' : 'neutral'}">${conta.account_kind === 'broker' ? 'corretora' : 'banco'}</span></td>
            <td>${conta.tipo || '-'}</td>
            <td>${conta.currency || 'BRL'}</td>
            <td class="money">${formatCurrency(conta.saldo_inicial, conta.currency || 'BRL')}</td>
            <td class="money">${formatCurrency(conta.saldo_atual, conta.currency || 'BRL')}</td>
            <td><span class="badge ${conta.active ? 'success' : 'danger'}">${conta.active ? 'ativa' : 'inativa'}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

carregarContas();

import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');
const btnSalvarTransacao = document.getElementById('btnSalvarTransacao');

const tipoTransacao = document.getElementById('tipoTransacao');
const contaTransacao = document.getElementById('contaTransacao');
const categoriaTransacao = document.getElementById('categoriaTransacao');
const descricaoTransacao = document.getElementById('descricaoTransacao');
const valorTransacao = document.getElementById('valorTransacao');
const dataTransacao = document.getElementById('dataTransacao');
const statusTransacao = document.getElementById('statusTransacao');
const observacaoTransacao = document.getElementById('observacaoTransacao');

const mensagemTransacao = document.getElementById('mensagemTransacao');
const listaTransacoes = document.getElementById('listaTransacoes');

let user = null;
let contas = [];
let categorias = [];

function mostrarMensagem(texto, tipo = 'info'){
  mensagemTransacao.className = `message ${tipo}`;
  mensagemTransacao.innerText = texto;
}

function hojeISO(){
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

const { data } = await supabase.auth.getSession();

if(!data.session){
  navigate('../login.html');
}

user = data.session.user;
dataTransacao.value = hojeISO();

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

btnSalvarTransacao.addEventListener('click', salvarTransacao);

tipoTransacao.addEventListener('change', () => {
  preencherCategoriasPorTipo(tipoTransacao.value);
});

async function iniciar(){
  mostrarMensagem('Carregando dados...');
  await carregarContas();
  await carregarCategorias();
  await carregarTransacoes();
  mostrarMensagem('');
}

async function carregarContas(){
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('nome', { ascending:true });

  if(error){
    contaTransacao.innerHTML = '<option value="">Erro ao carregar contas</option>';
    mostrarMensagem('Erro ao carregar contas: ' + error.message, 'danger');
    return;
  }

  contas = data || [];

  if(contas.length === 0){
    contaTransacao.innerHTML = '<option value="">Cadastre uma conta primeiro</option>';
    return;
  }

  contaTransacao.innerHTML = `
    <option value="">Selecione a conta</option>
    ${contas.map(conta => `
      <option value="${conta.id}">
        ${conta.nome} ${conta.bank ? '- ' + conta.bank : ''}
      </option>
    `).join('')}
  `;
}

async function carregarCategorias(){
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user.id)
    .eq('ativo', true)
    .order('nome', { ascending:true });

  if(error){
    categoriaTransacao.innerHTML = '<option value="">Erro ao carregar categorias</option>';
    mostrarMensagem('Erro ao carregar categorias: ' + error.message, 'danger');
    return;
  }

  categorias = data || [];
  preencherCategoriasPorTipo(tipoTransacao.value);
}

function preencherCategoriasPorTipo(tipo){
  let filtradas = categorias;

  if(tipo === 'receita'){
    filtradas = categorias.filter(categoria => categoria.tipo === 'receita');
  }

  if(tipo === 'despesa'){
    filtradas = categorias.filter(categoria => categoria.tipo === 'despesa' || categoria.tipo === 'investimento');
  }

  if(filtradas.length === 0){
    categoriaTransacao.innerHTML = '<option value="">Nenhuma categoria disponível</option>';
    return;
  }

  categoriaTransacao.innerHTML = `
    <option value="">Selecione a categoria</option>
    ${filtradas.map(categoria => `
      <option value="${categoria.id}">
        ${categoria.icon || ''} ${categoria.nome}
      </option>
    `).join('')}
  `;
}

async function salvarTransacao(){
  mostrarMensagem('Salvando lançamento...');

  const tipo = tipoTransacao.value;
  const accountId = contaTransacao.value;
  const categoryId = categoriaTransacao.value || null;
  const description = descricaoTransacao.value.trim();
  const amount = Number(valorTransacao.value || 0);
  const date = dataTransacao.value;
  const status = statusTransacao.value;
  const notes = observacaoTransacao.value.trim();

  if(!tipo || !accountId || !description || !amount || !date){
    mostrarMensagem('Preencha tipo, conta, descrição, valor e data.', 'warning');
    return;
  }

  const { error } = await supabase
    .from('transactions')
    .insert({
      user_id:user.id,
      account_id:accountId,
      category_id:categoryId,
      type:tipo,
      amount:amount,
      description:description,
      date:date,
      status:status,
      notes:notes
    });

  if(error){
    mostrarMensagem('Erro ao salvar: ' + error.message, 'danger');
    return;
  }

  if(status === 'pago'){
    const saldoAtualizado = await atualizarSaldoConta(accountId, tipo, amount);

    if(!saldoAtualizado){
      return;
    }
  }

  limparFormulario();
  mostrarMensagem('Lançamento salvo e saldo atualizado.', 'success');

  await carregarContas();
  await carregarTransacoes();
}

async function atualizarSaldoConta(accountId, tipo, amount){
  const { data: conta, error: erroConta } = await supabase
    .from('accounts')
    .select('saldo_atual')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if(erroConta){
    mostrarMensagem('Lançamento salvo, mas erro ao ler saldo: ' + erroConta.message, 'danger');
    return false;
  }

  const saldoAtual = Number(conta.saldo_atual || 0);

  const novoSaldo =
    tipo === 'receita'
      ? saldoAtual + amount
      : saldoAtual - amount;

  const { error: erroUpdate } = await supabase
    .from('accounts')
    .update({ saldo_atual: novoSaldo })
    .eq('id', accountId)
    .eq('user_id', user.id);

  if(erroUpdate){
    mostrarMensagem('Lançamento salvo, mas erro ao atualizar saldo: ' + erroUpdate.message, 'danger');
    return false;
  }

  return true;
}

async function carregarTransacoes(){
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      id,
      type,
      amount,
      description,
      date,
      status,
      notes,
      account_id,
      category_id,
      accounts:account_id (
        nome,
        bank,
        currency
      ),
      categories:category_id (
        nome,
        icon,
        cor,
        tipo
      )
    `)
    .eq('user_id', user.id)
    .order('date', { ascending:false })
    .order('created_at', { ascending:false })
    .limit(50);

  if(error){
    listaTransacoes.innerHTML = '<p class="muted">Erro ao carregar lançamentos.</p>';
    mostrarMensagem('Erro ao listar: ' + error.message, 'danger');
    return;
  }

  if(!data || data.length === 0){
    listaTransacoes.innerHTML = '<p class="muted">Nenhum lançamento cadastrado.</p>';
    return;
  }

  listaTransacoes.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Tipo</th>
          <th>Descrição</th>
          <th>Conta</th>
          <th>Categoria</th>
          <th>Status</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(transacao => `
          <tr>
            <td>${formatarData(transacao.date)}</td>
            <td>
              <span class="badge ${transacao.type === 'receita' ? 'success' : 'danger'}">
                ${transacao.type}
              </span>
            </td>
            <td>${transacao.description}</td>
            <td>${transacao.accounts?.nome || '-'}</td>
            <td>
              ${transacao.categories?.icon || ''}
              ${transacao.categories?.nome || '-'}
            </td>
            <td>
              <span class="badge ${transacao.status === 'pago' ? 'success' : 'neutral'}">
                ${transacao.status}
              </span>
            </td>
            <td class="money ${transacao.type === 'receita' ? 'positive' : 'negative'}">
              ${transacao.type === 'receita' ? '+' : '-'}
              ${formatCurrency(transacao.amount, transacao.accounts?.currency || 'BRL')}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function formatarData(dataISO){
  if(!dataISO) return '-';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

function limparFormulario(){
  tipoTransacao.value = '';
  contaTransacao.value = '';
  categoriaTransacao.innerHTML = '<option value="">Selecione o tipo primeiro</option>';
  descricaoTransacao.value = '';
  valorTransacao.value = '';
  dataTransacao.value = hojeISO();
  statusTransacao.value = 'pago';
  observacaoTransacao.value = '';
}

iniciar();

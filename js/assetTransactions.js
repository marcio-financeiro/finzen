import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');
const btnSalvarMovimento = document.getElementById('btnSalvarMovimento');

const ativoMovimento = document.getElementById('ativoMovimento');
const tipoMovimento = document.getElementById('tipoMovimento');
const quantidadeMovimento = document.getElementById('quantidadeMovimento');
const precoMovimento = document.getElementById('precoMovimento');
const valorTotalMovimento = document.getElementById('valorTotalMovimento');
const exchangeRateMovimento = document.getElementById('exchangeRateMovimento');
const dataMovimento = document.getElementById('dataMovimento');
const observacaoMovimento = document.getElementById('observacaoMovimento');

const mensagemMovimento = document.getElementById('mensagemMovimento');
const listaMovimentos = document.getElementById('listaMovimentos');

let user = null;
let ativos = [];

function mostrarMensagem(texto, tipo = 'info'){
  mensagemMovimento.className = `message ${tipo}`;
  mensagemMovimento.innerText = texto;
}

function hojeISO(){
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function formatarData(dataISO){
  if(!dataISO) return '-';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

function calcularValorTotal(){
  const quantidade = Number(quantidadeMovimento.value || 0);
  const preco = Number(precoMovimento.value || 0);

  if(quantidade && preco){
    valorTotalMovimento.value = (quantidade * preco).toFixed(2);
  }
}

const { data } = await supabase.auth.getSession();

if(!data.session){
  navigate('../login.html');
}

user = data.session.user;
userEmail.innerText = user.user_metadata?.full_name || user.email.split('@')[0];
dataMovimento.value = hojeISO();

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

btnSalvarMovimento.addEventListener('click', salvarMovimento);
quantidadeMovimento.addEventListener('input', calcularValorTotal);
precoMovimento.addEventListener('input', calcularValorTotal);

tipoMovimento.addEventListener('change', () => {
  const tipo = tipoMovimento.value;

  if(['dividendo', 'jcp', 'rendimento_fii'].includes(tipo)){
    quantidadeMovimento.value = '';
    precoMovimento.value = '';
  }
});

async function iniciar(){
  mostrarMensagem('Carregando ativos...');
  await carregarAtivos();
  await carregarMovimentos();
  mostrarMensagem('');
}

async function carregarAtivos(){
  const { data, error } = await supabase
    .from('investments')
    .select('*')
    .eq('user_id', user.id)
    .eq('ativo', true)
    .order('ticker', { ascending:true });

  if(error){
    ativoMovimento.innerHTML = '<option value="">Erro ao carregar ativos</option>';
    mostrarMensagem('Erro ao carregar ativos: ' + error.message, 'danger');
    return;
  }

  ativos = data || [];

  if(!ativos.length){
    ativoMovimento.innerHTML = '<option value="">Cadastre um ativo primeiro</option>';
    return;
  }

  ativoMovimento.innerHTML = `
    <option value="">Selecione o ativo</option>
    ${ativos.map(ativo => `
      <option value="${ativo.id}">
        ${ativo.ticker} ${ativo.nome ? '- ' + ativo.nome : ''}
      </option>
    `).join('')}
  `;
}

async function salvarMovimento(){
  mostrarMensagem('Salvando movimentação...');

  const investmentId = ativoMovimento.value;
  const tipo = tipoMovimento.value;
  const quantidade = quantidadeMovimento.value ? Number(quantidadeMovimento.value) : null;
  const preco = precoMovimento.value ? Number(precoMovimento.value) : null;
  const valorTotal = Number(valorTotalMovimento.value || 0);
  const exchangeRate = exchangeRateMovimento?.value ? Number(exchangeRateMovimento.value) : null;
  const dataMov = dataMovimento.value;
  const observacao = observacaoMovimento.value.trim();

  if(!investmentId || !tipo || !valorTotal || !dataMov){
    mostrarMensagem('Preencha ativo, tipo, valor total e data.', 'warning');
    return;
  }

  if(['compra', 'venda'].includes(tipo) && (!quantidade || !preco)){
    mostrarMensagem('Para compra ou venda, informe quantidade e preço unitário.', 'warning');
    return;
  }

  const { error } = await supabase
    .from('investment_transactions')
    .insert({
      user_id:user.id,
      investment_id:investmentId,
      tipo:tipo,
      quantidade:quantidade,
      preco:preco,
      valor_total:valorTotal,
      data_movimento:dataMov,
      observacao:observacao
    });

  if(error){
    mostrarMensagem('Erro ao salvar: ' + error.message, 'danger');
    return;
  }

  const ok = await recalcularAtivo(investmentId);

  if(!ok){
    return;
  }

  limparFormulario();
  mostrarMensagem('Movimentação salva e carteira recalculada.', 'success');

  await carregarAtivos();
  await carregarMovimentos();
}

async function recalcularAtivo(investmentId){
  const { error } = await supabase.rpc(
    'recalculate_investment',
    {
      p_investment_id: investmentId
    }
  );

  if(error){
    mostrarMensagem('Movimento salvo, mas erro ao recalcular carteira: ' + error.message, 'danger');
    return false;
  }

  return true;
}

async function carregarMovimentos(){
  const { data, error } = await supabase
    .from('investment_transactions')
    .select(`
      id,
      tipo,
      quantidade,
      preco,
      valor_total,
      data_movimento,
      observacao,
      investments:investment_id (
        ticker,
        nome,
        moeda
      )
    `)
    .eq('user_id', user.id)
    .order('data_movimento', { ascending:false })
    .order('created_at', { ascending:false })
    .limit(100);

  if(error){
    listaMovimentos.innerHTML = '<p class="muted">Erro ao carregar movimentações.</p>';
    mostrarMensagem('Erro ao listar: ' + error.message, 'danger');
    return;
  }

  if(!data || !data.length){
    listaMovimentos.innerHTML = '<p class="muted">Nenhuma movimentação cadastrada.</p>';
    return;
  }

  listaMovimentos.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Ativo</th>
          <th>Tipo</th>
          <th>Quantidade</th>
          <th>Preço</th>
          <th>Valor Total</th>
          <th>Observação</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(item => {
          const moeda = item.investments?.moeda || 'BRL';

          return `
            <tr>
              <td>${formatarData(item.data_movimento)}</td>
              <td><strong>${item.investments?.ticker || '-'}</strong><br><span class="muted">${item.investments?.nome || ''}</span></td>
              <td><span class="badge ${classeTipo(item.tipo)}">${item.tipo}</span></td>
              <td class="money">${item.quantidade ? Number(item.quantidade).toLocaleString('pt-BR') : '-'}</td>
              <td class="money">${item.preco ? formatCurrency(item.preco, moeda) : '-'}</td>
              <td class="money">${formatCurrency(item.valor_total || 0, moeda)}</td>
              <td>${item.observacao || '-'}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function classeTipo(tipo){
  if(tipo === 'compra') return 'success';
  if(tipo === 'venda') return 'danger';
  if(['dividendo', 'jcp', 'rendimento_fii'].includes(tipo)) return 'info';
  return 'neutral';
}

function limparFormulario(){
  ativoMovimento.value = '';
  tipoMovimento.value = '';
  quantidadeMovimento.value = '';
  precoMovimento.value = '';
  valorTotalMovimento.value = '';
  dataMovimento.value = hojeISO();
  observacaoMovimento.value = '';
}

iniciar();

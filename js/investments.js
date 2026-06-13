import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';
import { listBrokerAccounts } from './services/accountService.js';
import { DEFAULT_USD_BRL, formatPercent, formatUSD, getUsdBrlRate, saveUsdBrlRate } from './services/financeService.js';
import { calculateAppliedValue, calculateBRLValue, calculateCurrentValue, listActiveInvestments, saveInvestmentPosition, softDeleteInvestment } from './services/investmentService.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');
const btnSalvarAtivo = document.getElementById('btnSalvarAtivo');

const tickerAtivo = document.getElementById('tickerAtivo');
const nomeAtivo = document.getElementById('nomeAtivo');
const tipoAtivo = document.getElementById('tipoAtivo');
const quantidadeAtivo = document.getElementById('quantidadeAtivo');
const precoMedioAtivo = document.getElementById('precoMedioAtivo');
const cotacaoAtualAtivo = document.getElementById('cotacaoAtualAtivo');
const moedaAtivo = document.getElementById('moedaAtivo');
const corretoraAtivo = document.getElementById('corretoraAtivo');

const dolarReferencia = document.getElementById('dolarReferencia');
const btnSalvarDolar = document.getElementById('btnSalvarDolar');
const mensagemDolar = document.getElementById('mensagemDolar');

const mensagemInvestimento = document.getElementById('mensagemInvestimento');
const listaInvestimentos = document.getElementById('listaInvestimentos');

const patrimonioInvestido = document.getElementById('patrimonioInvestido');
const totalAplicado = document.getElementById('totalAplicado');
const totalAtivos = document.getElementById('totalAtivos');
const exteriorUsd = document.getElementById('exteriorUsd');
const exteriorBrl = document.getElementById('exteriorBrl');

const { data } = await supabase.auth.getSession();

if(!data.session){
  navigate('../login.html');
}

const user = data.session.user;
userEmail.innerText = user.email;

let dolarAtual = DEFAULT_USD_BRL;
let brokerAccounts = [];

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

btnSalvarAtivo.addEventListener('click', salvarAtivo);
if(btnSalvarDolar) btnSalvarDolar.addEventListener('click', salvarDolarReferencia);
if(corretoraAtivo) corretoraAtivo.addEventListener('change', ajustarMoedaPelaCorretora);

function mostrarMensagem(texto, tipo = 'info'){
  mensagemInvestimento.className = `message ${tipo}`;
  mensagemInvestimento.innerText = texto;
}

function mostrarMensagemDolar(texto, tipo = 'info'){
  if(!mensagemDolar) return;
  mensagemDolar.className = `message ${tipo}`;
  mensagemDolar.innerText = texto;
}

async function carregarDolarReferencia(){
  try{
    dolarAtual = await getUsdBrlRate(user.id);
  }catch(error){
    dolarAtual = DEFAULT_USD_BRL;
  }

  if(dolarReferencia){
    dolarReferencia.value = dolarAtual;
  }
}

async function salvarDolarReferencia(){
  try{
    dolarAtual = await saveUsdBrlRate(user.id, dolarReferencia?.value || 0);
    mostrarMensagemDolar('Dólar atualizado.', 'success');
    await carregarInvestimentos();
  }catch(error){
    mostrarMensagemDolar('Erro ao salvar dólar: ' + error.message, 'danger');
  }
}

async function carregarCorretoras(){
  if(!corretoraAtivo) return;

  try{
    brokerAccounts = await listBrokerAccounts(user.id);
  }catch(error){
    corretoraAtivo.innerHTML = '<option value="">Erro ao carregar corretoras</option>';
    mostrarMensagem('Erro ao carregar corretoras: ' + error.message, 'danger');
    return;
  }

  if(!brokerAccounts.length){
    corretoraAtivo.innerHTML = '<option value="">Cadastre uma corretora em Contas</option>';
    return;
  }

  corretoraAtivo.innerHTML = `
    <option value="">Selecione a corretora</option>
    ${brokerAccounts.map(account => `
      <option value="${account.nome}" data-currency="${account.currency || 'BRL'}">
        ${account.nome} - ${account.currency || 'BRL'}
      </option>
    `).join('')}
  `;
}

function ajustarMoedaPelaCorretora(){
  const selected = corretoraAtivo?.options[corretoraAtivo.selectedIndex];
  const currency = selected?.dataset?.currency;

  if(currency && moedaAtivo){
    moedaAtivo.value = currency;
  }
}

async function salvarAtivo(){
  mostrarMensagem('Salvando ativo...');

  const ticker = tickerAtivo.value.trim().toUpperCase();
  const nome = nomeAtivo.value.trim();
  const tipo = tipoAtivo.value;
  const quantidade = Number(quantidadeAtivo.value || 0);
  const precoMedio = Number(precoMedioAtivo.value || 0);
  const cotacaoAtual = cotacaoAtualAtivo.value ? Number(cotacaoAtualAtivo.value) : null;
  const moeda = moedaAtivo.value || 'BRL';
  const corretora = corretoraAtivo.value;

  if(!ticker || !tipo || !quantidade || !precoMedio){
    mostrarMensagem('Preencha ticker, tipo, quantidade e preço médio.', 'warning');
    return;
  }

  if(!corretora){
    mostrarMensagem('Selecione a corretora.', 'warning');
    return;
  }

  try{
    const { existing } = await saveInvestmentPosition({
      userId:user.id,
      ticker,
      name:nome,
      type:tipo,
      quantity:quantidade,
      averagePrice:precoMedio,
      currentPrice:cotacaoAtual,
      currency:moeda,
      brokerName:corretora,
      usdBrlRate:dolarAtual
    });

    limparFormulario();
    mostrarMensagem(existing ? 'Ativo consolidado com posição existente.' : 'Ativo salvo com sucesso.', 'success');
    await carregarInvestimentos();
  }catch(error){
    mostrarMensagem('Erro ao salvar: ' + error.message, 'danger');
  }
}

async function excluirAtivo(id, ticker){
  const ok = confirm(`Excluir o ativo ${ticker}? Ele será removido da carteira ativa.`);

  if(!ok) return;

  try{
    await softDeleteInvestment(user.id, id);
    mostrarMensagem('Ativo excluído da carteira.', 'success');
    await carregarInvestimentos();
  }catch(error){
    mostrarMensagem('Erro ao excluir ativo: ' + error.message, 'danger');
  }
}

async function carregarInvestimentos(){
  try{
    const ativos = await listActiveInvestments(user.id);

    renderizarResumo(ativos);
    renderizarCarteira(ativos);
  }catch(error){
    listaInvestimentos.innerHTML = '<p class="muted">Erro ao carregar investimentos.</p>';
    mostrarMensagem('Erro ao listar: ' + error.message, 'danger');
  }
}

function valorAplicado(item){
  return calculateAppliedValue(item);
}

function valorAtual(item){
  return calculateCurrentValue(item);
}

function valorBRL(item, valor){
  return calculateBRLValue(item, valor, dolarAtual);
}

function renderizarResumo(ativos){
  const aplicadoBRL = ativos.reduce((soma, item) => soma + valorBRL(item, valorAplicado(item)), 0);
  const patrimonioBRL = ativos.reduce((soma, item) => soma + valorBRL(item, valorAtual(item)), 0);

  const exteriorTotalUsd = ativos
    .filter(item => (item.moeda || 'BRL') === 'USD')
    .reduce((soma, item) => soma + valorAtual(item), 0);

  totalAplicado.innerText = formatCurrency(aplicadoBRL, 'BRL');
  patrimonioInvestido.innerText = formatCurrency(patrimonioBRL, 'BRL');
  totalAtivos.innerText = String(ativos.length);

  if(exteriorUsd){
    exteriorUsd.innerText = formatUSD(exteriorTotalUsd);
  }

  if(exteriorBrl){
    exteriorBrl.innerText = formatCurrency(exteriorTotalUsd * dolarAtual, 'BRL');
  }
}

function renderizarCarteira(ativos){
  if(!ativos.length){
    listaInvestimentos.innerHTML = '<p class="muted">Nenhum ativo cadastrado.</p>';
    return;
  }

  listaInvestimentos.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Ticker</th>
          <th>Nome</th>
          <th>Tipo</th>
          <th>Quantidade</th>
          <th>Preço Médio</th>
          <th>Cotação</th>
          <th>Total Aplicado</th>
          <th>Valor Atual</th>
          <th>Resultado</th>
          <th>Corretora</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${ativos.map(item => {
          const quantidade = Number(item.quantidade || 0);
          const precoMedio = Number(item.preco_medio || 0);
          const cotacao = Number(item.cotacao_atual || item.preco_medio || 0);
          const moeda = item.moeda || 'BRL';

          const aplicado = valorAplicado(item);
          const atual = valorAtual(item);
          const resultado = atual - aplicado;
          const percentual = aplicado ? (resultado / aplicado) * 100 : 0;

          return `
            <tr>
              <td><strong>${item.ticker || '-'}</strong></td>
              <td>${item.nome || '-'}</td>
              <td>${item.tipo || '-'}</td>
              <td class="money">${quantidade.toLocaleString('pt-BR')}</td>
              <td class="money">${formatCurrency(precoMedio, moeda)}</td>
              <td class="money">${formatCurrency(cotacao, moeda)}</td>
              <td class="money">
                ${formatCurrency(aplicado, moeda)}
                ${moeda === 'USD' ? `<br><span class="muted">${formatCurrency(valorBRL(item, aplicado), 'BRL')}</span>` : ''}
              </td>
              <td class="money">
                ${formatCurrency(atual, moeda)}
                ${moeda === 'USD' ? `<br><span class="muted">${formatCurrency(valorBRL(item, atual), 'BRL')}</span>` : ''}
              </td>
              <td class="money ${resultado >= 0 ? 'positive' : 'negative'}">
                ${formatCurrency(resultado, moeda)}<br>${formatPercent(percentual)}
              </td>
              <td>${item.corretora || '-'}</td>
              <td>
                <button type="button" class="btn btn-danger compact" onclick="window.excluirAtivoFinZen('${item.id}', '${item.ticker}')">
                  Excluir
                </button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function limparFormulario(){
  tickerAtivo.value = '';
  nomeAtivo.value = '';
  tipoAtivo.value = '';
  quantidadeAtivo.value = '';
  precoMedioAtivo.value = '';
  cotacaoAtualAtivo.value = '';
  moedaAtivo.value = 'BRL';
  corretoraAtivo.value = '';
}

window.excluirAtivoFinZen = excluirAtivo;

await carregarDolarReferencia();
await carregarCorretoras();
await carregarInvestimentos();

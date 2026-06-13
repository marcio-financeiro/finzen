import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');

const patrimonioTotal = document.getElementById('patrimonioTotal');
const totalAlvo = document.getElementById('totalAlvo');
const classeDefasada = document.getElementById('classeDefasada');

const classeAlvo = document.getElementById('classeAlvo');
const percentualAlvo = document.getElementById('percentualAlvo');
const btnSalvarAlvo = document.getElementById('btnSalvarAlvo');
const btnCriarPadrao = document.getElementById('btnCriarPadrao');

const valorAporte = document.getElementById('valorAporte');
const btnCalcularAporte = document.getElementById('btnCalcularAporte');
const sugestaoAporte = document.getElementById('sugestaoAporte');

const tabelaAlocacao = document.getElementById('tabelaAlocacao');
const mensagemAlocacao = document.getElementById('mensagemAlocacao');

let user = null;
let investimentos = [];
let alvos = [];
let linhasAlocacao = [];

const classes = {
  acao:'Ações Brasil',
  fii:'FIIs',
  etf:'ETFs',
  renda_fixa:'Renda Fixa',
  cripto:'Cripto',
  exterior:'Exterior'
};

function mostrarMensagem(texto, tipo = 'info'){
  mensagemAlocacao.className = `message ${tipo}`;
  mensagemAlocacao.innerText = texto;
}

function formatarPercentual(valor){
  return Number(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits:2,
    maximumFractionDigits:2
  }) + '%';
}

const { data } = await supabase.auth.getSession();

if(!data.session){
  navigate('../login.html');
}

user = data.session.user;
userEmail.innerText = user.email;

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

btnSalvarAlvo.addEventListener('click', salvarAlvo);
btnCriarPadrao.addEventListener('click', criarPadrao);
btnCalcularAporte.addEventListener('click', calcularSugestaoAporte);

async function iniciar(){
  mostrarMensagem('Carregando alocação...');
  await carregarInvestimentos();
  await carregarAlvos();
  calcularAlocacao();
  mostrarMensagem('');
}

async function carregarInvestimentos(){
  const { data, error } = await supabase
    .from('investments')
    .select('*')
    .eq('user_id', user.id)
    .eq('ativo', true);

  if(error){
    mostrarMensagem('Erro ao carregar investimentos: ' + error.message, 'danger');
    return;
  }

  investimentos = data || [];
}

async function carregarAlvos(){
  const { data, error } = await supabase
    .from('allocation_targets')
    .select('*')
    .eq('user_id', user.id)
    .order('classe', { ascending:true });

  if(error){
    mostrarMensagem('Erro ao carregar alvos: ' + error.message, 'danger');
    return;
  }

  alvos = data || [];
}

async function salvarAlvo(){
  mostrarMensagem('Salvando alvo...');

  const classe = classeAlvo.value;
  const percentual = Number(percentualAlvo.value || 0);

  if(!classe || percentual <= 0){
    mostrarMensagem('Preencha classe e percentual alvo.', 'warning');
    return;
  }

  const existente = alvos.find(item => item.classe === classe);

  if(existente){
    const { error } = await supabase
      .from('allocation_targets')
      .update({
        percentual_alvo:percentual,
        updated_at:new Date().toISOString()
      })
      .eq('id', existente.id)
      .eq('user_id', user.id);

    if(error){
      mostrarMensagem('Erro ao atualizar alvo: ' + error.message, 'danger');
      return;
    }
  }else{
    const { error } = await supabase
      .from('allocation_targets')
      .insert({
        user_id:user.id,
        classe:classe,
        percentual_alvo:percentual
      });

    if(error){
      mostrarMensagem('Erro ao salvar alvo: ' + error.message, 'danger');
      return;
    }
  }

  classeAlvo.value = '';
  percentualAlvo.value = '';

  mostrarMensagem('Alvo salvo com sucesso.', 'success');

  await carregarAlvos();
  calcularAlocacao();
}

async function criarPadrao(){
  mostrarMensagem('Criando alocação padrão...');

  const padrao = [
    { classe:'acao', percentual_alvo:30 },
    { classe:'fii', percentual_alvo:25 },
    { classe:'exterior', percentual_alvo:25 },
    { classe:'etf', percentual_alvo:10 },
    { classe:'renda_fixa', percentual_alvo:10 }
  ];

  for(const item of padrao){
    const existente = alvos.find(alvo => alvo.classe === item.classe);

    if(existente){
      await supabase
        .from('allocation_targets')
        .update({
          percentual_alvo:item.percentual_alvo,
          updated_at:new Date().toISOString()
        })
        .eq('id', existente.id)
        .eq('user_id', user.id);
    }else{
      await supabase
        .from('allocation_targets')
        .insert({
          user_id:user.id,
          classe:item.classe,
          percentual_alvo:item.percentual_alvo
        });
    }
  }

  mostrarMensagem('Alocação padrão criada.', 'success');

  await carregarAlvos();
  calcularAlocacao();
}

function calcularAlocacao(){
  const patrimonioPorClasse = {};

  Object.keys(classes).forEach(classe => {
    patrimonioPorClasse[classe] = 0;
  });

  investimentos.forEach(item => {
    const classe = item.tipo;
    const quantidade = Number(item.quantidade || 0);
    const cotacao = Number(item.cotacao_atual || item.preco_medio || 0);
    const valorAtual = quantidade * cotacao;

    if(!patrimonioPorClasse[classe]){
      patrimonioPorClasse[classe] = 0;
    }

    patrimonioPorClasse[classe] += valorAtual;
  });

  const totalPatrimonio = Object.values(patrimonioPorClasse).reduce((soma, valor) => soma + valor, 0);
  const somaAlvos = alvos.reduce((soma, alvo) => soma + Number(alvo.percentual_alvo || 0), 0);

  linhasAlocacao = Object.keys(classes).map(classe => {
    const valorAtual = patrimonioPorClasse[classe] || 0;
    const percentualAtual = totalPatrimonio > 0 ? (valorAtual / totalPatrimonio) * 100 : 0;
    const alvo = alvos.find(item => item.classe === classe);
    const percentualIdeal = alvo ? Number(alvo.percentual_alvo || 0) : 0;
    const diferenca = percentualAtual - percentualIdeal;
    const valorIdeal = totalPatrimonio * (percentualIdeal / 100);
    const faltaValor = Math.max(valorIdeal - valorAtual, 0);

    return {
      classe,
      nome:classes[classe],
      valorAtual,
      percentualAtual,
      percentualIdeal,
      diferenca,
      valorIdeal,
      faltaValor
    };
  });

  patrimonioTotal.innerText = formatCurrency(totalPatrimonio, 'BRL');
  totalAlvo.innerText = formatarPercentual(somaAlvos);

  const maisDefasada = [...linhasAlocacao]
    .filter(item => item.percentualIdeal > 0)
    .sort((a,b) => a.diferenca - b.diferenca)[0];

  classeDefasada.innerText = maisDefasada
    ? maisDefasada.nome
    : '-';

  renderizarTabela();
}

function renderizarTabela(){
  if(!linhasAlocacao.length){
    tabelaAlocacao.innerHTML = '<p class="muted">Nenhum dado de alocação encontrado.</p>';
    return;
  }

  tabelaAlocacao.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Classe</th>
          <th>Valor Atual</th>
          <th>% Atual</th>
          <th>% Ideal</th>
          <th>Diferença</th>
          <th>Valor Ideal</th>
          <th>Falta</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${linhasAlocacao.map(item => {
          const status = item.diferenca >= 2
            ? { texto:'acima', classe:'danger' }
            : item.diferenca <= -2
              ? { texto:'abaixo', classe:'success' }
              : { texto:'ok', classe:'neutral' };

          return `
            <tr>
              <td>${item.nome}</td>
              <td class="money">${formatCurrency(item.valorAtual, 'BRL')}</td>
              <td>${formatarPercentual(item.percentualAtual)}</td>
              <td>${formatarPercentual(item.percentualIdeal)}</td>
              <td class="${item.diferenca < 0 ? 'positive' : 'negative'}">
                ${formatarPercentual(item.diferenca)}
              </td>
              <td class="money">${formatCurrency(item.valorIdeal, 'BRL')}</td>
              <td class="money">${formatCurrency(item.faltaValor, 'BRL')}</td>
              <td><span class="badge ${status.classe}">${status.texto}</span></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function calcularSugestaoAporte(){
  const aporte = Number(valorAporte.value || 0);

  if(aporte <= 0){
    sugestaoAporte.innerHTML = '<p class="muted">Informe um valor de aporte.</p>';
    return;
  }

  const classesDefasadas = linhasAlocacao
    .filter(item => item.percentualIdeal > 0 && item.faltaValor > 0)
    .sort((a,b) => b.faltaValor - a.faltaValor);

  if(!classesDefasadas.length){
    sugestaoAporte.innerHTML = '<p class="muted">Carteira próxima da alocação alvo.</p>';
    return;
  }

  const totalFaltante = classesDefasadas.reduce((soma, item) => soma + item.faltaValor, 0);

  sugestaoAporte.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Classe</th>
          <th>Falta para o ideal</th>
          <th>Sugestão de aporte</th>
        </tr>
      </thead>
      <tbody>
        ${classesDefasadas.map(item => {
          const sugestao = totalFaltante > 0
            ? aporte * (item.faltaValor / totalFaltante)
            : 0;

          return `
            <tr>
              <td>${item.nome}</td>
              <td class="money">${formatCurrency(item.faltaValor, 'BRL')}</td>
              <td class="money positive">${formatCurrency(sugestao, 'BRL')}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

iniciar();

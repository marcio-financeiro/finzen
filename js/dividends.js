import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');

const totalMes = document.getElementById('totalMes');
const totalAno = document.getElementById('totalAno');
const dividendosMes = document.getElementById('dividendosMes');
const jcpMes = document.getElementById('jcpMes');
const fiiMes = document.getElementById('fiiMes');
const impostoAno = document.getElementById('impostoAno');

const anoFiltro = document.getElementById('anoFiltro');
const tipoFiltro = document.getElementById('tipoFiltro');
const ativoFiltro = document.getElementById('ativoFiltro');
const btnFiltrar = document.getElementById('btnFiltrar');

const mensagemDividendos = document.getElementById('mensagemDividendos');
const listaDividendos = document.getElementById('listaDividendos');

let user = null;
let ativos = [];

function mostrarMensagem(texto, tipo = 'info'){
  mensagemDividendos.className = `message ${tipo}`;
  mensagemDividendos.innerText = texto;
}

function anoAtual(){
  return new Date().getFullYear();
}

function mesAtualISO(){
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

function formatarData(dataISO){
  if(!dataISO) return '-';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

function tipoLabel(tipo){
  if(tipo === 'dividendo') return 'Dividendo';
  if(tipo === 'jcp') return 'JCP';
  if(tipo === 'rendimento_fii') return 'Rendimento FII';
  return tipo || '-';
}

function classeTipo(tipo){
  if(tipo === 'dividendo') return 'success';
  if(tipo === 'jcp') return 'info';
  if(tipo === 'rendimento_fii') return 'success';
  return 'neutral';
}

const { data } = await supabase.auth.getSession();

if(!data.session){
  navigate('../login.html');
}

user = data.session.user;
anoFiltro.value = anoAtual();

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

btnFiltrar.addEventListener('click', carregarDividendos);

async function iniciar(){
  mostrarMensagem('Carregando proventos...');
  await carregarAtivos();
  await carregarDividendos();
  mostrarMensagem('');
}

async function carregarAtivos(){
  const { data, error } = await supabase
    .from('investments')
    .select('id,ticker,nome')
    .eq('user_id', user.id)
    .eq('ativo', true)
    .order('ticker', { ascending:true });

  if(error){
    mostrarMensagem('Erro ao carregar ativos: ' + error.message, 'danger');
    return;
  }

  ativos = data || [];

  ativoFiltro.innerHTML = `
    <option value="">Todos os ativos</option>
    ${ativos.map(ativo => `
      <option value="${ativo.id}">
        ${ativo.ticker} ${ativo.nome ? '- ' + ativo.nome : ''}
      </option>
    `).join('')}
  `;
}

async function carregarDividendos(){
  const ano = Number(anoFiltro.value || anoAtual());
  const inicioAno = `${ano}-01-01`;
  const fimAno = `${ano}-12-31`;

  let query = supabase
    .from('investment_transactions')
    .select(`
      id,
      tipo,
      valor_total,
      valor_liquido,
      imposto_retido,
      data_movimento,
      observacao,
      investments:investment_id (
        id,
        ticker,
        nome,
        moeda
      )
    `)
    .eq('user_id', user.id)
    .in('tipo', ['dividendo', 'jcp', 'rendimento_fii'])
    .gte('data_movimento', inicioAno)
    .lte('data_movimento', fimAno)
    .order('data_movimento', { ascending:false });

  if(tipoFiltro.value){
    query = query.eq('tipo', tipoFiltro.value);
  }

  if(ativoFiltro.value){
    query = query.eq('investment_id', ativoFiltro.value);
  }

  const { data, error } = await query;

  if(error){
    listaDividendos.innerHTML = '<p class="muted">Erro ao carregar proventos.</p>';
    mostrarMensagem('Erro ao listar: ' + error.message, 'danger');
    return;
  }

  const proventos = data || [];

  renderizarResumo(proventos);
  renderizarTabela(proventos);
}

function renderizarResumo(proventos){
  const mesAtual = mesAtualISO();

  const totalAnoValor = proventos.reduce((soma, item) => {
    return soma + Number(item.valor_liquido || item.valor_total || 0);
  }, 0);

  const totalMesValor = proventos
    .filter(item => item.data_movimento?.startsWith(mesAtual))
    .reduce((soma, item) => soma + Number(item.valor_liquido || item.valor_total || 0), 0);

  const dividendosMesValor = proventos
    .filter(item => item.tipo === 'dividendo' && item.data_movimento?.startsWith(mesAtual))
    .reduce((soma, item) => soma + Number(item.valor_liquido || item.valor_total || 0), 0);

  const jcpMesValor = proventos
    .filter(item => item.tipo === 'jcp' && item.data_movimento?.startsWith(mesAtual))
    .reduce((soma, item) => soma + Number(item.valor_liquido || item.valor_total || 0), 0);

  const fiiMesValor = proventos
    .filter(item => item.tipo === 'rendimento_fii' && item.data_movimento?.startsWith(mesAtual))
    .reduce((soma, item) => soma + Number(item.valor_liquido || item.valor_total || 0), 0);

  const impostoAnoValor = proventos.reduce((soma, item) => {
    return soma + Number(item.imposto_retido || 0);
  }, 0);

  totalMes.innerText = formatCurrency(totalMesValor, 'BRL');
  totalAno.innerText = formatCurrency(totalAnoValor, 'BRL');
  dividendosMes.innerText = formatCurrency(dividendosMesValor, 'BRL');
  jcpMes.innerText = formatCurrency(jcpMesValor, 'BRL');
  fiiMes.innerText = formatCurrency(fiiMesValor, 'BRL');
  impostoAno.innerText = formatCurrency(impostoAnoValor, 'BRL');
}

function renderizarTabela(proventos){
  if(!proventos.length){
    listaDividendos.innerHTML = '<p class="muted">Nenhum provento encontrado.</p>';
    return;
  }

  listaDividendos.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Ativo</th>
          <th>Tipo</th>
          <th>Valor Bruto</th>
          <th>Imposto</th>
          <th>Valor Líquido</th>
          <th>Observação</th>
        </tr>
      </thead>
      <tbody>
        ${proventos.map(item => {
          const moeda = item.investments?.moeda || 'BRL';
          const bruto = Number(item.valor_total || 0);
          const imposto = Number(item.imposto_retido || 0);
          const liquido = Number(item.valor_liquido || (bruto - imposto));

          return `
            <tr>
              <td>${formatarData(item.data_movimento)}</td>
              <td>
                <strong>${item.investments?.ticker || '-'}</strong>
                <br>
                <span class="muted">${item.investments?.nome || ''}</span>
              </td>
              <td><span class="badge ${classeTipo(item.tipo)}">${tipoLabel(item.tipo)}</span></td>
              <td class="money">${formatCurrency(bruto, moeda)}</td>
              <td class="money negative">-${formatCurrency(imposto, moeda)}</td>
              <td class="money positive">${formatCurrency(liquido, moeda)}</td>
              <td>${item.observacao || '-'}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

iniciar();

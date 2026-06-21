import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');

const patrimonioInvestido = document.getElementById('patrimonioInvestido');
const totalAplicado = document.getElementById('totalAplicado');
const resultadoInvestimentos = document.getElementById('resultadoInvestimentos');
const dividendosMes = document.getElementById('dividendosMes');
const dividendosAno = document.getElementById('dividendosAno');
const yieldAno = document.getElementById('yieldAno');
const metaProxima = document.getElementById('metaProxima');
const classeDefasada = document.getElementById('classeDefasada');

const resumoClasses = document.getElementById('resumoClasses');
const resumoMetas = document.getElementById('resumoMetas');
const ultimosProventos = document.getElementById('ultimosProventos');
const patrimonioLiquidoAtual = document.getElementById('patrimonioLiquidoAtual');
const patrimonioMesAnterior = document.getElementById('patrimonioMesAnterior');
const evolucaoPatrimonial = document.getElementById('evolucaoPatrimonial');
const evolucaoPatrimonialPercent = document.getElementById('evolucaoPatrimonialPercent');
const patrimonioComposicao = document.getElementById('patrimonioComposicao');
const historicoPatrimonial = document.getElementById('historicoPatrimonial');
const btnSalvarPatrimonioMes = document.getElementById('btnSalvarPatrimonioMes');
const btnAtualizarPatrimonio = document.getElementById('btnAtualizarPatrimonio');
const mensagemPatrimonioHistorico = document.getElementById('mensagemPatrimonioHistorico');

let snapshotPatrimonialAtual = {
  accounts_total:0,
  investments_total:0,
  cards_total:0,
  net_worth:0
};


const classes = {
  acao:'Ações Brasil',
  fii:'FIIs',
  etf:'ETFs',
  renda_fixa:'Renda Fixa',
  cripto:'Cripto',
  exterior:'Exterior'
};

let user = null;
let totalPatrimonio = 0;
let totalAplicadoValor = 0;

const { data } = await supabase.auth.getSession();

if(!data.session){
  navigate('../login.html');
}

user = data.session.user;

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

function formatarPercentual(valor){
  return Number(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits:2,
    maximumFractionDigits:2
  }) + '%';
}

function mesAtualISO(){
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

function anoAtual(){
  return new Date().getFullYear();
}

function formatarData(dataISO){
  if(!dataISO) return '-';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}


function mostrarMensagemPatrimonio(texto, tipo = 'info'){
  if(!mensagemPatrimonioHistorico) return;
  mensagemPatrimonioHistorico.className = `message ${tipo}`;
  mensagemPatrimonioHistorico.innerText = texto;
}

function referenciaMesAtual(){
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatarMesReferencia(dateISO){
  if(!dateISO) return '-';
  const [ano, mes] = dateISO.split('-').map(Number);
  return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', {
    month:'long',
    year:'numeric'
  });
}

async function calcularTotalContas(){
  const { data, error } = await supabase
    .from('accounts')
    .select('saldo_atual')
    .eq('user_id', user.id)
    .eq('active', true);

  if(error){
    throw new Error('Erro ao calcular contas: ' + error.message);
  }

  return (data || []).reduce((sum, item) => sum + Number(item.saldo_atual || 0), 0);
}

async function calcularCartoesAbertos(){
  const hoje = new Date();
  const refAtual = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;

  const { data, error } = await supabase
    .from('card_transactions')
    .select('valor_parcela, valor_total, status, fatura_referencia')
    .eq('user_id', user.id)
    .eq('status', 'aberta')
    .eq('fatura_referencia', refAtual);

  if(error){
    throw new Error('Erro ao calcular cartões: ' + error.message);
  }

  return (data || []).reduce((sum, item) => {
    const parcela = Number(item.valor_parcela ?? 0);
    const total = Number(item.valor_total ?? 0);
    return sum + (parcela || total || 0);
  }, 0);
}

async function calcularHistoricoPatrimonial(){
  mostrarMensagemPatrimonio('Calculando patrimônio...');

  try{
    const contas = await calcularTotalContas();
    const cartoes = await calcularCartoesAbertos();
    const investimentos = Number(totalPatrimonio || 0);
    const liquido = contas + investimentos - cartoes;

    snapshotPatrimonialAtual = {
      accounts_total:Number(contas.toFixed(2)),
      investments_total:Number(investimentos.toFixed(2)),
      cards_total:Number(cartoes.toFixed(2)),
      net_worth:Number(liquido.toFixed(2))
    };

    renderizarComposicaoPatrimonial();
    await renderizarResumoHistoricoPatrimonial();
    mostrarMensagemPatrimonio('Patrimônio calculado.', 'success');
  }catch(error){
    mostrarMensagemPatrimonio(error.message, 'danger');
  }
}

function renderizarComposicaoPatrimonial(){
  if(!patrimonioComposicao) return;

  patrimonioComposicao.innerHTML = `
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
          <td class="money positive">${formatCurrency(snapshotPatrimonialAtual.accounts_total, 'BRL')}</td>
          <td>Soma ao patrimônio</td>
        </tr>
        <tr>
          <td>Investimentos</td>
          <td class="money positive">${formatCurrency(snapshotPatrimonialAtual.investments_total, 'BRL')}</td>
          <td>Soma ao patrimônio</td>
        </tr>
        <tr>
          <td>Cartões em aberto</td>
          <td class="money negative">${formatCurrency(snapshotPatrimonialAtual.cards_total, 'BRL')}</td>
          <td>Subtrai do patrimônio</td>
        </tr>
        <tr>
          <td><strong>Patrimônio líquido</strong></td>
          <td class="money"><strong>${formatCurrency(snapshotPatrimonialAtual.net_worth, 'BRL')}</strong></td>
          <td>Contas + Investimentos - Cartões</td>
        </tr>
      </tbody>
    </table>
  `;
}

async function renderizarResumoHistoricoPatrimonial(){
  if(!patrimonioLiquidoAtual) return;

  const { data, error } = await supabase
    .from('patrimony_history')
    .select('*')
    .eq('user_id', user.id)
    .order('reference_month', { ascending:false })
    .limit(3);

  const atual = snapshotPatrimonialAtual.net_worth;

  if(error){
    patrimonioLiquidoAtual.innerText = formatCurrency(atual, 'BRL');
    patrimonioMesAnterior.innerText = formatCurrency(0, 'BRL');
    evolucaoPatrimonial.innerText = formatCurrency(0, 'BRL');
    evolucaoPatrimonialPercent.innerText = '0,00%';
    return;
  }

  const mesAtual = referenciaMesAtual();
  const anterior = (data || []).find(item => item.reference_month !== mesAtual);
  const anteriorValor = Number(anterior?.net_worth || 0);
  const diff = atual - anteriorValor;
  const percent = anteriorValor ? (diff / anteriorValor) * 100 : 0;

  patrimonioLiquidoAtual.innerText = formatCurrency(atual, 'BRL');
  patrimonioMesAnterior.innerText = formatCurrency(anteriorValor, 'BRL');
  evolucaoPatrimonial.innerText = `${diff >= 0 ? '+' : ''}${formatCurrency(diff, 'BRL')}`;
  evolucaoPatrimonialPercent.innerText = `${percent >= 0 ? '+' : ''}${formatarPercentual(percent)}`;
}

async function salvarSnapshotPatrimonial(){
  mostrarMensagemPatrimonio('Salvando patrimônio do mês...');

  const payload = {
    user_id:user.id,
    reference_month:referenciaMesAtual(),
    accounts_total:snapshotPatrimonialAtual.accounts_total,
    investments_total:snapshotPatrimonialAtual.investments_total,
    cards_total:snapshotPatrimonialAtual.cards_total,
    net_worth:snapshotPatrimonialAtual.net_worth,
    notes:'Snapshot mensal gerado pelo FinZen.',
    updated_at:new Date().toISOString()
  };

  const { error } = await supabase
    .from('patrimony_history')
    .upsert(payload, { onConflict:'user_id,reference_month' });

  if(error){
    mostrarMensagemPatrimonio('Erro ao salvar patrimônio: ' + error.message, 'danger');
    return;
  }

  mostrarMensagemPatrimonio('Patrimônio do mês salvo.', 'success');
  await carregarHistoricoPatrimonial();
  await renderizarResumoHistoricoPatrimonial();
}

async function carregarHistoricoPatrimonial(){
  if(!historicoPatrimonial) return;

  const { data, error } = await supabase
    .from('patrimony_history')
    .select('*')
    .eq('user_id', user.id)
    .order('reference_month', { ascending:false })
    .limit(24);

  if(error){
    historicoPatrimonial.innerHTML = '<p class="muted">Erro ao carregar histórico patrimonial.</p>';
    return;
  }

  if(!data || !data.length){
    historicoPatrimonial.innerHTML = '<p class="muted">Nenhum histórico patrimonial salvo ainda.</p>';
    return;
  }

  historicoPatrimonial.innerHTML = `
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
            <td>${formatarMesReferencia(item.reference_month)}</td>
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


async function carregarTudo(){
  const [investimentos, proventos, metas, alvos] = await Promise.all([
    carregarInvestimentos(),
    carregarProventos(),
    carregarMetas(),
    carregarAlvos()
  ]);

  processarInvestimentos(investimentos, alvos);
  processarProventos(proventos);
  processarMetas(metas);
  renderizarProventos(proventos);
  await calcularHistoricoPatrimonial();
  await carregarHistoricoPatrimonial();
}

async function carregarInvestimentos(){
  const { data, error } = await supabase
    .from('investments')
    .select('*')
    .eq('user_id', user.id)
    .eq('ativo', true);

  if(error){
    resumoClasses.innerHTML = '<p class="muted">Erro ao carregar investimentos.</p>';
    return [];
  }

  return data || [];
}

async function carregarProventos(){
  const ano = anoAtual();

  const { data, error } = await supabase
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
        ticker,
        nome,
        moeda
      )
    `)
    .eq('user_id', user.id)
    .in('tipo', ['dividendo', 'jcp', 'rendimento_fii'])
    .gte('data_movimento', `${ano}-01-01`)
    .lte('data_movimento', `${ano}-12-31`)
    .order('data_movimento', { ascending:false });

  if(error){
    ultimosProventos.innerHTML = '<p class="muted">Erro ao carregar proventos.</p>';
    return [];
  }

  return data || [];
}

async function carregarMetas(){
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', user.id)
    .eq('ativo', true)
    .order('data_alvo', { ascending:true });

  if(error){
    resumoMetas.innerHTML = '<p class="muted">Erro ao carregar metas.</p>';
    return [];
  }

  return data || [];
}

async function carregarAlvos(){
  const { data, error } = await supabase
    .from('allocation_targets')
    .select('*')
    .eq('user_id', user.id);

  if(error){
    return [];
  }

  return data || [];
}

function processarInvestimentos(investimentos, alvos){
  const porClasse = {};

  Object.keys(classes).forEach(classe => {
    porClasse[classe] = {
      classe,
      nome: classes[classe],
      aplicado: 0,
      atual: 0
    };
  });

  investimentos.forEach(item => {
    const classe = item.tipo;
    const quantidade = Number(item.quantidade || 0);
    const precoMedio = Number(item.preco_medio || 0);
    const cotacao = Number(item.cotacao_atual || item.preco_medio || 0);

    const aplicado = quantidade * precoMedio;
    const atual = quantidade * cotacao;

    if(!porClasse[classe]){
      porClasse[classe] = {
        classe,
        nome: classe,
        aplicado: 0,
        atual: 0
      };
    }

    porClasse[classe].aplicado += aplicado;
    porClasse[classe].atual += atual;
  });

  const linhas = Object.values(porClasse);
  totalPatrimonio = linhas.reduce((soma, item) => soma + item.atual, 0);
  totalAplicadoValor = linhas.reduce((soma, item) => soma + item.aplicado, 0);
  const resultado = totalPatrimonio - totalAplicadoValor;

  patrimonioInvestido.innerText = formatCurrency(totalPatrimonio, 'BRL');
  totalAplicado.innerText = formatCurrency(totalAplicadoValor, 'BRL');
  resultadoInvestimentos.innerText = formatCurrency(resultado, 'BRL');

  resultadoInvestimentos.classList.remove('positive', 'negative');
  resultadoInvestimentos.classList.add(resultado >= 0 ? 'positive' : 'negative');

  const linhasComAlvo = linhas.map(item => {
    const alvo = alvos.find(a => a.classe === item.classe);
    const percentualAtual = totalPatrimonio > 0 ? (item.atual / totalPatrimonio) * 100 : 0;
    const percentualAlvo = alvo ? Number(alvo.percentual_alvo || 0) : 0;
    const diferenca = percentualAtual - percentualAlvo;

    return {
      ...item,
      percentualAtual,
      percentualAlvo,
      diferenca
    };
  });

  const defasada = [...linhasComAlvo]
    .filter(item => item.percentualAlvo > 0)
    .sort((a,b) => a.diferenca - b.diferenca)[0];

  classeDefasada.innerText = defasada ? defasada.nome : '-';

  renderizarClasses(linhasComAlvo);
}

function renderizarClasses(linhas){
  if(!linhas.length){
    resumoClasses.innerHTML = '<p class="muted">Nenhum investimento cadastrado.</p>';
    return;
  }

  resumoClasses.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Classe</th>
          <th>Aplicado</th>
          <th>Atual</th>
          <th>Resultado</th>
          <th>% Atual</th>
          <th>% Alvo</th>
          <th>Diferença</th>
        </tr>
      </thead>
      <tbody>
        ${linhas.map(item => {
          const resultado = item.atual - item.aplicado;

          return `
            <tr>
              <td>${item.nome}</td>
              <td class="money">${formatCurrency(item.aplicado, 'BRL')}</td>
              <td class="money">${formatCurrency(item.atual, 'BRL')}</td>
              <td class="money ${resultado >= 0 ? 'positive' : 'negative'}">
                ${formatCurrency(resultado, 'BRL')}
              </td>
              <td>${formatarPercentual(item.percentualAtual)}</td>
              <td>${formatarPercentual(item.percentualAlvo)}</td>
              <td class="${item.diferenca < 0 ? 'positive' : 'negative'}">
                ${formatarPercentual(item.diferenca)}
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function processarProventos(proventos){
  const mesAtual = mesAtualISO();

  const totalAnoValor = proventos.reduce((soma, item) => {
    return soma + Number(item.valor_liquido || item.valor_total || 0);
  }, 0);

  const totalMesValor = proventos
    .filter(item => item.data_movimento?.startsWith(mesAtual))
    .reduce((soma, item) => soma + Number(item.valor_liquido || item.valor_total || 0), 0);

  dividendosMes.innerText = formatCurrency(totalMesValor, 'BRL');
  dividendosAno.innerText = formatCurrency(totalAnoValor, 'BRL');

  const y = totalAplicadoValor > 0
    ? (totalAnoValor / totalAplicadoValor) * 100
    : 0;

  yieldAno.innerText = formatarPercentual(y);
}

function processarMetas(metas){
  if(!metas.length){
    metaProxima.innerText = '-';
    resumoMetas.innerHTML = '<p class="muted">Nenhuma meta cadastrada.</p>';
    return;
  }

  const ordenadas = [...metas].sort((a,b) => {
    const pa = Number(a.valor_atual || 0) / Number(a.valor_alvo || 1);
    const pb = Number(b.valor_atual || 0) / Number(b.valor_alvo || 1);
    return pb - pa;
  });

  metaProxima.innerText = ordenadas[0]?.nome || '-';

  resumoMetas.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Meta</th>
          <th>Atual</th>
          <th>Alvo</th>
          <th>Progresso</th>
          <th>Falta</th>
        </tr>
      </thead>
      <tbody>
        ${metas.map(meta => {
          const atual = Number(meta.valor_atual || 0);
          const alvo = Number(meta.valor_alvo || 0);
          const progresso = alvo > 0 ? Math.min((atual / alvo) * 100, 100) : 0;
          const falta = Math.max(alvo - atual, 0);

          return `
            <tr>
              <td>${meta.nome}</td>
              <td class="money positive">${formatCurrency(atual, 'BRL')}</td>
              <td class="money">${formatCurrency(alvo, 'BRL')}</td>
              <td>${formatarPercentual(progresso)}</td>
              <td class="money">${formatCurrency(falta, 'BRL')}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderizarProventos(proventos){
  if(!proventos.length){
    ultimosProventos.innerHTML = '<p class="muted">Nenhum provento registrado no ano.</p>';
    return;
  }

  const ultimos = proventos.slice(0, 10);

  ultimosProventos.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Ativo</th>
          <th>Tipo</th>
          <th>Valor Líquido</th>
        </tr>
      </thead>
      <tbody>
        ${ultimos.map(item => {
          const valor = Number(item.valor_liquido || item.valor_total || 0);
          const moeda = item.investments?.moeda || 'BRL';

          return `
            <tr>
              <td>${formatarData(item.data_movimento)}</td>
              <td><strong>${item.investments?.ticker || '-'}</strong><br><span class="muted">${item.investments?.nome || ''}</span></td>
              <td>${item.tipo}</td>
              <td class="money positive">${formatCurrency(valor, moeda)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

if(btnSalvarPatrimonioMes){
  btnSalvarPatrimonioMes.addEventListener('click', salvarSnapshotPatrimonial);
}

if(btnAtualizarPatrimonio){
  btnAtualizarPatrimonio.addEventListener('click', calcularHistoricoPatrimonial);
}

carregarTudo();

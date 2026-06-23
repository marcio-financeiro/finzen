import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const categoriasEstouradas = document.getElementById('categoriasEstouradas');
const categoriasAtencao = document.getElementById('categoriasAtencao');
const orcamentoDisponivel = document.getElementById('orcamentoDisponivel');
const maiorRiscoOrcamento = document.getElementById('maiorRiscoOrcamento');

const budgetHealthTable = document.getElementById('budgetHealthTable');
const budgetHealthAlerts = document.getElementById('budgetHealthAlerts');

const { data: sessionData } = await supabase.auth.getSession();

if(!sessionData.session){
  navigate('../login.html'); throw new Error('unauthenticated');
}

const user = sessionData.session.user;

function mesAtualISO(){
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

function primeiroDiaMesISO(){
  return `${mesAtualISO()}-01`;
}

function ultimoDiaMesISO(){
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  const mesTexto = String(mes + 1).padStart(2, '0');
  return `${ano}-${mesTexto}-${String(ultimoDia).padStart(2, '0')}`;
}

function percentual(valor){
  return Number(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits:1,
    maximumFractionDigits:1
  }) + '%';
}

function classeStatus(percentualUsado){
  if(percentualUsado > 100){
    return {
      texto:'estourado',
      badge:'danger',
      emoji:'🔴'
    };
  }

  if(percentualUsado >= 80){
    return {
      texto:'atenção',
      badge:'neutral',
      emoji:'🟡'
    };
  }

  return {
    texto:'ok',
    badge:'success',
    emoji:'🟢'
  };
}

async function carregarOrcamentoInteligente(){
  const inicio = primeiroDiaMesISO();
  const fim = ultimoDiaMesISO();

  const ref = mesAtualISO();

  const [
    { data: budgets,      error: budgetError },
    { data: transactions, error: txError },
    { data: cardTx,       error: cardTxError },
    { data: categories,   error: catError }
  ] = await Promise.all([
    supabase
      .from('budgets')
      .select('*')
      .eq('user_id', user.id)
      .eq('mes_referencia', ref),

    supabase
      .from('transactions')
      .select('category_id,amount')
      .eq('user_id', user.id)
      .eq('type', 'despesa')
      .eq('status', 'pago')
      .gte('date', inicio)
      .lte('date', fim),

    supabase
      .from('card_transactions')
      .select('category_id,valor_parcela')
      .eq('user_id', user.id)
      .eq('fatura_referencia', ref),

    supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .eq('ativo', true)
  ]);

  if(budgetError || txError || cardTxError || catError){
    budgetHealthTable.innerHTML = '<p class="muted" style="padding:18px">Erro ao carregar saúde do orçamento.</p>';
    budgetHealthAlerts.innerHTML = '<p class="muted">Erro ao carregar alertas.</p>';
    return;
  }

  const listaBudgets = budgets || [];
  const listaTransacoes = transactions || [];
  const listaCardTx = cardTx || [];
  const listaCategorias = categories || [];

  const gastosPorCategoria = {};

  listaTransacoes.forEach(item => {
    const id = item.category_id;
    if(id) gastosPorCategoria[id] = (gastosPorCategoria[id] || 0) + Number(item.amount || 0);
  });

  listaCardTx.forEach(item => {
    const id = item.category_id;
    if(id) gastosPorCategoria[id] = (gastosPorCategoria[id] || 0) + Number(item.valor_parcela || 0);
  });

  const linhas = listaBudgets.map(budget => {
    const categoria = listaCategorias.find(cat => cat.id === budget.category_id);
    const limite = Number(budget.valor_planejado || 0);
    const gasto = Number(gastosPorCategoria[budget.category_id] || 0);
    const disponivel = limite - gasto;
    const usado = limite > 0 ? (gasto / limite) * 100 : 0;
    const status = classeStatus(usado);

    return {
      id: budget.id,
      categoriaId: budget.category_id,
      nome: categoria?.nome || budget.nome || 'Categoria',
      icon: categoria?.icon || '',
      limite,
      gasto,
      disponivel,
      usado,
      status
    };
  }).filter(item => item.limite > 0);

  renderizarResumo(linhas);
  renderizarTabela(linhas);
  renderizarAlertas(linhas);
}

function renderizarResumo(linhas){
  const estouradas = linhas.filter(item => item.usado > 100).length;
  const atencao = linhas.filter(item => item.usado >= 80 && item.usado <= 100).length;

  const disponivelTotal = linhas.reduce((soma, item) => {
    return soma + Math.max(item.disponivel, 0);
  }, 0);

  const maiorRisco = [...linhas].sort((a,b) => b.usado - a.usado)[0];

  categoriasEstouradas.innerText = String(estouradas);
  categoriasAtencao.innerText = String(atencao);
  orcamentoDisponivel.innerText = formatCurrency(disponivelTotal, 'BRL');
  maiorRiscoOrcamento.innerText = maiorRisco ? `${maiorRisco.icon || ''} ${maiorRisco.nome}` : '-';
}

function renderizarTabela(linhas){
  if(!linhas.length){
    budgetHealthTable.innerHTML = '<p class="muted" style="padding:18px">Nenhum orçamento cadastrado para analisar.</p>';
    return;
  }

  budgetHealthTable.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Categoria</th>
          <th>Orçado</th>
          <th>Gasto</th>
          <th>Disponível/Excesso</th>
          <th>Uso</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${linhas.map(item => `
          <tr>
            <td>${item.icon || ''} ${item.nome}</td>
            <td class="money">${formatCurrency(item.limite, 'BRL')}</td>
            <td class="money negative">${formatCurrency(item.gasto, 'BRL')}</td>
            <td class="money ${item.disponivel >= 0 ? 'positive' : 'negative'}">
              ${item.disponivel >= 0
                ? formatCurrency(item.disponivel, 'BRL')
                : '-' + formatCurrency(Math.abs(item.disponivel), 'BRL')
              }
            </td>
            <td>${percentual(item.usado)}</td>
            <td>
              <span class="badge ${item.status.badge}">
                ${item.status.emoji} ${item.status.texto}
              </span>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderizarAlertas(linhas){
  const alertas = [];

  const estouradas = linhas.filter(item => item.usado > 100)
    .sort((a,b) => b.usado - a.usado);

  const atencao = linhas.filter(item => item.usado >= 80 && item.usado <= 100)
    .sort((a,b) => b.usado - a.usado);

  estouradas.forEach(item => {
    alertas.push(`🚨 <strong>${item.nome}</strong> excedeu o orçamento em <strong>${formatCurrency(Math.abs(item.disponivel), 'BRL')}</strong>.`);
  });

  atencao.forEach(item => {
    alertas.push(`⚠️ <strong>${item.nome}</strong> já atingiu <strong>${percentual(item.usado)}</strong> do orçamento.`);
  });

  if(!alertas.length){
    alertas.push('✅ Orçamento saudável no momento. Milagre raro, preserve.');
  }

  budgetHealthAlerts.innerHTML = alertas.map(alerta => `
    <div style="padding:10px 0;border-bottom:1px solid var(--border)">${alerta}</div>
  `).join('');
}

carregarOrcamentoInteligente();

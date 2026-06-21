import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');

const patrimonioTotal = document.getElementById('patrimonioTotal');
const saldoContas = document.getElementById('saldoContas');
const dividendosMes = document.getElementById('dividendosMes');
const metaProxima = document.getElementById('metaProxima');

const receitasMes = document.getElementById('receitasMes');
const despesasMes = document.getElementById('despesasMes');
const faturasAbertas = document.getElementById('faturasAbertas');
const classeDefasada = document.getElementById('classeDefasada');

const alertasFinzen = document.getElementById('alertasFinzen');
const resumoExecutivo = document.getElementById('resumoExecutivo');

const { data: sessionData } = await supabase.auth.getSession();

if(!sessionData.session){
  navigate('../login.html');
}

const user = sessionData.session.user;

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

const classes = {
  acao:'Ações Brasil',
  fii:'FIIs',
  etf:'ETFs',
  renda_fixa:'Renda Fixa',
  cripto:'Cripto',
  exterior:'Exterior'
};

function mesAtualISO(){
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

function primeiroDiaMes(){
  return `${mesAtualISO()}-01`;
}

function anoAtual(){
  return new Date().getFullYear();
}

function percentual(valor){
  return Number(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits:2,
    maximumFractionDigits:2
  }) + '%';
}

async function carregar(){
  const [
    contasRes,
    transacoesRes,
    cartaoRes,
    investmentsRes,
    dividendsRes,
    goalsRes,
    targetsRes,
    budgetsRes
  ] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', user.id).eq('active', true),
    supabase.from('transactions').select('type,amount,date,status').eq('user_id', user.id),
    supabase.from('card_transactions').select('valor_parcela,status').eq('user_id', user.id).eq('status','aberta'),
    supabase.from('investments').select('*').eq('user_id', user.id).eq('ativo', true),
    supabase.from('investment_transactions').select('tipo,valor_total,valor_liquido,data_movimento').eq('user_id', user.id),
    supabase.from('goals').select('*').eq('user_id', user.id).eq('ativo', true),
    supabase.from('allocation_targets').select('*').eq('user_id', user.id),
    supabase.from('budgets').select('*').eq('user_id', user.id)
  ]);

  const contas = contasRes.data || [];
  const transacoes = transacoesRes.data || [];
  const faturas = cartaoRes.data || [];
  const investments = investmentsRes.data || [];
  const dividends = dividendsRes.data || [];
  const goals = goalsRes.data || [];
  const targets = targetsRes.data || [];
  const budgets = budgetsRes.data || [];

  processarFinanceiro(contas, transacoes, faturas);
  const patrimonio = processarInvestimentos(investments, targets);
  processarDividendos(dividends, patrimonio.totalAplicado);
  processarMetas(goals);
  processarAlertas(patrimonio, budgets, goals);
  desenharGraficos(transacoes, investments, dividends);
  renderizarResumo(patrimonio, goals, faturas);
}

function processarFinanceiro(contas, transacoes, faturas){
  const saldo = contas
    .filter(conta => (conta.currency || 'BRL') === 'BRL')
    .reduce((soma, conta) => soma + Number(conta.saldo_atual || 0), 0);

  saldoContas.innerText = formatCurrency(saldo, 'BRL');

  const inicioMes = primeiroDiaMes();

  const transMes = transacoes.filter(t => t.status === 'pago' && t.date >= inicioMes);

  const receitas = transMes
    .filter(t => t.type === 'receita')
    .reduce((soma, t) => soma + Number(t.amount || 0), 0);

  const despesas = transMes
    .filter(t => t.type === 'despesa')
    .reduce((soma, t) => soma + Number(t.amount || 0), 0);

  receitasMes.innerText = formatCurrency(receitas, 'BRL');
  despesasMes.innerText = formatCurrency(despesas, 'BRL');

  const totalFaturas = faturas.reduce((soma, f) => soma + Number(f.valor_parcela || 0), 0);
  faturasAbertas.innerText = formatCurrency(totalFaturas, 'BRL');
}

function processarInvestimentos(investments, targets){
  const porClasse = {};
  Object.keys(classes).forEach(classe => porClasse[classe] = 0);

  let aplicado = 0;
  let patrimonio = 0;

  investments.forEach(item => {
    const qtd = Number(item.quantidade || 0);
    const pm = Number(item.preco_medio || 0);
    const cot = Number(item.cotacao_atual || item.preco_medio || 0);
    const valorAplicado = qtd * pm;
    const valorAtual = qtd * cot;

    aplicado += valorAplicado;
    patrimonio += valorAtual;

    if(!porClasse[item.tipo]) porClasse[item.tipo] = 0;
    porClasse[item.tipo] += valorAtual;
  });

  patrimonioTotal.innerText = formatCurrency(patrimonio, 'BRL');

  const linhas = Object.keys(porClasse).map(classe => {
    const alvo = targets.find(t => t.classe === classe);
    const atualPct = patrimonio > 0 ? (porClasse[classe] / patrimonio) * 100 : 0;
    const alvoPct = alvo ? Number(alvo.percentual_alvo || 0) : 0;
    return {
      classe,
      nome: classes[classe] || classe,
      valor: porClasse[classe],
      atualPct,
      alvoPct,
      diff: atualPct - alvoPct
    };
  });

  const defasada = linhas
    .filter(l => l.alvoPct > 0)
    .sort((a,b) => a.diff - b.diff)[0];

  classeDefasada.innerText = defasada ? defasada.nome : '-';

  return {
    totalAplicado: aplicado,
    totalPatrimonio: patrimonio,
    porClasse,
    linhas,
    classeDefasada: defasada
  };
}

function processarDividendos(dividends, totalAplicado){
  const mes = mesAtualISO();
  const ano = String(anoAtual());

  const tipos = ['dividendo','jcp','rendimento_fii'];

  const divMes = dividends
    .filter(d => tipos.includes(d.tipo) && d.data_movimento?.startsWith(mes))
    .reduce((soma,d) => soma + Number(d.valor_liquido || d.valor_total || 0), 0);

  const divAno = dividends
    .filter(d => tipos.includes(d.tipo) && d.data_movimento?.startsWith(ano))
    .reduce((soma,d) => soma + Number(d.valor_liquido || d.valor_total || 0), 0);

  dividendosMes.innerText = formatCurrency(divMes, 'BRL');

  return {
    mes: divMes,
    ano: divAno,
    yoc: totalAplicado > 0 ? (divAno / totalAplicado) * 100 : 0
  };
}

function processarMetas(goals){
  if(!goals.length){
    metaProxima.innerText = '-';
    return;
  }

  const ordenadas = [...goals].sort((a,b) => {
    const pa = Number(a.valor_atual || 0) / Number(a.valor_alvo || 1);
    const pb = Number(b.valor_atual || 0) / Number(b.valor_alvo || 1);
    return pb - pa;
  });

  const meta = ordenadas[0];
  const progresso = Number(meta.valor_atual || 0) / Number(meta.valor_alvo || 1) * 100;

  metaProxima.innerText = `${meta.nome} (${Math.min(progresso,100).toFixed(0)}%)`;
}

function processarAlertas(patrimonio, budgets, goals){
  const alertas = [];

  if(patrimonio.classeDefasada){
    alertas.push(`🧭 Classe mais defasada: <strong>${patrimonio.classeDefasada.nome}</strong>`);
  }

  const metaQuase = goals.find(g => {
    const alvo = Number(g.valor_alvo || 0);
    const atual = Number(g.valor_atual || 0);
    return alvo > 0 && atual / alvo >= 0.8 && atual < alvo;
  });

  if(metaQuase){
    alertas.push(`🎯 Meta próxima da conclusão: <strong>${metaQuase.nome}</strong>`);
  }

  const faturaValor = Number(faturasAbertas.innerText.replace(/[^0-9,-]/g,'').replace(',','.')) || 0;
  if(faturaValor > 0){
    alertas.push(`💳 Existem faturas abertas: <strong>${faturasAbertas.innerText}</strong>`);
  }

  if(!alertas.length){
    alertas.push('✅ Nenhum alerta crítico no momento.');
  }

  alertasFinzen.innerHTML = alertas.map(a => `
    <div style="padding:10px 0;border-bottom:1px solid var(--border)">${a}</div>
  `).join('');
}

function desenharGraficos(transacoes, investments, dividends){
  const inicio = primeiroDiaMes();
  const transMes = transacoes.filter(t => t.status === 'pago' && t.date >= inicio);

  const receitas = transMes
    .filter(t => t.type === 'receita')
    .reduce((s,t) => s + Number(t.amount || 0), 0);

  const despesas = transMes
    .filter(t => t.type === 'despesa')
    .reduce((s,t) => s + Number(t.amount || 0), 0);

  new Chart(document.getElementById('incomeExpenseChart'), {
    type:'bar',
    data:{
      labels:['Receitas','Despesas'],
      datasets:[{ label:'R$', data:[receitas, despesas] }]
    },
    options:{ responsive:true, plugins:{ legend:{ display:false } } }
  });

  const alloc = {};
  investments.forEach(i => {
    const total = Number(i.quantidade || 0) * Number(i.cotacao_atual || i.preco_medio || 0);
    const nome = classes[i.tipo] || i.tipo || 'Outros';
    alloc[nome] = (alloc[nome] || 0) + total;
  });

  new Chart(document.getElementById('allocationChart'), {
    type:'doughnut',
    data:{
      labels:Object.keys(alloc),
      datasets:[{ data:Object.values(alloc) }]
    },
    options:{ responsive:true }
  });

  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const valores = new Array(12).fill(0);

  dividends.forEach(d => {
    if(!['dividendo','jcp','rendimento_fii'].includes(d.tipo)) return;
    const date = new Date(d.data_movimento);
    const month = date.getMonth();
    valores[month] += Number(d.valor_liquido || d.valor_total || 0);
  });

  new Chart(document.getElementById('dividendChart'), {
    type:'line',
    data:{
      labels:meses,
      datasets:[{ label:'Dividendos', data:valores, tension:0.35 }]
    },
    options:{ responsive:true }
  });
}

function renderizarResumo(patrimonio, goals, faturas){
  const metaCount = goals.length;
  const faturaTotal = faturas.reduce((s,f) => s + Number(f.valor_parcela || 0), 0);

  resumoExecutivo.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Indicador</th>
          <th>Valor</th>
          <th>Leitura</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Resultado dos Investimentos</td>
          <td class="money ${patrimonio.totalPatrimonio - patrimonio.totalAplicado >= 0 ? 'positive' : 'negative'}">
            ${formatCurrency(patrimonio.totalPatrimonio - patrimonio.totalAplicado, 'BRL')}
          </td>
          <td>Diferença entre patrimônio atual e total aplicado.</td>
        </tr>
        <tr>
          <td>Metas Ativas</td>
          <td>${metaCount}</td>
          <td>Objetivos financeiros cadastrados.</td>
        </tr>
        <tr>
          <td>Faturas Abertas</td>
          <td class="money negative">${formatCurrency(faturaTotal, 'BRL')}</td>
          <td>Parcelas ainda abertas no cartão.</td>
        </tr>
      </tbody>
    </table>
  `;
}

carregar();

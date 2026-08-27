import { supabase }       from './supabaseClient.js';
import { navigate }       from './router.js';
import { formatCurrency } from './utils.js';
import { getUsdBrlRate, convertToBRL } from './services/financeService.js';
import { escapeHtml } from './utils/escapeHtml.js';
import { loadChart } from './utils/loadChart.js';
import { iconeCategoriaSvg } from './utils/categoryIcon.js';
import { chartColors, baseChartOptions } from './utils/chartTheme.js';
import { registrarAcao } from './eventBus.js';

// Soma o valor de uma transação já convertido pra BRL, conforme a moeda da conta
function valorBRL(t){ return convertToBRL(t.amount, t.accounts?.currency || 'BRL', dolarAtual); }

// ── Auth ──────────────────────────────────────────────────────────────────────
const { data: sd } = await supabase.auth.getSession();
if (!sd.session) { navigate('../login.html'); throw new Error('unauthenticated'); }
const user = sd.session.user;

const el = id => document.getElementById(id);

document.getElementById('btnLogout').addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

// ── Estado global ─────────────────────────────────────────────────────────────
let dolarAtual = 5.15;
const charts  = {};

// Estado de cross-filter compartilhado: `mes` dirige o Nível 1 (drill-down),
// `categoria` filtra ranking/orçamento/insights — os KPIs do topo NUNCA mudam
// com o filtro de categoria (ficam sempre com a visão geral do mês, pra não
// confundir "receita total" com o valor de uma categoria isolada).
const filtro = { mes: '', categoria: null };

// Janela de dados carregada em memória (13 meses: 12 pra tendência + 1 de
// "buffer" pra permitir comparação com o mês anterior ao mais antigo exibido).
// Toda troca de mês/categoria dentro da janela é só recomputo em JS — só
// refaz fetch ao Supabase quando o usuário navega pra fora dela.
let janelaCompleta = []; // 13 meses, ordem crescente
let janelaTendencia = []; // últimos 12 (o que os gráficos de tendência mostram)
let dadosJanela = { tx: [], cardTx: [] };
let patrimonioHist = []; // histórico completo, carregado 1x, independente da janela
let accountsAll = [];
let investmentsAll = [];
const dividendsCache = {}; // { 'YYYY-MM': [...] }
const budgetsCache   = {}; // { 'YYYY-MM': [...] }

// ── Helpers de data ───────────────────────────────────────────────────────────
function inicioMes(ym) {
  return ym + '-01';
}

function fimMes(ym) {
  const [a, m] = ym.split('-').map(Number);
  return new Date(a, m, 0).toISOString().split('T')[0]; // último dia do mês
}

function mesLabel(ym) {
  const [a, m] = ym.split('-');
  return new Date(a, m - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
}

function nomeMes(ym) {
  const [a, m] = ym.split('-');
  return new Date(a, m - 1, 1).toLocaleString('pt-BR', { month: 'short', year: '2-digit' })
    .replace('.', '');
}

function mesAdicionar(ym, n) {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function ultimosNMeses(ym, n) {
  const meses = [];
  for (let i = n - 1; i >= 0; i--) meses.push(mesAdicionar(ym, -i));
  return meses;
}

// ── Chart helper ──────────────────────────────────────────────────────────────
function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

// ── Semáforo ──────────────────────────────────────────────────────────────────
function semaforo(tipo, valor) {
  if (tipo === 'resultado') return valor > 0 ? 'verde' : 'vermelho';
  if (tipo === 'poupanca')  return valor >= 20 ? 'verde' : valor >= 0 ? 'amarelo' : 'vermelho';
  if (tipo === 'varPatrim') return valor >= 0 ? 'verde' : 'vermelho';
  if (tipo === 'orcamento') return valor <= 80 ? 'verde' : valor <= 100 ? 'amarelo' : 'vermelho';
  return '';
}

function icone(cor) {
  const c = cor === 'verde' ? 'var(--success)' : cor === 'amarelo' ? 'var(--warning)' : cor === 'vermelho' ? 'var(--danger)' : '';
  return c ? `<span class="color-dot" style="background:${c};border-color:${c}"></span>` : '';
}

// ── KPI card helper (usa a estrutura global .dash-kpi: span + strong) ────────
function kpiCard({ label, valor, sub, cor }) {
  return `<div class="dash-kpi ${cor || ''}">
    <span>${label}</span>
    <strong>${valor}</strong>
    ${sub ? `<span class="bi-kpi-semaforo">${sub}</span>` : ''}
  </div>`;
}

// ── Dados da janela (filtro em memória, sem round-trip) ───────────────────────
function txDoMes(mes) {
  return dadosJanela.tx.filter(t => t.date?.startsWith(mes));
}
function cardTxDoMes(mes) {
  return dadosJanela.cardTx.filter(t => t.fatura_referencia === mes);
}

async function dividendosDoMes(mes) {
  if (dividendsCache[mes]) return dividendsCache[mes];
  const { data } = await supabase.from('dividends')
    .select('valor_total,data_pagamento')
    .eq('user_id', user.id)
    .gte('data_pagamento', inicioMes(mes)).lte('data_pagamento', fimMes(mes));
  dividendsCache[mes] = data || [];
  return dividendsCache[mes];
}

async function budgetsDoMes(mes) {
  if (budgetsCache[mes]) return budgetsCache[mes];
  const { data } = await supabase.from('budgets')
    .select('valor_planejado,category_id,categories:category_id(nome,icon)')
    .eq('user_id', user.id)
    .eq('mes_referencia', mes);
  budgetsCache[mes] = data || [];
  return budgetsCache[mes];
}

// ── Carrega a janela de 13 meses (tx + card_transactions) terminando em `mesFinal` ─
async function carregarJanela(mesFinal) {
  janelaCompleta  = ultimosNMeses(mesFinal, 13);
  janelaTendencia = janelaCompleta.slice(1); // últimos 12 (o buffer não aparece nos gráficos)

  const inicio = inicioMes(janelaCompleta[0]);
  const fim    = fimMes(janelaCompleta[janelaCompleta.length - 1]);

  const [{ data: tx }, { data: cardTx }] = await Promise.all([
    supabase.from('transactions')
      .select('type,amount,date,category_id,accounts:account_id(currency),categories:category_id(nome,icon)')
      .eq('user_id', user.id)
      .gte('date', inicio).lte('date', fim)
      .eq('status', 'pago'),

    supabase.from('card_transactions')
      .select('valor_parcela,fatura_referencia,category_id,categories:category_id(nome,icon)')
      .eq('user_id', user.id)
      .in('fatura_referencia', janelaCompleta),
  ]);

  (tx || []).forEach(t => { t.amount = valorBRL(t); });
  dadosJanela = { tx: tx || [], cardTx: cardTx || [] };
}

// ── SEÇÃO: KPIs financeiros com semáforos (visão geral do mês — nunca filtrada por categoria) ─
function renderKPIs() {
  const mes = filtro.mes;
  const tx     = txDoMes(mes);
  const cardTx = cardTxDoMes(mes);

  const receitas  = tx.filter(t => t.type === 'receita').reduce((s, t) => s + Number(t.amount || 0), 0);
  const despTx    = tx.filter(t => t.type === 'despesa').reduce((s, t) => s + Number(t.amount || 0), 0);
  const despCard  = cardTx.reduce((s, t) => s + Number(t.valor_parcela || 0), 0);
  const despesas  = despTx + despCard;
  const resultado = receitas - despesas;
  const poupPct   = receitas > 0 ? (resultado / receitas) * 100 : 0;

  const patrimonioMes = patrimonioHist.find(h => h.reference_month?.startsWith(mes))?.net_worth ?? null;
  const patrimonioAnt = patrimonioHist.find(h => h.reference_month?.startsWith(mesAdicionar(mes, -1)))?.net_worth ?? null;
  const varPatrim = (patrimonioMes !== null && patrimonioAnt !== null && patrimonioAnt !== 0)
    ? ((patrimonioMes - patrimonioAnt) / Math.abs(patrimonioAnt)) * 100
    : null;

  const corRes  = semaforo('resultado', resultado);
  const corPoup = semaforo('poupanca',  poupPct);
  const corVar  = varPatrim !== null ? semaforo('varPatrim', varPatrim) : '';

  el('secKPIs').innerHTML = [
    kpiCard({ label: 'Receitas',         valor: formatCurrency(receitas,  'BRL') }),
    kpiCard({ label: 'Despesas',         valor: formatCurrency(despesas,  'BRL') }),
    kpiCard({ label: 'Resultado',        valor: formatCurrency(resultado, 'BRL'), cor: corRes,  sub: icone(corRes) }),
    kpiCard({ label: 'Taxa de Poupança', valor: poupPct.toFixed(1) + '%',         cor: corPoup, sub: icone(corPoup) }),
    kpiCard({ label: 'Patrimônio Líq.',  valor: patrimonioMes !== null ? formatCurrency(patrimonioMes, 'BRL') : '—' }),
    kpiCard({ label: 'Var. Patrimônio',  valor: varPatrim !== null ? (varPatrim >= 0 ? '+' : '') + varPatrim.toFixed(2) + '%' : '—', cor: corVar, sub: corVar ? icone(corVar) : '' }),
  ].join('');
}

// ── SEÇÃO: Receita vs Despesa — tendência 12 meses (clicável → seleciona mês) ─
function renderGrafico12Meses() {
  const receitas = janelaTendencia.map(m =>
    txDoMes(m).filter(t => t.type === 'receita').reduce((s, t) => s + Number(t.amount || 0), 0)
  );
  const despesas = janelaTendencia.map(m =>
    txDoMes(m).filter(t => t.type === 'despesa').reduce((s, t) => s + Number(t.amount || 0), 0)
             + cardTxDoMes(m).reduce((s, t) => s + Number(t.valor_parcela || 0), 0)
  );

  const c = chartColors();
  destroyChart('recdes');
  loadChart().then(Chart => {
    charts['recdes'] = new Chart(document.getElementById('chartRecDes'), {
      type: 'bar',
      data: {
        labels: janelaTendencia.map(nomeMes),
        datasets: [
          { label: 'Receitas', data: receitas, backgroundColor: c.success, borderRadius: 4 },
          { label: 'Despesas', data: despesas, backgroundColor: c.danger,  borderRadius: 4 },
        ],
      },
      options: {
        ...baseChartOptions(),
        interaction: { mode: 'index', intersect: false },
        onClick: (evt, elements) => {
          if (!elements.length) return;
          irParaMes(janelaTendencia[elements[0].index]);
        },
      },
    });
  });
}

// ── SEÇÃO: Taxa de Poupança Mensal — tendência 12 meses (clicável) ────────────
function renderTaxaPoupancaMensal() {
  const poupanca = janelaTendencia.map(m => {
    const r = txDoMes(m).filter(t => t.type === 'receita').reduce((s, t) => s + Number(t.amount || 0), 0);
    const d = txDoMes(m).filter(t => t.type === 'despesa').reduce((s, t) => s + Number(t.amount || 0), 0)
            + cardTxDoMes(m).reduce((s, t) => s + Number(t.valor_parcela || 0), 0);
    return r > 0 ? Number((((r - d) / r) * 100).toFixed(1)) : 0;
  });

  const c = chartColors();
  destroyChart('poupanca');
  loadChart().then(Chart => {
    charts['poupanca'] = new Chart(document.getElementById('chartPoupanca'), {
      type: 'line',
      data: {
        labels: janelaTendencia.map(nomeMes),
        datasets: [{
          label: 'Taxa de poupança',
          data: poupanca,
          borderColor: c.info,
          backgroundColor: c.info + '20',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: c.info,
          tension: .35,
          fill: true,
        }],
      },
      options: {
        ...baseChartOptions(),
        plugins: { ...baseChartOptions().plugins, legend: { display: false },
          tooltip: { callbacks: { label: ctx => ' ' + ctx.raw + '%' } } },
        scales: {
          ...baseChartOptions().scales,
          y: { ...baseChartOptions().scales.y, ticks: { ...baseChartOptions().scales.y.ticks, callback: v => v + '%' } },
        },
        onClick: (evt, elements) => {
          if (!elements.length) return;
          irParaMes(janelaTendencia[elements[0].index]);
        },
      },
    });
  });
}

// ── SEÇÃO: Despesas por Categoria — donut clicável (toggle filtro.categoria) ─
function renderCategorias() {
  const mes = filtro.mes;
  const tx     = txDoMes(mes).filter(t => t.type === 'despesa');
  const cardTx = cardTxDoMes(mes);

  const mapa = {};
  tx.forEach(t => {
    const nome = t.categories?.nome || 'Outros';
    if (!mapa[nome]) mapa[nome] = { nome, valor: 0 };
    mapa[nome].valor += Number(t.amount || 0);
  });
  cardTx.forEach(t => {
    const nome = t.categories?.nome || 'Cartão';
    if (!mapa[nome]) mapa[nome] = { nome, valor: 0 };
    mapa[nome].valor += Number(t.valor_parcela || 0);
  });

  const itens  = Object.values(mapa).sort((a, b) => b.valor - a.valor);
  const top8   = itens.slice(0, 8);
  const outros = itens.slice(8).reduce((s, i) => s + i.valor, 0);
  if (outros > 0) top8.push({ nome: 'Outros', valor: outros });

  const total = top8.reduce((s, i) => s + i.valor, 0);

  if (top8.length === 0) {
    document.getElementById('rankingCategorias').innerHTML =
      '<p class="muted" style="padding:16px;font-size:13px">Nenhuma despesa no período.</p>';
    destroyChart('cat');
    return;
  }

  const c = chartColors();
  const cores = c.categorical;
  // Fatia selecionada (filtro.categoria) fica "explodida" (offset), as demais dim
  const offsets = top8.map(i => (filtro.categoria && i.nome === filtro.categoria) ? 14 : 0);

  destroyChart('cat');
  loadChart().then(Chart => {
    charts['cat'] = new Chart(document.getElementById('chartCategorias'), {
      type: 'doughnut',
      data: {
        labels:   top8.map(i => i.nome),
        datasets: [{ data: top8.map(i => i.valor), backgroundColor: cores.slice(0, top8.length), borderWidth: 2, borderColor: c.surface2, offset: offsets }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: c.muted, font: { size: 11 }, boxWidth: 10, padding: 10 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.raw, 'BRL')}` } },
        },
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const nome = top8[elements[0].index].nome;
          if (nome === 'Outros') return; // agregado — não faz sentido como filtro literal
          toggleFiltroCategoria(nome);
        },
      },
    });
  });

  document.getElementById('rankingCategorias').innerHTML = top8.map(item => {
    const ativo = !filtro.categoria || item.nome === filtro.categoria;
    return `
    <div class="bi-rank-item ${ativo ? 'bi-highlight' : 'bi-dim'}">
      <span class="bi-rank-icon">${iconeCategoriaSvg(item.nome, 14)}</span>
      <span class="bi-rank-nome">${escapeHtml(item.nome)}</span>
      <span class="bi-rank-valor">${formatCurrency(item.valor, 'BRL')}</span>
      <span class="bi-rank-pct">${total > 0 ? ((item.valor / total) * 100).toFixed(1) + '%' : ''}</span>
    </div>
  `;
  }).join('');
}

// ── SEÇÃO: Evolução do Patrimônio — histórico completo, clicável ─────────────
function renderEvolucaoPatrimonio() {
  const canvas = document.getElementById('chartPatrimonio');
  const body = canvas.closest('.dash-block').querySelector('.dash-block-body');
  let msgEl = body.querySelector('.bi-no-data-msg');

  if (!patrimonioHist.length) {
    destroyChart('patrim');
    canvas.style.display = 'none';
    if (!msgEl) {
      msgEl = document.createElement('p');
      msgEl.className = 'muted bi-no-data-msg';
      msgEl.style.cssText = 'font-size:13px;padding:0';
      body.appendChild(msgEl);
    }
    msgEl.textContent = 'Salve pelo menos 2 snapshots mensais para ver a evolução.';
    msgEl.style.display = '';
    return;
  }
  canvas.style.display = '';
  if (msgEl) msgEl.style.display = 'none';

  const meses  = patrimonioHist.map(h => h.reference_month.substring(0, 7));
  const labels = meses.map(nomeMes);
  const dados  = patrimonioHist.map(h => Number(h.net_worth || 0));

  const c = chartColors();
  destroyChart('patrim');
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 220);
  grad.addColorStop(0, c.accent + '55');
  grad.addColorStop(1, c.accent + '05');

  loadChart().then(Chart => {
    charts['patrim'] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Patrimônio Líquido',
          data: dados,
          borderColor: c.accent,
          backgroundColor: grad,
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: c.accent,
        }],
      },
      options: {
        ...baseChartOptions(),
        plugins: { ...baseChartOptions().plugins, legend: { display: false } },
        onClick: (evt, elements) => {
          if (!elements.length) return;
          irParaMes(meses[elements[0].index]);
        },
      },
    });
  });
}

// ── SEÇÃO: Investimentos (carteira estática + dividendos do mês selecionado) ─
async function renderInvestimentos() {
  const mes = filtro.mes;
  const divs = await dividendosDoMes(mes);

  const toBRL = (a) => {
    const qty   = Number(a.quantidade  || 0);
    const atual = Number(a.cotacao_atual || a.preco_medio || 0);
    const medio = Number(a.preco_medio  || 0);
    const brl   = (v) => (a.moeda === 'USD') ? v * dolarAtual : v;
    return { mercado: brl(qty * atual), custo: brl(qty * medio) };
  };

  let totalMercado = 0, totalCusto = 0;
  investmentsAll.forEach(a => {
    const { mercado, custo } = toBRL(a);
    totalMercado += mercado;
    totalCusto   += custo;
  });

  const ganho       = totalMercado - totalCusto;
  const dividendos  = divs.reduce((s, d) => s + Number(d.valor_total || 0), 0);
  const saldoContas = accountsAll.reduce((s, c) => s + convertToBRL(c.saldo_atual, c.currency, dolarAtual), 0);

  document.getElementById('kpisInvest').innerHTML = [
    kpiCard({ label: 'Valor de Mercado', valor: formatCurrency(totalMercado, 'BRL') }),
    kpiCard({ label: 'Ganho de Capital',  valor: formatCurrency(ganho, 'BRL'),      cor: ganho >= 0 ? 'verde' : 'vermelho', sub: icone(ganho >= 0 ? 'verde' : 'vermelho') }),
    kpiCard({ label: 'Dividendos/Mês',   valor: formatCurrency(dividendos, 'BRL') }),
    kpiCard({ label: 'Saldo em Contas',  valor: formatCurrency(saldoContas, 'BRL') }),
  ].join('');

  // Doughnut: top 8 ativos por valor de mercado (não é filtrado pelo mês)
  const porAtivo = investmentsAll
    .map(a => ({ ticker: a.ticker || '—', valor: toBRL(a).mercado }))
    .sort((a, b) => b.valor - a.valor);
  const top8   = porAtivo.slice(0, 8);
  const outros = porAtivo.slice(8).reduce((s, a) => s + a.valor, 0);
  if (outros > 0) top8.push({ ticker: 'Outros', valor: outros });

  destroyChart('cart');
  if (top8.length > 0) {
    const c = chartColors();
    const Chart = await loadChart();
    charts['cart'] = new Chart(document.getElementById('chartCarteira'), {
      type: 'doughnut',
      data: {
        labels:   top8.map(a => a.ticker),
        datasets: [{ data: top8.map(a => a.valor), backgroundColor: c.categorical.slice(0, top8.length), borderWidth: 2, borderColor: c.surface2 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: c.muted, font: { size: 11 }, boxWidth: 10, padding: 10 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.raw, 'BRL')} (${totalMercado > 0 ? ((ctx.raw / totalMercado) * 100).toFixed(1) : 0}%)` } },
        },
      },
    });
  }
}

// ── SEÇÃO: Orçamento vs Realizado (dim quando há filtro.categoria ativo) ─────
async function renderOrcamento() {
  const mes = filtro.mes;
  const budgets = await budgetsDoMes(mes);
  const txDesp  = txDoMes(mes).filter(t => t.type === 'despesa');
  const cardTx  = cardTxDoMes(mes);

  const wrap = document.getElementById('wrapOrcamento');

  if (!budgets.length) {
    wrap.innerHTML = '<p class="muted" style="font-size:13px">Nenhum orçamento cadastrado para este mês.</p>';
    destroyChart('orc');
    return;
  }
  wrap.innerHTML = '<canvas id="chartOrcamento"></canvas>';

  const gastos = {};
  txDesp.forEach(t => { if (t.category_id) gastos[t.category_id] = (gastos[t.category_id] || 0) + Number(t.amount || 0); });
  cardTx.forEach(t => { if (t.category_id) gastos[t.category_id] = (gastos[t.category_id] || 0) + Number(t.valor_parcela || 0); });

  const itens = budgets.map(b => ({
    nome:      b.categories?.nome || 'Categoria',
    icon:      b.categories?.icon || '💰',
    planejado: Number(b.valor_planejado || 0),
    realizado: gastos[b.category_id] || 0,
  })).sort((a, b) => b.realizado - a.realizado);

  const pcts   = itens.map(i => i.planejado > 0 ? (i.realizado / i.planejado) * 100 : 0);
  const c = chartColors();
  const coresBase = pcts.map(p => p <= 80 ? c.success : p <= 100 ? c.warning : c.danger);
  // Dim nas categorias fora do filtro ativo (mantém contexto, só reduz destaque)
  const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
  const cores = itens.map((i, idx) => (!filtro.categoria || i.nome === filtro.categoria) ? coresBase[idx] : alpha(coresBase[idx], 0.25));
  const corOrcamento = itens.map(i => (!filtro.categoria || i.nome === filtro.categoria) ? c.info : alpha(c.info, 0.15));

  const altura = Math.max(180, itens.length * 48);
  wrap.style.height = altura + 'px';

  destroyChart('orc');
  loadChart().then(Chart => {
    charts['orc'] = new Chart(document.getElementById('chartOrcamento'), {
      type: 'bar',
      data: {
        labels:   itens.map(i => `${i.icon} ${i.nome}`),
        datasets: [
          { label: 'Realizado', data: itens.map(i => i.realizado), backgroundColor: cores, borderWidth: 0, borderRadius: 4 },
          { label: 'Orçamento', data: itens.map(i => i.planejado), backgroundColor: corOrcamento, borderColor: c.info, borderWidth: 1, borderRadius: 4 },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: c.muted, font: { size: 12 }, boxWidth: 12, padding: 14 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw, 'BRL')}` } },
        },
        scales: {
          x: { grid: { color: c.border }, ticks: { color: c.muted, font: { size: 11 }, callback: v => 'R$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v.toFixed(0)) } },
          y: { grid: { color: c.border }, ticks: { color: c.muted, font: { size: 11 } } },
        },
      },
    });
  });
}

// ── SEÇÃO: Insights do Mês ────────────────────────────────────────────────────
async function renderInsights() {
  const mes = filtro.mes;
  const mesAntStr = mesAdicionar(mes, -1);

  const tx     = txDoMes(mes);
  const cardTx = cardTxDoMes(mes);
  const txAnt     = txDoMes(mesAntStr);
  const cardTxAnt = cardTxDoMes(mesAntStr);
  const budgets = await budgetsDoMes(mes);

  const receitas  = tx.filter(t => t.type === 'receita').reduce((s, t) => s + Number(t.amount || 0), 0);
  const despesas  = tx.filter(t => t.type === 'despesa').reduce((s, t) => s + Number(t.amount || 0), 0)
                  + cardTx.reduce((s, t) => s + Number(t.valor_parcela || 0), 0);
  const resultado = receitas - despesas;
  const poupPct   = receitas > 0 ? (resultado / receitas) * 100 : 0;

  const recAnt  = txAnt.filter(t => t.type === 'receita').reduce((s, t) => s + Number(t.amount || 0), 0);

  // Maior categoria de gasto
  const mapaDesp = {};
  tx.filter(t => t.type === 'despesa').forEach(t => { const n = t.categories?.nome || 'Outros'; mapaDesp[n] = (mapaDesp[n] || 0) + Number(t.amount || 0); });
  cardTx.forEach(t => { const n = t.categories?.nome || 'Cartão'; mapaDesp[n] = (mapaDesp[n] || 0) + Number(t.valor_parcela || 0); });
  const [maiorCat, maiorVal] = Object.entries(mapaDesp).sort((a, b) => b[1] - a[1])[0] || ['—', 0];

  // Patrimônio
  const patrimonioAtual = patrimonioHist.find(h => h.reference_month?.startsWith(mes))?.net_worth;
  const patrimonioAnt   = patrimonioHist.find(h => h.reference_month?.startsWith(mesAntStr))?.net_worth;
  const varPatrim = (patrimonioAtual != null && patrimonioAnt != null && patrimonioAnt !== 0)
    ? ((patrimonioAtual - patrimonioAnt) / Math.abs(patrimonioAnt)) * 100 : null;

  // Orçamentos estourados
  const gastosOrc = {};
  tx.filter(t => t.type === 'despesa').forEach(t => { if (t.category_id) gastosOrc[t.category_id] = (gastosOrc[t.category_id] || 0) + Number(t.amount || 0); });
  cardTx.forEach(t => { if (t.category_id) gastosOrc[t.category_id] = (gastosOrc[t.category_id] || 0) + Number(t.valor_parcela || 0); });
  const estourados = budgets.filter(b => (gastosOrc[b.category_id] || 0) > Number(b.valor_planejado || 0)).length;

  const insights = [];

  const icoMoeda = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 15.5c.5 1 1.7 1.5 3 1.5 2 0 3.2-1 3.2-2.3 0-3-6-1.4-6-4.2 0-1.3 1.2-2.3 3-2.3 1.3 0 2.4.5 3 1.4"/><line x1="12" y1="6" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="18"/></svg>';
  const icoCheck  = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8,12.5 11,15.5 16,9"/></svg>';
  const icoAlerta = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3 19h18z"/><line x1="12" y1="10" x2="12" y2="14.5"/><circle cx="12" cy="17" r=".7" fill="var(--danger)" stroke="none"/></svg>';
  const icoBar    = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="20" x2="21" y2="20"/><line x1="6" y1="20" x2="6" y2="13"/><line x1="12" y1="20" x2="12" y2="8"/><line x1="18" y1="20" x2="18" y2="4"/></svg>';
  const icoTrendUp   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,17 9,11 13,15 21,6"/><polyline points="15,6 21,6 21,12"/></svg>';
  const icoTrendDown = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,7 9,13 13,9 21,18"/><polyline points="15,18 21,18 21,12"/></svg>';
  const icoFiltro = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16l-6 8v6l-4 2v-8z"/></svg>';

  if (filtro.categoria) {
    const valorCat = mapaDesp[filtro.categoria] || 0;
    const pct = despesas > 0 ? (valorCat / despesas) * 100 : 0;
    insights.push({ icon: icoFiltro, text: `Filtrado por categoria: <strong>${escapeHtml(filtro.categoria)}</strong> — ${formatCurrency(valorCat, 'BRL')} (${pct.toFixed(1)}% das despesas do mês)` });
  }

  if (maiorCat !== '—') {
    insights.push({ icon: icoMoeda, text: `Maior gasto do mês: <strong>${escapeHtml(maiorCat)}</strong> com <strong>${formatCurrency(maiorVal, 'BRL')}</strong>` });
  }

  if (resultado >= 0) {
    insights.push({ icon: icoCheck, text: `Resultado positivo: você economizou <strong>${formatCurrency(resultado, 'BRL')}</strong> (${poupPct.toFixed(1)}% das receitas)` });
  } else {
    insights.push({ icon: icoAlerta, text: `Resultado negativo: gastos superaram receitas em <strong>${formatCurrency(Math.abs(resultado), 'BRL')}</strong>` });
  }

  if (recAnt > 0) {
    const varRec = ((receitas - recAnt) / recAnt) * 100;
    const seta   = varRec >= 0 ? '↑' : '↓';
    insights.push({ icon: icoBar, text: `Receita vs ${nomeMes(mesAntStr)}: <strong>${seta} ${Math.abs(varRec).toFixed(1)}%</strong> (${formatCurrency(receitas, 'BRL')} vs ${formatCurrency(recAnt, 'BRL')})` });
  }

  if (varPatrim !== null) {
    insights.push({ icon: varPatrim >= 0 ? icoTrendUp : icoTrendDown, text: `Patrimônio ${varPatrim >= 0 ? 'cresceu' : 'caiu'} <strong>${Math.abs(varPatrim).toFixed(2)}%</strong> em relação a ${nomeMes(mesAntStr)}` });
  }

  if (estourados > 0) {
    insights.push({ icon: icone('vermelho'), text: `<strong>${estourados} categoria${estourados > 1 ? 's' : ''}</strong> acima do orçamento planejado` });
  } else if (budgets.length > 0) {
    insights.push({ icon: icone('verde'), text: `Todas as categorias <strong>dentro do orçamento</strong> planejado` });
  }

  const cont = document.getElementById('listaInsights');
  if (insights.length === 0) {
    cont.innerHTML = '<p class="muted" style="font-size:13px">Sem dados suficientes para gerar insights neste período.</p>';
    return;
  }
  cont.innerHTML = insights.map(i =>
    `<div class="bi-insight"><span class="bi-insight-icon">${i.icon}</span><span class="bi-insight-text">${i.text}</span></div>`
  ).join('');
}

// ── Chip de filtro ativo ───────────────────────────────────────────────────────
function renderChip() {
  const cont = el('chipBar');
  if (!filtro.categoria) { cont.innerHTML = ''; cont.style.display = 'none'; return; }
  cont.style.display = 'flex';
  cont.innerHTML = `<span class="bi-chip">Categoria: ${escapeHtml(filtro.categoria)}
    <button type="button" data-action="limparFiltroCategoria" aria-label="Limpar filtro de categoria">✕</button></span>`;
}

registrarAcao('limparFiltroCategoria', () => {
  filtro.categoria = null;
  renderChip();
  renderCategorias();
  renderOrcamento();
  renderInsights();
});

function toggleFiltroCategoria(nome) {
  filtro.categoria = (filtro.categoria === nome) ? null : nome;
  renderChip();
  renderCategorias();
  renderOrcamento();
  renderInsights();
}

// ── Orquestradores ────────────────────────────────────────────────────────────
// Nível 1 (visão do mês): recompute puro sobre os dados já carregados em memória.
async function renderNivel1() {
  el('periodoLabel').textContent = mesLabel(filtro.mes);
  renderKPIs();
  renderCategorias();
  await renderInvestimentos();
  await renderOrcamento();
  await renderInsights();
  renderChip();
}

// Nível 2 (tendências): só precisa re-renderizar quando a janela muda.
function renderNivel2() {
  renderGrafico12Meses();
  renderTaxaPoupancaMensal();
  renderEvolucaoPatrimonio();
}

// Ponto único de navegação de mês — usado pelo seletor manual E pelo clique
// nos gráficos de tendência (cross-filter), sempre sincronizando o <input>.
async function irParaMes(mes) {
  filtro.mes = mes;
  el('filtroMes').value = mes;

  if (!janelaCompleta.includes(mes)) {
    await carregarJanela(mes);
    renderNivel2();
  }
  await renderNivel1();
}

// ── Seletor de mês ────────────────────────────────────────────────────────────
function inicializarControles() {
  el('btnMesAnterior').addEventListener('click', () => irParaMes(mesAdicionar(filtro.mes, -1)));
  el('btnMesSeguinte').addEventListener('click', () => irParaMes(mesAdicionar(filtro.mes, 1)));
  el('filtroMes').addEventListener('change', () => irParaMes(el('filtroMes').value));
  el('btnExportarPDF').addEventListener('click', () => window.print());
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try { dolarAtual = await getUsdBrlRate(user.id); } catch (_) {}

  const hoje = new Date();
  filtro.mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  el('filtroMes').value = filtro.mes;

  const [{ data: patrim }, { data: contas }, { data: investimentos }] = await Promise.all([
    supabase.from('patrimony_history').select('reference_month,net_worth').eq('user_id', user.id).order('reference_month', { ascending: true }),
    supabase.from('accounts').select('saldo_atual,currency,nome').eq('user_id', user.id).eq('active', true),
    supabase.from('investments').select('ticker,quantidade,cotacao_atual,preco_medio,moeda').eq('user_id', user.id).eq('ativo', true),
  ]);
  patrimonioHist = patrim || [];
  accountsAll    = contas || [];
  investmentsAll = investimentos || [];

  await carregarJanela(filtro.mes);

  inicializarControles();
  renderNivel2();
  await renderNivel1();
}

init().catch(console.error);

import { supabase }       from './supabaseClient.js';
import { navigate }       from './router.js';
import { formatCurrency } from './utils.js';

// ── Auth ──────────────────────────────────────────────────────────────────────
const { data: sd } = await supabase.auth.getSession();
if (!sd.session) { navigate('../login.html'); return; }
const user = sd.session.user;

const el = id => document.getElementById(id);

document.getElementById('btnLogout').addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

// ── Estado global ─────────────────────────────────────────────────────────────
let mesAtual = '';
let dolarAtual = 5.15;
const charts  = {};

// ── Paleta de cores ───────────────────────────────────────────────────────────
const CORES = [
  '#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#e11d48','#6366f1','#84cc16',
];

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

function ultimos12Meses(ym) {
  const meses = [];
  for (let i = 11; i >= 0; i--) meses.push(mesAdicionar(ym, -i));
  return meses;
}

// ── Chart helper ──────────────────────────────────────────────────────────────
function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#94a3b8', font: { size: 12 }, boxWidth: 12, padding: 14 } },
    tooltip: { callbacks: { label: ctx => ' ' + formatCurrency(ctx.raw, 'BRL') } },
  },
  scales: {
    x: { grid: { color: 'rgba(255,255,255,.06)' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
    y: {
      grid: { color: 'rgba(255,255,255,.06)' },
      ticks: {
        color: '#94a3b8', font: { size: 11 },
        callback: v => 'R$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v.toFixed(0)),
      },
    },
  },
};

// ── Semáforo ──────────────────────────────────────────────────────────────────
function semaforo(tipo, valor) {
  if (tipo === 'resultado') return valor > 0 ? 'verde' : 'vermelho';
  if (tipo === 'poupanca')  return valor >= 20 ? 'verde' : valor >= 0 ? 'amarelo' : 'vermelho';
  if (tipo === 'varPatrim') return valor >= 0 ? 'verde' : 'vermelho';
  if (tipo === 'orcamento') return valor <= 80 ? 'verde' : valor <= 100 ? 'amarelo' : 'vermelho';
  return '';
}

function icone(cor) {
  return cor === 'verde' ? '🟢' : cor === 'amarelo' ? '🟡' : cor === 'vermelho' ? '🔴' : '';
}

// ── KPI card helper ───────────────────────────────────────────────────────────
function kpiCard({ label, valor, sub, cor }) {
  return `<div class="rpt-kpi ${cor || ''}">
    <span class="rpt-kpi-label">${label}</span>
    <span class="rpt-kpi-valor">${valor}</span>
    ${sub ? `<span class="rpt-kpi-semaforo">${sub}</span>` : ''}
  </div>`;
}

// ── SEÇÃO 2: KPIs financeiros com semáforos ───────────────────────────────────
async function renderKPIs() {
  const inicio = inicioMes(mesAtual);
  const fim    = fimMes(mesAtual);

  const [
    { data: tx },
    { data: cardTx },
    { data: histPatrim },
  ] = await Promise.all([
    supabase.from('transactions')
      .select('type,amount')
      .eq('user_id', user.id)
      .gte('date', inicio).lte('date', fim)
      .eq('status', 'pago'),

    supabase.from('card_transactions')
      .select('valor_parcela')
      .eq('user_id', user.id)
      .eq('fatura_referencia', mesAtual),

    supabase.from('patrimony_history')
      .select('reference_month,net_worth')
      .eq('user_id', user.id)
      .order('reference_month', { ascending: false })
      .limit(2),
  ]);

  const receitas  = (tx || []).filter(t => t.type === 'receita').reduce((s, t) => s + Number(t.amount || 0), 0);
  const despTx    = (tx || []).filter(t => t.type === 'despesa').reduce((s, t) => s + Number(t.amount || 0), 0);
  const despCard  = (cardTx || []).reduce((s, t) => s + Number(t.valor_parcela || 0), 0);
  const despesas  = despTx + despCard;
  const resultado = receitas - despesas;
  const poupPct   = receitas > 0 ? (resultado / receitas) * 100 : 0;

  const hist = histPatrim || [];
  const patrimonioMes  = hist.find(h => h.reference_month?.startsWith(mesAtual))?.net_worth ?? null;
  const patrimonioAnt  = hist.find(h => h.reference_month?.startsWith(mesAdicionar(mesAtual, -1)))?.net_worth ?? null;
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

// ── Stubs das seções seguintes (preenchidos nas próximas tasks) ───────────────
async function renderGrafico12Meses() {
  const meses  = ultimos12Meses(mesAtual);
  const inicio = inicioMes(meses[0]);
  const fim    = fimMes(meses[meses.length - 1]);

  const { data: tx } = await supabase
    .from('transactions')
    .select('type,amount,date')
    .eq('user_id', user.id)
    .gte('date', inicio).lte('date', fim)
    .eq('status', 'pago');

  const receitas = meses.map(m =>
    (tx || []).filter(t => t.type === 'receita' && t.date?.startsWith(m))
              .reduce((s, t) => s + Number(t.amount || 0), 0)
  );
  const despesas = meses.map(m =>
    (tx || []).filter(t => t.type === 'despesa' && t.date?.startsWith(m))
              .reduce((s, t) => s + Number(t.amount || 0), 0)
  );

  destroyChart('recdes');
  charts['recdes'] = new Chart(document.getElementById('chartRecDes'), {
    type: 'bar',
    data: {
      labels: meses.map(nomeMes),
      datasets: [
        { label: 'Receitas', data: receitas, backgroundColor: 'rgba(16,185,129,.8)', borderColor: '#10b981', borderWidth: 1 },
        { label: 'Despesas', data: despesas, backgroundColor: 'rgba(239,68,68,.8)',  borderColor: '#ef4444', borderWidth: 1 },
      ],
    },
    options: {
      ...chartDefaults,
      interaction: { mode: 'index', intersect: false },
    },
  });
}
async function renderCategorias() {
  const inicio = inicioMes(mesAtual);
  const fim    = fimMes(mesAtual);

  const [{ data: tx }, { data: cardTx }] = await Promise.all([
    supabase.from('transactions')
      .select('amount,type,categories:category_id(nome,icon)')
      .eq('user_id', user.id)
      .gte('date', inicio).lte('date', fim)
      .eq('status', 'pago')
      .eq('type', 'despesa'),

    supabase.from('card_transactions')
      .select('valor_parcela,categories:category_id(nome,icon)')
      .eq('user_id', user.id)
      .eq('fatura_referencia', mesAtual),
  ]);

  // Agregar por categoria
  const mapa = {};
  (tx || []).forEach(t => {
    const nome = t.categories?.nome || 'Outros';
    const icon = t.categories?.icon || '💸';
    const key  = nome;
    if (!mapa[key]) mapa[key] = { nome, icon, valor: 0 };
    mapa[key].valor += Number(t.amount || 0);
  });
  (cardTx || []).forEach(t => {
    const nome = t.categories?.nome || 'Cartão';
    const icon = t.categories?.icon || '💳';
    const key  = nome;
    if (!mapa[key]) mapa[key] = { nome, icon, valor: 0 };
    mapa[key].valor += Number(t.valor_parcela || 0);
  });

  const itens = Object.values(mapa).sort((a, b) => b.valor - a.valor);
  const top8  = itens.slice(0, 8);
  const outros = itens.slice(8).reduce((s, i) => s + i.valor, 0);
  if (outros > 0) top8.push({ nome: 'Outros', icon: '📦', valor: outros });

  const total = top8.reduce((s, i) => s + i.valor, 0);

  if (top8.length === 0) {
    document.getElementById('rankingCategorias').innerHTML =
      '<p class="muted" style="padding:16px;font-size:13px">Nenhuma despesa no período.</p>';
    destroyChart('cat');
    return;
  }

  // Doughnut
  destroyChart('cat');
  charts['cat'] = new Chart(document.getElementById('chartCategorias'), {
    type: 'doughnut',
    data: {
      labels:   top8.map(i => i.nome),
      datasets: [{ data: top8.map(i => i.valor), backgroundColor: CORES.slice(0, top8.length), borderWidth: 2, borderColor: 'var(--bg-card)' }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 10, padding: 10 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.raw, 'BRL')}` } },
      },
    },
  });

  // Ranking
  document.getElementById('rankingCategorias').innerHTML = top8.map((item, i) => `
    <div class="rpt-rank-item">
      <span class="rpt-rank-icon">${item.icon}</span>
      <span class="rpt-rank-nome">${item.nome}</span>
      <span class="rpt-rank-valor">${formatCurrency(item.valor, 'BRL')}</span>
      <span class="rpt-rank-pct">${total > 0 ? ((item.valor / total) * 100).toFixed(1) + '%' : ''}</span>
    </div>
  `).join('');
}
async function renderEvolucaoPatrimonio() {
  const { data: hist } = await supabase
    .from('patrimony_history')
    .select('reference_month,net_worth')
    .eq('user_id', user.id)
    .order('reference_month', { ascending: true });

  const canvas = document.getElementById('chartPatrimonio');
  const body = canvas.closest('.rpt-block').querySelector('.rpt-block-body');
  let msgEl = body.querySelector('.rpt-no-data-msg');

  if (!hist?.length) {
    destroyChart('patrim');
    canvas.style.display = 'none';
    if (!msgEl) {
      msgEl = document.createElement('p');
      msgEl.className = 'muted rpt-no-data-msg';
      msgEl.style.cssText = 'font-size:13px;padding:0';
      body.appendChild(msgEl);
    }
    msgEl.textContent = 'Salve pelo menos 2 snapshots mensais para ver a evolução.';
    msgEl.style.display = '';
    return;
  }
  canvas.style.display = '';
  if (msgEl) msgEl.style.display = 'none';

  const labels = hist.map(h => nomeMes(h.reference_month.substring(0, 7)));
  const dados  = hist.map(h => Number(h.net_worth || 0));

  destroyChart('patrim');
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 220);
  grad.addColorStop(0, 'rgba(245,158,11,.35)');
  grad.addColorStop(1, 'rgba(245,158,11,.02)');

  charts['patrim'] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Patrimônio Líquido',
        data: dados,
        borderColor: '#f59e0b',
        backgroundColor: grad,
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointBackgroundColor: '#f59e0b',
      }],
    },
    options: {
      ...chartDefaults,
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: false },
      },
    },
  });
}
async function renderInvestimentos() {
  const inicio = inicioMes(mesAtual);
  const fim    = fimMes(mesAtual);

  const [{ data: ativos }, { data: divs }] = await Promise.all([
    supabase.from('investments')
      .select('ticker,quantidade,cotacao_atual,preco_medio,moeda')
      .eq('user_id', user.id)
      .eq('ativo', true),

    supabase.from('dividends')
      .select('valor_total,data_pagamento')
      .eq('user_id', user.id)
      .gte('data_pagamento', inicio)
      .lte('data_pagamento', fim),
  ]);

  const toBRL = (a) => {
    const qty   = Number(a.quantidade  || 0);
    const atual = Number(a.cotacao_atual || a.preco_medio || 0);
    const medio = Number(a.preco_medio  || 0);
    const brl   = (v) => (a.moeda === 'USD') ? v * dolarAtual : v;
    return { mercado: brl(qty * atual), custo: brl(qty * medio) };
  };

  let totalMercado = 0, totalCusto = 0;
  (ativos || []).forEach(a => {
    const { mercado, custo } = toBRL(a);
    totalMercado += mercado;
    totalCusto   += custo;
  });

  const ganho      = totalMercado - totalCusto;
  const dividendos = (divs || []).reduce((s, d) => s + Number(d.valor_total || 0), 0);

  // KPIs
  document.getElementById('kpisInvest').innerHTML = [
    kpiCard({ label: 'Valor de Mercado', valor: formatCurrency(totalMercado, 'BRL') }),
    kpiCard({ label: 'Ganho de Capital',  valor: formatCurrency(ganho, 'BRL'),      cor: ganho >= 0 ? 'verde' : 'vermelho', sub: icone(ganho >= 0 ? 'verde' : 'vermelho') }),
    kpiCard({ label: 'Dividendos/Mês',   valor: formatCurrency(dividendos, 'BRL') }),
  ].join('');

  // Doughnut: top 8 ativos por valor de mercado
  const porAtivo = (ativos || [])
    .map(a => ({ ticker: a.ticker || '—', valor: toBRL(a).mercado }))
    .sort((a, b) => b.valor - a.valor);
  const top8   = porAtivo.slice(0, 8);
  const outros = porAtivo.slice(8).reduce((s, a) => s + a.valor, 0);
  if (outros > 0) top8.push({ ticker: 'Outros', valor: outros });

  destroyChart('cart');
  if (top8.length > 0) {
    charts['cart'] = new Chart(document.getElementById('chartCarteira'), {
      type: 'doughnut',
      data: {
        labels:   top8.map(a => a.ticker),
        datasets: [{ data: top8.map(a => a.valor), backgroundColor: CORES.slice(0, top8.length), borderWidth: 2, borderColor: 'var(--bg-card)' }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 10, padding: 10 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.raw, 'BRL')} (${totalMercado > 0 ? ((ctx.raw / totalMercado) * 100).toFixed(1) : 0}%)` } },
        },
      },
    });
  }
}
async function renderOrcamento() {
  const inicio = inicioMes(mesAtual);
  const fim    = fimMes(mesAtual);

  const [{ data: budgets }, { data: txDesp }, { data: cardTx }] = await Promise.all([
    supabase.from('budgets')
      .select('valor_planejado,category_id,categories:category_id(nome,icon)')
      .eq('user_id', user.id)
      .eq('mes_referencia', mesAtual),

    supabase.from('transactions')
      .select('amount,category_id')
      .eq('user_id', user.id)
      .gte('date', inicio).lte('date', fim)
      .eq('status', 'pago')
      .eq('type', 'despesa'),

    supabase.from('card_transactions')
      .select('valor_parcela,category_id')
      .eq('user_id', user.id)
      .eq('fatura_referencia', mesAtual),
  ]);

  const wrap = document.getElementById('wrapOrcamento');

  if (!budgets?.length) {
    wrap.innerHTML = '<p class="muted" style="font-size:13px">Nenhum orçamento cadastrado para este mês.</p>';
    destroyChart('orc');
    return;
  }

  // Gastos reais por categoria
  const gastos = {};
  (txDesp || []).forEach(t => { if (t.category_id) gastos[t.category_id] = (gastos[t.category_id] || 0) + Number(t.amount || 0); });
  (cardTx || []).forEach(t => { if (t.category_id) gastos[t.category_id] = (gastos[t.category_id] || 0) + Number(t.valor_parcela || 0); });

  const itens = budgets.map(b => ({
    nome:      b.categories?.nome || 'Categoria',
    icon:      b.categories?.icon || '💰',
    planejado: Number(b.valor_planejado || 0),
    realizado: gastos[b.category_id] || 0,
  })).sort((a, b) => b.realizado - a.realizado);

  const pcts    = itens.map(i => i.planejado > 0 ? (i.realizado / i.planejado) * 100 : 0);
  const cores   = pcts.map(p => p <= 80 ? '#10b981' : p <= 100 ? '#f59e0b' : '#ef4444');
  const altura  = Math.max(180, itens.length * 48);

  wrap.style.height = altura + 'px';

  destroyChart('orc');
  charts['orc'] = new Chart(document.getElementById('chartOrcamento'), {
    type: 'bar',
    data: {
      labels:   itens.map(i => `${i.icon} ${i.nome}`),
      datasets: [
        {
          label: 'Realizado',
          data:  itens.map(i => i.realizado),
          backgroundColor: cores,
          borderWidth: 0,
          borderRadius: 4,
        },
        {
          label: 'Orçamento',
          data:  itens.map(i => i.planejado),
          backgroundColor: 'rgba(59,130,246,.25)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 12 }, boxWidth: 12, padding: 14 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw, 'BRL')}` } },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,.06)' }, ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => 'R$' + (v >= 1000 ? (v/1000).toFixed(0)+'K' : v.toFixed(0)) } },
        y: { grid: { color: 'rgba(255,255,255,.06)' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
      },
    },
  });
}
async function renderInsights() {
  const inicio    = inicioMes(mesAtual);
  const fim       = fimMes(mesAtual);
  const mesAntStr = mesAdicionar(mesAtual, -1);
  const inicioAnt = inicioMes(mesAntStr);
  const fimAnt    = fimMes(mesAntStr);

  const [
    { data: tx },
    { data: cardTx },
    { data: txAnt },
    { data: cardTxAnt },
    { data: hist },
    { data: budgets },
    { data: txDesp },
    { data: cardTxDesp },
  ] = await Promise.all([
    supabase.from('transactions').select('type,amount,categories:category_id(nome)').eq('user_id',user.id).gte('date',inicio).lte('date',fim).eq('status','pago'),
    supabase.from('card_transactions').select('valor_parcela,categories:category_id(nome)').eq('user_id',user.id).eq('fatura_referencia',mesAtual),
    supabase.from('transactions').select('type,amount').eq('user_id',user.id).gte('date',inicioAnt).lte('date',fimAnt).eq('status','pago'),
    supabase.from('card_transactions').select('valor_parcela').eq('user_id',user.id).eq('fatura_referencia',mesAntStr),
    supabase.from('patrimony_history').select('reference_month,net_worth').eq('user_id',user.id).order('reference_month',{ascending:false}).limit(2),
    supabase.from('budgets').select('valor_planejado,category_id').eq('user_id',user.id).eq('mes_referencia',mesAtual),
    supabase.from('transactions').select('amount,category_id').eq('user_id',user.id).gte('date',inicio).lte('date',fim).eq('status','pago').eq('type','despesa'),
    supabase.from('card_transactions').select('valor_parcela,category_id').eq('user_id',user.id).eq('fatura_referencia',mesAtual),
  ]);

  const receitas  = (tx||[]).filter(t=>t.type==='receita').reduce((s,t)=>s+Number(t.amount||0),0);
  const despesas  = (tx||[]).filter(t=>t.type==='despesa').reduce((s,t)=>s+Number(t.amount||0),0)
                  + (cardTx||[]).reduce((s,t)=>s+Number(t.valor_parcela||0),0);
  const resultado = receitas - despesas;
  const poupPct   = receitas > 0 ? (resultado / receitas) * 100 : 0;

  const recAnt  = (txAnt||[]).filter(t=>t.type==='receita').reduce((s,t)=>s+Number(t.amount||0),0);
  const despAnt = (txAnt||[]).filter(t=>t.type==='despesa').reduce((s,t)=>s+Number(t.amount||0),0)
                + (cardTxAnt||[]).reduce((s,t)=>s+Number(t.valor_parcela||0),0);
  const resAnt  = recAnt - despAnt;

  // Maior categoria de gasto
  const mapaDesp = {};
  (tx||[]).filter(t=>t.type==='despesa').forEach(t=>{const n=t.categories?.nome||'Outros';mapaDesp[n]=(mapaDesp[n]||0)+Number(t.amount||0);});
  (cardTx||[]).forEach(t=>{const n=t.categories?.nome||'Cartão';mapaDesp[n]=(mapaDesp[n]||0)+Number(t.valor_parcela||0);});
  const [maiorCat,maiorVal] = Object.entries(mapaDesp).sort((a,b)=>b[1]-a[1])[0] || ['—',0];

  // Patrimônio
  const patrimonioAtual = hist?.find(h=>h.reference_month?.startsWith(mesAtual))?.net_worth;
  const patrimonioAnt   = hist?.find(h=>h.reference_month?.startsWith(mesAntStr))?.net_worth;
  const varPatrim = (patrimonioAtual != null && patrimonioAnt != null && patrimonioAnt !== 0)
    ? ((patrimonioAtual - patrimonioAnt) / Math.abs(patrimonioAnt)) * 100 : null;

  // Orçamentos estourados
  const gastosOrc = {};
  (txDesp||[]).forEach(t=>{if(t.category_id)gastosOrc[t.category_id]=(gastosOrc[t.category_id]||0)+Number(t.amount||0);});
  (cardTxDesp||[]).forEach(t=>{if(t.category_id)gastosOrc[t.category_id]=(gastosOrc[t.category_id]||0)+Number(t.valor_parcela||0);});
  const estourados = (budgets||[]).filter(b=>(gastosOrc[b.category_id]||0) > Number(b.valor_planejado||0)).length;

  // Montar insights
  const insights = [];

  if (maiorCat !== '—') {
    insights.push({ icon: '💸', text: `Maior gasto do mês: <strong>${maiorCat}</strong> com <strong>${formatCurrency(maiorVal,'BRL')}</strong>` });
  }

  if (resultado >= 0) {
    insights.push({ icon: '✅', text: `Resultado positivo: você economizou <strong>${formatCurrency(resultado,'BRL')}</strong> (${poupPct.toFixed(1)}% das receitas)` });
  } else {
    insights.push({ icon: '⚠️', text: `Resultado negativo: gastos superaram receitas em <strong>${formatCurrency(Math.abs(resultado),'BRL')}</strong>` });
  }

  if (recAnt > 0) {
    const varRec = ((receitas - recAnt) / recAnt) * 100;
    const seta   = varRec >= 0 ? '↑' : '↓';
    insights.push({ icon: '📊', text: `Receita vs ${nomeMes(mesAntStr)}: <strong>${seta} ${Math.abs(varRec).toFixed(1)}%</strong> (${formatCurrency(receitas,'BRL')} vs ${formatCurrency(recAnt,'BRL')})` });
  }

  if (varPatrim !== null) {
    const seta = varPatrim >= 0 ? '📈' : '📉';
    insights.push({ icon: seta, text: `Patrimônio ${varPatrim >= 0 ? 'cresceu' : 'caiu'} <strong>${Math.abs(varPatrim).toFixed(2)}%</strong> em relação a ${nomeMes(mesAntStr)}` });
  }

  if (estourados > 0) {
    insights.push({ icon: '🔴', text: `<strong>${estourados} categoria${estourados > 1 ? 's' : ''}</strong> acima do orçamento planejado` });
  } else if ((budgets||[]).length > 0) {
    insights.push({ icon: '🟢', text: `Todas as categorias <strong>dentro do orçamento</strong> planejado` });
  }

  const cont = document.getElementById('listaInsights');
  if (insights.length === 0) {
    cont.innerHTML = '<p class="muted" style="font-size:13px">Sem dados suficientes para gerar insights neste período.</p>';
    return;
  }
  cont.innerHTML = insights.map(i =>
    `<div class="rpt-insight"><span class="rpt-insight-icon">${i.icon}</span><span class="rpt-insight-text">${i.text}</span></div>`
  ).join('');
}

// ── Orquestrador principal ────────────────────────────────────────────────────
async function carregarTudo() {
  el('periodoLabel').textContent = mesLabel(mesAtual);
  await Promise.all([
    renderKPIs(),
    renderGrafico12Meses(),
    renderCategorias(),
    renderEvolucaoPatrimonio(),
    renderInvestimentos(),
    renderOrcamento(),
    renderInsights(),
  ]);
}

// ── Seletor de mês ────────────────────────────────────────────────────────────
function inicializarSeletor() {
  const hoje = new Date();
  mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  el('filtroMes').value = mesAtual;

  el('btnMesAnterior').addEventListener('click', () => {
    mesAtual = mesAdicionar(mesAtual, -1);
    el('filtroMes').value = mesAtual;
    carregarTudo();
  });

  el('btnMesSeguinte').addEventListener('click', () => {
    mesAtual = mesAdicionar(mesAtual, 1);
    el('filtroMes').value = mesAtual;
    carregarTudo();
  });

  el('filtroMes').addEventListener('change', () => {
    mesAtual = el('filtroMes').value;
    carregarTudo();
  });

  el('btnExportarPDF').addEventListener('click', () => window.print());
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const { data: setting } = await supabase
    .from('user_settings')
    .select('setting_value')
    .eq('user_id', user.id)
    .eq('setting_key', 'usd_brl_rate')
    .maybeSingle();
  if (setting) dolarAtual = Number(setting.setting_value) || 5.15;

  inicializarSeletor();
  await carregarTudo();
}

init().catch(console.error);

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
async function renderGrafico12Meses()   { /* Task 3 */ }
async function renderCategorias()       { /* Task 4 */ }
async function renderEvolucaoPatrimonio() { /* Task 5 */ }
async function renderInvestimentos()    { /* Task 6 */ }
async function renderOrcamento()        { /* Task 7 */ }
function renderInsights()               { /* Task 8 */ }

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
  ]);
  renderInsights();
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

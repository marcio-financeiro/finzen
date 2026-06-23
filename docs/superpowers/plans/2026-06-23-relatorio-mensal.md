# Relatório Mensal Completo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar relatório mensal completo com gráficos Chart.js, semáforos gerenciais e insights automáticos em `pages/reports.html` + `js/reports.js`.

**Architecture:** `reports.html` é reescrito com estrutura HTML completa e Chart.js 4.4.1 via CDN. `reports.js` é criado do zero como módulo ES6 com auth, seletor de mês, e funções de render independentes por seção. Cada função consulta o Supabase e preenche seu bloco de DOM.

**Tech Stack:** Vanilla JS ES Modules, Supabase PostgreSQL, Chart.js 4.4.1 CDN, CSS design system FinZen (Midnight Vault).

## Global Constraints

- Chart.js versão exata: `https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js`
- Imports: `import { supabase } from './supabaseClient.js'` · `import { navigate } from './router.js'` · `import { formatCurrency } from './utils.js'`
- Auth padrão: `const { data: sd } = await supabase.auth.getSession(); if (!sd.session) { navigate('../login.html'); return; } const user = sd.session.user;`
- `mes_referencia` em budgets = formato `'YYYY-MM'`; `reference_month` em patrimony_history = formato `'YYYY-MM-01'`
- Queries de transactions: filtrar `status='pago'` para receitas e despesas
- CSS classes prefixadas `.rpt-` para não colidir com outros módulos
- Semáforos: 🟢 ≤80% orçamento · 🟡 80-100% · 🔴 >100% / resultado: 🟢 >0 · 🔴 ≤0 / poupança: 🟢 ≥20% · 🟡 0-20% · 🔴 <0%
- Paleta Chart.js: receita `#10b981` · despesa `#ef4444` · accent `#f59e0b` · azul `#3b82f6`
- Cor grid/tick Chart.js: `rgba(255,255,255,.06)` / `#94a3b8`
- PDF: `window.print()` com `@media print` — esconder sidebar, botões, nav mobile
- Não alterar nenhum outro arquivo além de `pages/reports.html` e `js/reports.js`

---

### Task 1: HTML — Estrutura completa de `pages/reports.html`

**Files:**
- Modify: `pages/reports.html` (reescrita completa)

**Interfaces:**
- Produces: IDs de DOM consumidos por Tasks 2-9: `filtroMes`, `btnMesAnterior`, `btnMesSeguinte`, `btnExportarPDF`, `periodoLabel`, `secKPIs`, `chartRecDes`, `rankingCategorias`, `chartCategorias`, `chartPatrimonio`, `kpisInvest`, `chartCarteira`, `wrapOrcamento`, `chartOrcamento`, `listaInsights`

- [ ] **Step 1: Reescrever `pages/reports.html`**

Substituir todo o conteúdo do arquivo pelo HTML abaixo:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<script>if(localStorage.getItem("finzen_sidebar_rail")==="collapsed")document.documentElement.classList.add("sidebar-rail");</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Relatório Mensal - FinZen</title>
<link rel="stylesheet" href="../css/base.css">
<link rel="stylesheet" href="../css/layout.css">
<link rel="stylesheet" href="../css/components.css">
<link rel="stylesheet" href="../css/mobile.css">
<link rel="stylesheet" href="../css/navigation.css">
<link rel="stylesheet" href="../css/editorial.css">
<link rel="manifest" href="../manifest.json">
<meta name="theme-color" content="#f59e0b">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
/* ── Blocos ── */
.rpt-block{border:1px solid var(--border);border-radius:16px;background:var(--bg-card);overflow:hidden;margin-bottom:16px;}
.rpt-block-header{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--border);}
.rpt-block-header h2{font-size:13px;font-weight:800;margin:0;letter-spacing:.3px;}
.rpt-block-body{padding:16px 18px;}
.rpt-no-pad{padding:0;}

/* ── Controles ── */
.rpt-controls{display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap;}
.rpt-controls input[type=month]{padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);color:var(--text);font-size:14px;}

/* ── KPI grid ── */
.rpt-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;}
.rpt-kpi{border:2px solid var(--border);border-radius:12px;background:var(--bg-card);padding:14px 16px;display:flex;flex-direction:column;gap:4px;transition:border-color .2s;}
.rpt-kpi.verde{border-color:#10b981;}
.rpt-kpi.amarelo{border-color:#f59e0b;}
.rpt-kpi.vermelho{border-color:#ef4444;}
.rpt-kpi-label{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;}
.rpt-kpi-valor{font-size:20px;font-weight:800;font-family:var(--font-mono);}
.rpt-kpi-semaforo{font-size:11px;margin-top:2px;}

/* ── Grid 2 colunas ── */
.rpt-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;}
@media(max-width:820px){.rpt-grid-2{grid-template-columns:1fr;}}

/* ── Ranking categorias ── */
.rpt-rank-item{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);}
.rpt-rank-item:last-child{border-bottom:none;}
.rpt-rank-icon{width:28px;text-align:center;font-size:16px;}
.rpt-rank-nome{flex:1;font-size:13px;}
.rpt-rank-valor{font-size:13px;font-weight:700;font-family:var(--font-mono);}
.rpt-rank-pct{font-size:11px;color:var(--muted);margin-left:6px;}

/* ── KPIs sub (investimentos) ── */
.rpt-kpi-sub{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;}
.rpt-kpi-sub .rpt-kpi .rpt-kpi-valor{font-size:16px;}

/* ── Insights ── */
.rpt-insight{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.04);}
.rpt-insight:last-child{border-bottom:none;}
.rpt-insight-icon{font-size:18px;line-height:1.3;flex-shrink:0;}
.rpt-insight-text{font-size:13px;line-height:1.5;color:var(--text);}
.rpt-insight-text strong{color:var(--accent);}

/* ── @media print ── */
@media print{
  .sidebar,.mobile-menu-button,.mobile-privacy-btn,.rpt-controls,.finzen-fab-wrap,
  #btnLogout,.sidebar-rail-toggle,.drawer-overlay,.mobile-drawer{display:none!important;}
  .content{margin-left:0!important;padding:0!important;}
  .rpt-block{break-inside:avoid;border:1px solid #ccc!important;background:#fff!important;color:#000!important;}
  .rpt-block-header h2{color:#000!important;}
  body{background:#fff!important;}
  canvas{max-width:100%!important;}
  h1{font-size:18px!important;}
  .rpt-kpi{border:1px solid #ccc!important;background:#f9f9f9!important;}
  .rpt-kpi-valor,.rpt-insight-text,.rpt-rank-nome,.rpt-rank-valor{color:#000!important;}
}
</style>
</head>
<body>
<div class="app-shell">
  <aside class="sidebar">
    <div class="sidebar-brand">FinZen</div>
    <nav class="sidebar-nav"></nav>
  </aside>

  <main class="content">
    <header class="topbar">
      <div>
        <h1>Relatório Mensal</h1>
        <p id="userEmail" class="muted"></p>
      </div>
      <button type="button" class="btn btn-danger compact" id="btnLogout">Sair</button>
    </header>

    <!-- Controles -->
    <div class="rpt-controls">
      <button id="btnMesAnterior" class="btn btn-secondary compact" type="button">◀</button>
      <input type="month" id="filtroMes">
      <button id="btnMesSeguinte" class="btn btn-secondary compact" type="button">▶</button>
      <button id="btnExportarPDF" class="btn btn-secondary" type="button">📄 Exportar PDF</button>
      <p id="periodoLabel" class="muted" style="font-size:13px;margin:0"></p>
    </div>

    <!-- KPIs -->
    <div class="rpt-kpi-grid" id="secKPIs"></div>

    <!-- Receita vs Despesa 12 meses -->
    <div class="rpt-block">
      <div class="rpt-block-header"><h2>📊 Receita vs Despesa — últimos 12 meses</h2></div>
      <div class="rpt-block-body" style="height:260px">
        <canvas id="chartRecDes"></canvas>
      </div>
    </div>

    <!-- Categorias -->
    <div class="rpt-grid-2">
      <div class="rpt-block" style="margin-bottom:0">
        <div class="rpt-block-header"><h2>🍕 Despesas por Categoria</h2></div>
        <div class="rpt-block-body" style="height:260px">
          <canvas id="chartCategorias"></canvas>
        </div>
      </div>
      <div class="rpt-block" style="margin-bottom:0">
        <div class="rpt-block-header"><h2>📋 Ranking de Categorias</h2></div>
        <div class="rpt-no-pad" id="rankingCategorias"></div>
      </div>
    </div>
    <div style="margin-bottom:16px"></div>

    <!-- Evolução do Patrimônio -->
    <div class="rpt-block">
      <div class="rpt-block-header"><h2>💎 Evolução do Patrimônio</h2></div>
      <div class="rpt-block-body" style="height:220px">
        <canvas id="chartPatrimonio"></canvas>
      </div>
    </div>

    <!-- Investimentos -->
    <div class="rpt-block">
      <div class="rpt-block-header"><h2>📈 Investimentos</h2></div>
      <div class="rpt-block-body">
        <div class="rpt-kpi-sub" id="kpisInvest"></div>
        <div style="height:220px;margin-top:16px">
          <canvas id="chartCarteira"></canvas>
        </div>
      </div>
    </div>

    <!-- Orçamento vs Realizado -->
    <div class="rpt-block">
      <div class="rpt-block-header"><h2>🎯 Orçamento vs Realizado</h2></div>
      <div class="rpt-block-body" id="wrapOrcamento">
        <canvas id="chartOrcamento"></canvas>
      </div>
    </div>

    <!-- Insights -->
    <div class="rpt-block">
      <div class="rpt-block-header"><h2>💡 Insights do Mês</h2></div>
      <div class="rpt-block-body" id="listaInsights"></div>
    </div>

  </main>
</div>

<script src="../js/version.js"></script>
<script type="module" src="../js/navigation.js"></script>
<script type="module" src="../js/reports.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verificar no browser**

Push, aguardar deploy (~30s). Abrir `https://finzen-rho.vercel.app/pages/reports.html`. Confirmar: página carrega com título "Relatório Mensal", seletor de mês visível, botão PDF visível, blocos vazios renderizados (sem erro de 404 no console).

- [ ] **Step 3: Commit**

```bash
git add pages/reports.html
git commit -m "feat: reports.html — estrutura completa com Chart.js e CSS .rpt-*"
git push
```

---

### Task 2: reports.js — Boilerplate + seletor de mês + KPIs financeiros

**Files:**
- Create: `js/reports.js`

**Interfaces:**
- Consumes: IDs do HTML da Task 1 — `filtroMes`, `btnMesAnterior`, `btnMesSeguinte`, `btnExportarPDF`, `periodoLabel`, `secKPIs`
- Consumes: tabelas `transactions` (type, amount, date, status, category_id), `card_transactions` (valor_parcela, fatura_referencia), `patrimony_history` (reference_month, net_worth)
- Produces: variáveis de módulo `mesAtual` (string `'YYYY-MM'`), `user` (Supabase user), `dolarAtual` (number), `charts` (object), funções `inicioMes(ym)`, `fimMes(ym)`, `mesLabel(ym)`, `nomeMes(ym)`, `mesAdicionar(ym, n)`, `destroyChart(key)`, `renderKPIs()` (async), `carregarTudo()` (async, stub que chamará todas as funções de render)

- [ ] **Step 1: Criar `js/reports.js` com boilerplate, helpers e renderKPIs()**

```js
import { supabase }       from './supabaseClient.js';
import { navigate }       from './router.js';
import { formatCurrency } from './utils.js';

// ── Auth ──────────────────────────────────────────────────────────────────────
const { data: sd } = await supabase.auth.getSession();
if (!sd.session) { navigate('../login.html'); }
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
  const mesRef = mesAtual + '-01';
  const mesAntRef = mesAdicionar(mesAtual, -1) + '-01';
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
```

- [ ] **Step 2: Verificar no browser**

Push, deploy. Abrir `reports.html`. Confirmar:
- KPIs renderizam com valores reais (Receitas, Despesas, Resultado, Taxa de Poupança)
- Semáforos (borda colorida + emoji) aparecem em Resultado e Taxa de Poupança
- Seletor de mês: clicar ◀ muda o mês e recarrega os KPIs
- Console sem erros

- [ ] **Step 3: Commit**

```bash
git add js/reports.js
git commit -m "feat: reports.js — boilerplate, seletor de mês e KPIs financeiros com semáforos"
git push
```

---

### Task 3: Gráfico Receita vs Despesa — 12 meses

**Files:**
- Modify: `js/reports.js` — substituir stub `renderGrafico12Meses()` pela implementação

**Interfaces:**
- Consumes: `mesAtual`, `user`, `charts`, `destroyChart()`, `ultimos12Meses()`, `nomeMes()`, `inicioMes()`, `fimMes()`, `mesAdicionar()`, `chartDefaults`
- Consumes: tabela `transactions` (type, amount, date, status)

- [ ] **Step 1: Substituir o stub `renderGrafico12Meses()` em `js/reports.js`**

Localizar a linha `async function renderGrafico12Meses()   { /* Task 3 */ }` e substituir por:

```js
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
```

- [ ] **Step 2: Verificar no browser**

Push, deploy. Confirmar: gráfico de barras agrupadas aparece com 12 meses no eixo X, barras verdes (receitas) e vermelhas (despesas). Navegar para mês anterior — gráfico atualiza.

- [ ] **Step 3: Commit**

```bash
git add js/reports.js
git commit -m "feat: reports — gráfico receita vs despesa 12 meses"
git push
```

---

### Task 4: Despesas por Categoria — doughnut + ranking

**Files:**
- Modify: `js/reports.js` — substituir stub `renderCategorias()`

**Interfaces:**
- Consumes: `mesAtual`, `user`, `charts`, `destroyChart()`, `inicioMes()`, `fimMes()`, `CORES`, `formatCurrency`
- Consumes: `transactions` (type, amount, date, status, category_id) + `card_transactions` (valor_parcela, fatura_referencia, category_id) com join `categories:category_id(nome,icon)`
- Produces: preenche `chartCategorias` (canvas) e `rankingCategorias` (div)

- [ ] **Step 1: Substituir stub `renderCategorias()` em `js/reports.js`**

```js
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
```

- [ ] **Step 2: Verificar no browser**

Push, deploy. Confirmar: doughnut com top 8 categorias de despesa aparece à esquerda; ranking com ícone, nome, valor e % aparece à direita. Trocar mês atualiza ambos.

- [ ] **Step 3: Commit**

```bash
git add js/reports.js
git commit -m "feat: reports — doughnut e ranking de despesas por categoria"
git push
```

---

### Task 5: Evolução do Patrimônio — line chart

**Files:**
- Modify: `js/reports.js` — substituir stub `renderEvolucaoPatrimonio()`

**Interfaces:**
- Consumes: `user`, `charts`, `destroyChart()`, `nomeMes()`, `formatCurrency`
- Consumes: `patrimony_history` (reference_month, net_worth) — `reference_month` formato `'YYYY-MM-01'`

- [ ] **Step 1: Substituir stub `renderEvolucaoPatrimonio()` em `js/reports.js`**

```js
async function renderEvolucaoPatrimonio() {
  const { data: hist } = await supabase
    .from('patrimony_history')
    .select('reference_month,net_worth')
    .eq('user_id', user.id)
    .order('reference_month', { ascending: true });

  const canvas = document.getElementById('chartPatrimonio');

  if (!hist?.length) {
    canvas.closest('.rpt-block').querySelector('.rpt-block-body').innerHTML =
      '<p class="muted" style="font-size:13px">Salve pelo menos 2 snapshots mensais para ver a evolução.</p>';
    return;
  }

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
```

- [ ] **Step 2: Verificar no browser**

Push, deploy. Confirmar: linha âmbar com gradiente de preenchimento aparece quando há dados em `patrimony_history`. Se não houver dados, mensagem "Salve pelo menos 2 snapshots mensais..." aparece.

- [ ] **Step 3: Commit**

```bash
git add js/reports.js
git commit -m "feat: reports — line chart evolução do patrimônio"
git push
```

---

### Task 6: Investimentos do mês — KPIs + doughnut carteira

**Files:**
- Modify: `js/reports.js` — substituir stub `renderInvestimentos()`

**Interfaces:**
- Consumes: `mesAtual`, `user`, `dolarAtual`, `charts`, `destroyChart()`, `CORES`, `formatCurrency`
- Consumes: `investments` (ticker, quantidade, cotacao_atual, preco_medio, moeda, ativo=true), `dividends` (valor_total, data_pagamento)

- [ ] **Step 1: Substituir stub `renderInvestimentos()` em `js/reports.js`**

```js
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
```

- [ ] **Step 2: Verificar no browser**

Push, deploy. Confirmar: 3 KPIs de investimento aparecem (Valor de Mercado, Ganho de Capital com semáforo, Dividendos). Doughnut com tickers aparece abaixo.

- [ ] **Step 3: Commit**

```bash
git add js/reports.js
git commit -m "feat: reports — investimentos KPIs e doughnut composição da carteira"
git push
```

---

### Task 7: Orçamento vs Realizado — barras horizontais com semáforos

**Files:**
- Modify: `js/reports.js` — substituir stub `renderOrcamento()`

**Interfaces:**
- Consumes: `mesAtual`, `user`, `charts`, `destroyChart()`, `semaforo()`, `formatCurrency`
- Consumes: `budgets` (valor_planejado, category_id, mes_referencia) com join `categories:category_id(nome,icon)`, `transactions` (amount, type, category_id, date, status), `card_transactions` (valor_parcela, fatura_referencia, category_id)

- [ ] **Step 1: Substituir stub `renderOrcamento()` em `js/reports.js`**

```js
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
```

- [ ] **Step 2: Verificar no browser**

Push, deploy. Confirmar: barras horizontais com orçamento (azul) vs realizado (verde/amarelo/vermelho conforme % do limite). Se não houver orçamentos, mensagem aparece.

- [ ] **Step 3: Commit**

```bash
git add js/reports.js
git commit -m "feat: reports — orçamento vs realizado barras horizontais com semáforos"
git push
```

---

### Task 8: Insights Automáticos + PDF export

**Files:**
- Modify: `js/reports.js` — substituir stub `renderInsights()` e finalizar integração com `carregarTudo()`

**Interfaces:**
- Consumes: `mesAtual`, `user`, `mesLabel()`, `mesAdicionar()`, `nomeMes()`, `inicioMes()`, `fimMes()`, `formatCurrency`
- Consumes: `transactions`, `card_transactions`, `patrimony_history`, `budgets` — mesmas queries das tasks anteriores, em paralelo
- Produces: preenche `listaInsights` com lista de bullets; PDF funcional via `window.print()`

- [ ] **Step 1: Substituir stub `renderInsights()` e atualizar `carregarTudo()` em `js/reports.js`**

Substituir a função stub `renderInsights()` e a função `carregarTudo()`:

```js
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
```

- [ ] **Step 2: Verificar no browser**

Push, deploy. Confirmar:
1. Seção "Insights do Mês" mostra bullets com ícones e valores em destaque âmbar
2. Botão "📄 Exportar PDF" abre diálogo de impressão com sidebar e botões ocultos, gráficos visíveis em fundo branco

- [ ] **Step 3: Commit**

```bash
git add js/reports.js
git commit -m "feat: reports — insights automáticos e PDF export finalizado"
git push
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Seção 1: seletor de mês (Task 2 — `inicializarSeletor`)
- ✅ Seção 2: KPIs com semáforos (Task 2 — `renderKPIs`)
- ✅ Seção 3: gráfico 12 meses (Task 3 — `renderGrafico12Meses`)
- ✅ Seção 4: doughnut + ranking (Task 4 — `renderCategorias`)
- ✅ Seção 5: evolução patrimônio (Task 5 — `renderEvolucaoPatrimonio`)
- ✅ Seção 6: investimentos + doughnut carteira (Task 6 — `renderInvestimentos`)
- ✅ Seção 7: orçamento barras horizontais + semáforos (Task 7 — `renderOrcamento`)
- ✅ Seção 8: insights automáticos (Task 8 — `renderInsights`)
- ✅ Seção 9: PDF export via `window.print()` + `@media print` (Task 1 CSS + Task 2 botão)
- ✅ Patrimônio KPI com variação (Task 2 — `renderKPIs`)
- ✅ Fallback para seções sem dados (Tasks 4, 5, 7, 8)

**Assinaturas consistentes:**
- `mesAtual` string `'YYYY-MM'` usado uniformemente em todas as tasks ✓
- `user` objeto Supabase auth definido no topo do módulo ✓
- `charts` object com chaves `'recdes'`, `'cat'`, `'patrim'`, `'cart'`, `'orc'` ✓
- `kpiCard()` usado em Tasks 2 e 6 ✓
- `destroyChart(key)` com string key consistente ✓

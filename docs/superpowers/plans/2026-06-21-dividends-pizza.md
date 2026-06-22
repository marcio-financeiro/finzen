# Distribuição de Proventos por Ativo (Pizza) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar gráfico donut SVG na página de Dividendos mostrando distribuição percentual de proventos por ativo, respeitando os filtros ativos.

**Architecture:** Reutiliza os dados já carregados por `carregarDividendos()` — zero queries extras. Um novo `<section>` no HTML recebe a `<div id="pizzaProventos">`. A função `renderizarPizza(proventos)` é chamada junto com `renderizarResumo` e `renderizarTabela`, usando o padrão SVG inline já estabelecido em `reports.js`.

**Tech Stack:** Vanilla JS ES Modules, SVG inline, Supabase (leitura indireta via dados já carregados)

## Global Constraints

- Sem nova query ao Supabase
- Sem nova dependência externa (sem Chart.js)
- Sem alteração de `sw.js`, `version.js`, `CACHE_NAME`, ou `ASSET_VERSION` (dividends.html não está no SW cache; só JS muda, sem CSS)
- Seguir padrão SVG donut de `reports.js:142-170`
- Paleta: `['#f59e0b','#22c55e','#6366f1','#ef4444','#06b6d4','#f97316','#ec4899','#84cc16','#8b5cf6','#94a3b8']` — índice 9 reservado para "Outros"
- Top 8 ativos; restantes agrupados em "Outros"
- `formatCurrency` já importado em dividends.js via `import { formatCurrency } from './utils.js'`

---

### Task 1: Container HTML

**Files:**
- Modify: `pages/dividends.html:117`

**Interfaces:**
- Produces: `<div id="pizzaProventos">` para Task 2 injetar HTML

- [ ] **Step 1: Adicionar seção antes de "Histórico de Proventos"**

Localizar em `pages/dividends.html` a linha:
```html
    <section class="panel">
      <div class="panel-header">
        <h2>Histórico de Proventos</h2>
      </div>
```

Inserir **antes** dela:
```html
    <section class="panel">
      <div class="panel-header">
        <h2>Distribuição por Ativo</h2>
      </div>
      <div id="pizzaProventos"></div>
    </section>

```

- [ ] **Step 2: Verificar HTML no browser**

Abrir `pages/dividends.html` no browser (ou acessar a URL de produção após deploy). Confirmar que aparece a seção "Distribuição por Ativo" sem conteúdo ainda (vazia, sem erros no console).

- [ ] **Step 3: Commit**

```bash
git add pages/dividends.html
git commit -m "feat: adiciona container pizzaProventos em dividends.html"
```

---

### Task 2: Função renderizarPizza + integração

**Files:**
- Modify: `js/dividends.js:154-158` (call site em `carregarDividendos`)
- Modify: `js/dividends.js:240` (append função antes de `iniciar()`)

**Interfaces:**
- Consumes: `proventos[]` — array de objetos com `{ investments: { ticker, nome }, valor_liquido, valor_total }`
- Consumes: `formatCurrency(valor, 'BRL')` — já importado
- Produces: HTML renderizado em `document.getElementById('pizzaProventos')`

- [ ] **Step 1: Adicionar chamada em carregarDividendos**

Localizar em `js/dividends.js` o bloco:
```js
  const proventos = data || [];

  renderizarResumo(proventos);
  renderizarTabela(proventos);
}
```

Alterar para:
```js
  const proventos = data || [];

  renderizarResumo(proventos);
  renderizarPizza(proventos);
  renderizarTabela(proventos);
}
```

- [ ] **Step 2: Adicionar constante de paleta + função renderizarPizza**

Localizar a linha final do arquivo:
```js
iniciar();
```

Inserir **antes** dela o bloco completo abaixo:

```js
// ── Distribuição por ativo (donut SVG) ───────────────
const CORES_PIZZA = ['#f59e0b','#22c55e','#6366f1','#ef4444','#06b6d4','#f97316','#ec4899','#84cc16','#8b5cf6','#94a3b8'];

function renderizarPizza(proventos) {
  const container = document.getElementById('pizzaProventos');
  if (!container) return;

  if (!proventos.length) {
    container.innerHTML = '<p class="muted" style="font-size:13px">Nenhum provento no período.</p>';
    return;
  }

  const grupos = {};
  proventos.forEach(item => {
    const ticker = item.investments?.ticker || item.investments?.nome || 'Desconhecido';
    const valor = Number(item.valor_liquido || item.valor_total || 0);
    if (!grupos[ticker]) grupos[ticker] = { ticker, total: 0 };
    grupos[ticker].total += valor;
  });

  const ordenados = Object.values(grupos).sort((a, b) => b.total - a.total);
  const top8 = ordenados.slice(0, 8);
  const resto = ordenados.slice(8);

  const items = [...top8];
  if (resto.length) {
    const totalOutros = resto.reduce((s, i) => s + i.total, 0);
    items.push({ ticker: 'Outros', total: totalOutros });
  }

  const total = items.reduce((s, i) => s + i.total, 0);
  if (!total) {
    container.innerHTML = '<p class="muted" style="font-size:13px">Nenhum provento no período.</p>';
    return;
  }

  const R = 55, cx = 65, cy = 65, stroke = 20, circ = 2 * Math.PI * R;
  let offset = 0;
  const segs = items.map((item, i) => {
    item._cor = item.ticker === 'Outros' ? CORES_PIZZA[9] : CORES_PIZZA[i];
    const dash = (item.total / total) * circ;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${item._cor}" stroke-width="${stroke}"
      stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += dash;
    return seg;
  });

  container.innerHTML = `
    <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
      <svg width="130" height="130" viewBox="0 0 130 130" style="flex-shrink:0">
        ${segs.join('')}
        <text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="var(--text)" font-size="10" font-weight="800">${formatCurrency(total, 'BRL')}</text>
      </svg>
      <div style="flex:1;min-width:120px">
        ${items.map(item => `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:12px">
            <span style="width:10px;height:10px;border-radius:50%;background:${item._cor};flex-shrink:0"></span>
            <span style="flex:1">${item.ticker}</span>
            <span style="color:var(--muted);font-size:11px;font-weight:700">${(item.total / total * 100).toFixed(1)}%</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

```

- [ ] **Step 3: Testar no browser**

1. Abrir a página de Dividendos (produção ou local).
2. Verificar que o gráfico donut aparece com cores e percentuais corretos.
3. Mudar o filtro de Ano ou Tipo e clicar "Aplicar Filtros" — confirmar que o donut atualiza.
4. Selecionar um ativo específico no filtro — confirmar que o donut mostra só esse ativo (100%).
5. Testar ano sem dados — confirmar mensagem "Nenhum provento no período."

- [ ] **Step 4: Commit + push**

```bash
git add js/dividends.js
git commit -m "feat: gráfico pizza de proventos por ativo (item 7)"
git push
```

---

## Self-Review

- ✅ Sem placeholder ou TBD
- ✅ `formatCurrency` já importado — nenhuma importação nova necessária
- ✅ `item.investments?.ticker` e `item.investments?.nome` correspondem exatamente ao select da query em `carregarDividendos` (`investments:investment_id (id, ticker, nome, moeda)`)
- ✅ Caso vazio coberto em dois pontos: array vazio e total zero
- ✅ Nomes de função consistentes entre tasks: `renderizarPizza` em Task 2 step 1 e step 2
- ✅ Sem mudança de CSS, ASSET_VERSION, CACHE_NAME

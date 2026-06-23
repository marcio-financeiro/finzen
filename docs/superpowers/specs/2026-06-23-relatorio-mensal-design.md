# Design — Relatório Mensal Completo
**Data:** 2026-06-23  
**Escopo:** `pages/reports.html` (reescrita) + `js/reports.js` (novo)

---

## Objetivo

Relatório mensal completo da vida financeira: finanças pessoais (receitas, despesas, cartões, orçamento) + investimentos (patrimônio, rentabilidade, dividendos). Inspirado no framework FP&A com KPIs executivos, semáforos gerenciais, visualizações Chart.js e insights automáticos. Seletor de mês + exportação PDF.

---

## Arquitetura

- **`pages/reports.html`** — reescrito com estrutura limpa; carrega Chart.js 4.4.1 via CDN
- **`js/reports.js`** — módulo ES6 único; sem dependências além de `supabaseClient.js` e `config.js`
- **Sem nova rota** — aproveita o link "Relatório" já existente no menu

---

## Fontes de Dados

| Dado | Tabela | Campos |
|---|---|---|
| Receitas/despesas | `transactions` | `type, amount, date, status, category_id` |
| Faturas cartão | `card_transactions` | `valor_parcela, fatura_referencia, category_id` |
| Nomes de categorias | `categories` (join) | `nome, icon` |
| Orçamentos | `budgets` | `valor_planejado, category_id, mes_referencia` |
| Evolução patrimonial | `patrimony_history` | `reference_month, net_worth, investments_total, accounts_total, cards_total` |
| Carteira atual | `investments` | `ticker, quantidade, cotacao_atual, preco_medio, moeda` |
| Dividendos do mês | `dividends` | `valor_total, data_pagamento` |
| Câmbio | `user_settings` | `setting_key='usd_brl_rate'` |

---

## Seção 1 — Seletor de Mês + Ações

```html
[◀ Mês anterior]  [Jun 2026 ▾]  [Mês seguinte ▶]   [📄 Exportar PDF]
```

- Padrão: mês atual
- Navegar com setas ou dropdown `<input type="month">`
- PDF via `window.print()` com `@media print` dedicado

---

## Seção 2 — KPIs com Semáforos

6 cards em grid responsivo (3×2 desktop, 2×3 mobile):

| ID | Label | Fonte | Semáforo |
|---|---|---|---|
| `kpiReceitas` | Receitas | `transactions` type=receita, status=pago | — |
| `kpiDespesas` | Despesas | `transactions` type=despesa + `card_transactions` | — |
| `kpiResultado` | Resultado | Receitas − Despesas | 🟢 >0 / 🔴 ≤0 |
| `kpiPoupanca` | Taxa de Poupança | Resultado / Receitas × 100 | 🟢 ≥20% / 🟡 0–20% / 🔴 <0% |
| `kpiPatrimonio` | Patrimônio Líquido | `patrimony_history.net_worth` do mês selecionado | — |
| `kpiVarPatrimonio` | Variação Patrimônio | net_worth[M] − net_worth[M-1] em % | 🟢 >0 / 🔴 ≤0 |

Semáforo visual: borda colorida no card + ícone 🟢/🟡/🔴 abaixo do valor.

---

## Seção 3 — Gráfico Receita vs Despesa (12 meses)

- **Tipo:** barras agrupadas (Chart.js `bar`)
- **Eixo X:** últimos 12 meses até o mês selecionado
- **Séries:** Receitas (verde `#10b981`) + Despesas (vermelho `#ef4444`)
- **Fonte:** `transactions` agrupadas por mês
- **Altura:** 260px

---

## Seção 4 — Despesas por Categoria

Layout 2 colunas (desktop) / empilhado (mobile):

**Esquerda — Doughnut:**
- Chart.js `doughnut`, top 8 categorias + "Outros"
- Cores: paleta de 9 cores fixas do design system FinZen
- Altura: 240px

**Direita — Ranking (tabela):**
- Colunas: ícone + categoria | valor | % do total
- Ordenado por valor decrescente
- Fonte: `transactions` type=despesa + `card_transactions` do mês, com join em `categories`

---

## Seção 5 — Evolução do Patrimônio

- **Tipo:** linha (Chart.js `line`), preenchimento gradiente (`fill: true`)
- **Eixo X:** todos os meses em `patrimony_history` (order ASC)
- **Série única:** `net_worth`
- **Cor:** `#f59e0b` (accent FinZen)
- **Marcador no mês selecionado:** ponto maior + tooltip destacado
- **Altura:** 220px
- **Fallback:** mensagem "Salve ao menos 2 snapshots mensais para ver a evolução."

---

## Seção 6 — Investimentos do Mês

3 cards de KPI + gráfico pizza:

| Card | Valor |
|---|---|
| Valor de Mercado | Σ (quantidade × cotacao_atual × câmbio) |
| Ganho de Capital | Valor de Mercado − Σ (quantidade × preco_medio × câmbio) |
| Dividendos do Mês | Σ `dividends.valor_total` onde `data_pagamento` ∈ mês selecionado |

**Gráfico Doughnut — Composição da Carteira:**
- Agrupado por `moeda` (BRL / USD) ou por ticker (top 8 + Outros)
- Altura: 220px

---

## Seção 7 — Orçamento vs Realizado

- **Tipo:** barras horizontais (Chart.js `bar`, `indexAxis: 'y'`)
- **Fonte:** `budgets` do mês + gastos reais das `transactions` + `card_transactions`
- **Séries:** Planejado (azul `#3b82f6`) + Realizado (dinâmico por semáforo)
- **Semáforo por barra:**
  - 🟢 ≤80% do limite → `#10b981`
  - 🟡 80–100% → `#f59e0b`
  - 🔴 >100% → `#ef4444`
- **Fallback:** "Nenhum orçamento cadastrado para este mês."
- **Altura:** 40px × número de categorias (mín 180px)

---

## Seção 8 — Insights Automáticos

Bloco com fundo `var(--surface-2)`, lista de bullets gerados por regras:

| Insight | Regra |
|---|---|
| Maior gasto | Categoria com maior valor absoluto no mês |
| Resultado vs anterior | Receita do mês vs mês−1, exibe ↑/↓ |
| Poupança | "Você economizou X%" ou "Gastou X% a mais que ganhou" |
| Patrimônio | "Patrimônio cresceu/caiu X% em relação a [mês−1]" (se houver dados) |
| Investimento | "Carteira valorizou/desvalorizou X% no período" (se cotacao_atual > 0) |
| Orçamento | "N categorias acima do orçamento" (se houver budget cadastrado) |

Máximo 6 insights. Cada um tem: ícone + texto gerado + valor em destaque.

---

## Seção 9 — Exportar PDF

- `window.print()` com CSS `@media print`:
  - Esconder sidebar, botões, seletor de mês, mobile nav
  - Expandir gráficos para ocupar largura total
  - Fonte preta em fundo branco
  - Título "Relatório Financeiro — [Mês Ano]" no topo
- Sem biblioteca externa de PDF

---

## CSS e Estilo

- Seguir design system FinZen (Midnight Vault): `--bg-card`, `--border`, `--accent`, `--success`, `--danger`
- Classes prefixadas `.rpt-` para não colidir com outros módulos
- Chart.js: mesma versão já usada em `analytics.html` (4.4.1 CDN)
- Grid: `display:grid; grid-template-columns: repeat(auto-fit, minmax(280px,1fr))`
- Mobile: breakpoint `820px` igual ao padrão do projeto

---

## Arquivos Alterados

| Arquivo | Mudança |
|---|---|
| `pages/reports.html` | Reescrita completa (mantém rota, remove HTML inline obsoleto) |
| `js/reports.js` | Criado do zero |

## Arquivos NÃO alterados

CSS globais, `navigation.js`, `sw.js`, `vercel.json`, demais páginas.

---

## Cache

- JS: `vercel.json` com `no-store` cobre `reports.js` automaticamente
- CSS: estilos inline no HTML — nenhuma ação em `version.js`

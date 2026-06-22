# Spec — Gráfico pizza de proventos por ativo

**Data:** 2026-06-21  
**Arquivo alvo:** `js/dividends.js`, `pages/dividends.html`  
**Status:** Aprovado pelo usuário

---

## Objetivo

Adicionar um gráfico donut SVG na página de Dividendos mostrando a distribuição percentual de proventos recebidos por ativo (ticker), respeitando os filtros ativos (ano, tipo, ativo).

---

## Comportamento

- **Posição na página:** entre os cards de KPI e a tabela de proventos
- **Dados:** mesma lista `proventos[]` já carregada por `carregarDividendos()` — sem nova query ao Supabase
- **Agrupamento:** por `investments.ticker` (ou `investments.nome` como fallback); soma `valor_liquido` (fallback `valor_total`)
- **Limite:** Top 8 ativos por valor; todos além do 8º são agrupados como "Outros"
- **Filtros:** a função `renderizarPizza(proventos)` é chamada dentro de `carregarDividendos()`, portanto reage automaticamente a qualquer mudança de filtro
- **Caso vazio:** exibe `<p class="muted">Nenhum provento no período.</p>`

---

## Implementação

### `pages/dividends.html`

Adicionar container entre KPIs e tabela:

```html
<div id="pizzaProventos" style="margin-bottom:24px"></div>
```

### `js/dividends.js`

1. Adicionar chamada `renderizarPizza(proventos)` no final de `carregarDividendos()` (após `renderizarTabela`).

2. Implementar `renderizarPizza(proventos)`:
   - Agrupar por ticker, somar valor_liquido
   - Ordenar decrescente, pegar Top 8, agrupar resto em "Outros"
   - Renderizar donut SVG inline (raio 55, stroke-width 20, viewBox 130×130) — mesmo padrão de `reports.js:142-170`
   - Paleta de 9 cores fixas + cor neutra para "Outros"
   - Legenda lateral: bolinha colorida + ticker + percentual

---

## Paleta de cores

```
['#f59e0b','#22c55e','#6366f1','#ef4444','#06b6d4','#f97316','#ec4899','#84cc16','#8b5cf6','#94a3b8']
```
Índice 9 (`#94a3b8`) reservado para "Outros".

---

## Restrições

- Sem nova dependência externa (sem Chart.js em dividends.html)
- Sem nova query ao Supabase
- Sem alteração de tabela ou CACHE_NAME/ASSET_VERSION (CSS não muda)
- Seguir padrão de SVG donut já estabelecido em `reports.js`

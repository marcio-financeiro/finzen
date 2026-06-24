# Modo Claro Vyn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar o modo claro do PWA Vyn substituindo a paleta amber FinZen por champagne Vyn em variáveis CSS, sidebar e componentes.

**Architecture:** Todos os overrides são adicionados em `css/base.css` via seletor `html[data-theme="light"]`. `css/navigation.css` recebe apenas overrides do logo. `components.css` não é tocado.

**Tech Stack:** CSS custom properties, seletores `html[data-theme="light"]`

## Global Constraints

- `components.css` não deve ser modificado — todos os overrides vão em `base.css`
- Nomes de variáveis CSS inalterados — só valores mudam
- Modo escuro não pode ser afetado
- Accent escuro: `#7A5C1E` (champagne escuro, passa WCAG AA 4.5:1 em fundo claro)
- Accent gradiente claro: `linear-gradient(135deg, #7A5C1E, #9A7A3A)`
- RGB do accent claro: `122,92,30`

---

### Task 1: Tokens do modo claro (`base.css`)

**Files:**
- Modify: `css/base.css` — bloco `html[data-theme="light"]`

**Interfaces:**
- Produces: variáveis `--accent`, `--gold-gradient`, `--accent-dim`, `--warning`, `--warning-dim`, `--bg`, `--app-bg`, `--surface`, `--surface-2`, `--surface-3`, `--border`, `--muted`, `--hover-overlay`, `--shadow` disponíveis para todos os seletores seguintes

- [ ] **Step 1: Substituir o bloco `html[data-theme="light"]` em `css/base.css`**

Localizar o bloco atual (começa em `/* ── Tema claro (Slate Fintech) ── */`) e substituir por:

```css
/* ── Tema claro (Vyn Champagne) ── */
html[data-theme="light"]{
  --bg:#F4F1EC;
  --app-bg:#F4F1EC;

  --surface:#FFFDF9;
  --surface-2:#F5EFE3;
  --surface-3:#EDE4D3;

  --border:#DDD0B8;

  --accent:#7A5C1E;
  --gold-gradient:linear-gradient(135deg, #7A5C1E, #9A7A3A);
  --accent-dim:rgba(122,92,30,0.12);

  --warning:#7A5C1E;
  --warning-dim:rgba(122,92,30,0.12);

  --text:#11151C;
  --muted:#6B5E4A;

  --shadow:0 24px 70px rgba(100,72,20,.12);

  --input-color:#11151C;
  --hover-overlay:rgba(122,92,30,.06);
}
```

- [ ] **Step 2: Verificar que o modo escuro não foi afetado**

Abrir `css/base.css` e confirmar que o bloco `:root` original está intacto — `--accent:#C9A968`, `--bg:#07080f` etc.

- [ ] **Step 3: Commit**

```bash
git add css/base.css
git commit -m "style: tokens modo claro → paleta champagne Vyn"
```

---

### Task 2: Sidebar champagne (`base.css` + `navigation.css`)

**Files:**
- Modify: `css/base.css` — adicionar bloco de overrides da sidebar após o bloco de overrides pontuais existente
- Modify: `css/navigation.css` — adicionar overrides do logo

**Interfaces:**
- Consumes: `--accent` (`#7A5C1E`), `--border` (`#DDD0B8`) da Task 1
- Produces: sidebar com fundo `#F0E4C8→#EDD9AE`, logo VYN legível, drawer mobile com mesmo fundo

- [ ] **Step 1: Adicionar overrides da sidebar em `css/base.css`**

Localizar o final do bloco `/* Overrides pontuais para o tema claro */` (termina após `.drawer-overlay`) e adicionar logo depois:

```css
/* ── Sidebar champagne (modo claro) ── */
html[data-theme="light"] .sidebar {
  background: linear-gradient(160deg, #F0E4C8 0%, #EDD9AE 100%);
  border-right: 1px solid #DDD0B8;
}

html[data-theme="light"] .sidebar-nav a {
  color: #3D2E12;
}
html[data-theme="light"] .sidebar-nav a.active {
  background: rgba(122,92,30,0.15);
  color: #5C4416;
}
html[data-theme="light"] .sidebar-nav a:hover {
  background: rgba(122,92,30,0.08);
}

html[data-theme="light"] .sidebar-profile {
  background: rgba(255,255,255,0.45);
  border-color: rgba(122,92,30,0.18);
}

html[data-theme="light"] .sidebar-footer {
  border-top-color: rgba(122,92,30,0.15);
}

/* Drawer mobile */
html[data-theme="light"] .mobile-drawer {
  background: #F0E4C8;
}
html[data-theme="light"] .drawer-avatar {
  background: linear-gradient(135deg, #7A5C1E, #9A7A3A);
  color: #FFFDF9;
}
html[data-theme="light"] .drawer-name {
  color: #3D2E12;
}
html[data-theme="light"] .drawer-sub {
  color: #7A6545;
}
```

- [ ] **Step 2: Adicionar overrides do logo em `css/navigation.css`**

Localizar o bloco `/* ── Logo-mark ── */` e adicionar após `.sidebar-logo-sub { ... }`:

```css
/* ── Logo-mark modo claro ── */
html[data-theme="light"] .sidebar-logo-mark {
  background: linear-gradient(135deg, #7A5C1E, #9A7A3A);
  color: #FFFDF9;
}
html[data-theme="light"] .sidebar-logo-name {
  color: #4A3510;
}
html[data-theme="light"] .sidebar-logo-sub {
  color: #7A6545;
  opacity: 1;
}
```

- [ ] **Step 3: Commit**

```bash
git add css/base.css css/navigation.css
git commit -m "style: sidebar champagne no modo claro Vyn"
```

---

### Task 3: Overrides de componentes amber (`base.css`)

**Files:**
- Modify: `css/base.css` — adicionar overrides para cada componente com amber hardcoded em `components.css`

**Interfaces:**
- Consumes: `--accent` (`#7A5C1E`), `--surface` (`#FFFDF9`), `--border` (`#DDD0B8`) da Task 1

- [ ] **Step 1: Adicionar overrides de componentes em `css/base.css`**

Adicionar ao final do arquivo, após os overrides da sidebar da Task 2:

```css
/* ── Overrides de componentes amber → champagne (modo claro) ── */

/* Página de auth — gradientes de fundo */
html[data-theme="light"] .auth-page {
  background:
    radial-gradient(circle at top left,rgba(122,92,30,.08),transparent 32%),
    radial-gradient(circle at bottom right,rgba(122,92,30,.05),transparent 34%),
    var(--app-bg);
}

/* Brand mark (tela de login) */
html[data-theme="light"] .brand-mark {
  border-color: rgba(122,92,30,0.25);
  box-shadow: 0 16px 36px rgba(122,92,30,.15);
}

/* Botão primário */
html[data-theme="light"] .btn-primary {
  box-shadow: 0 10px 24px rgba(122,92,30,.20);
}

/* KPI cards do dashboard */
html[data-theme="light"] .dash-kpi {
  background: #FFFDF9;
  border: 1px solid rgba(122,92,30,0.18);
  box-shadow: 0 4px 16px rgba(122,92,30,.10);
}
html[data-theme="light"] .dash-kpi:hover {
  box-shadow: 0 4px 20px rgba(122,92,30,.18);
}
html[data-theme="light"] .kpi-clickable:hover {
  box-shadow: 0 4px 16px rgba(122,92,30,.15);
}

/* Badge do chat IA (CFAI) */
html[data-theme="light"] .cfai-badge {
  background: rgba(122,92,30,.12);
  color: #7A5C1E;
}

/* Botão do chat IA */
html[data-theme="light"] .cfai-btn {
  background: linear-gradient(135deg, #7A5C1E, #9A7A3A);
}

/* Cursor piscante do chat IA */
html[data-theme="light"] .cfai-cursor {
  background: #7A5C1E;
}

/* Botão de anomalia IA (mantém vermelho, troca amber por champagne) */
html[data-theme="light"] .anai-btn {
  background: linear-gradient(135deg, #ef4444, #7A5C1E);
}

/* Painel do assistente */
html[data-theme="light"] .assistant-panel {
  border-color: rgba(122,92,30,.22);
  background: linear-gradient(135deg, rgba(122,92,30,.07), rgba(122,92,30,.02));
}
html[data-theme="light"] .assistant-item {
  border-color: rgba(122,92,30,.10);
  background: rgba(122,92,30,.04);
}
```

- [ ] **Step 2: Verificar cobertura — confirmar que nenhum amber visível ficou de fora**

Executar:
```bash
grep -n "rgba(245,158,11\|#f59e0b\|#fbbf24" /home/marcio/finzen/css/components.css
```

Para cada linha no resultado, verificar se já há um override `html[data-theme="light"]` cobrindo esse seletor em `base.css`. As linhas abaixo são cobertas:
- L8–9: `.auth-page` ✓
- L45–46: `.brand-mark` ✓
- L132: `.btn-primary` ✓
- L261: `.kpi-clickable:hover` ✓
- L391: `.dash-kpi:hover` ✓
- L448: `.orcamento-bar.warn` — usa `var(--warning)` que já foi atualizado na Task 1 ✓
- L601: `.cfai-badge` ✓
- L612: `.cfai-btn` ✓
- L633: `.cfai-cursor` ✓
- L653: `.anai-btn` ✓ (vermelho+champagne)
- L676: `.anai-btn` — mesma regra, já coberta ✓
- L701–702: `.assistant-panel` ✓
- L738: `.assistant-item` ✓

- [ ] **Step 3: Commit**

```bash
git add css/base.css
git commit -m "style: overrides componentes amber → champagne no modo claro"
```

---

### Task 4: Incrementar ASSET_VERSION e push

**Files:**
- Modify: `js/version.js` — incrementar `ASSET_VERSION`

**Interfaces:**
- Consumes: nada das tasks anteriores
- Produces: cache CSS invalidado em produção

- [ ] **Step 1: Incrementar ASSET_VERSION em `js/version.js`**

Alterar:
```js
const ASSET_VERSION = '1200';
```
Para:
```js
const ASSET_VERSION = '1201';
```

- [ ] **Step 2: Commit e push**

```bash
git add js/version.js
git commit -m "chore: bump ASSET_VERSION 1200→1201 (modo claro Vyn)"
git push
```

- [ ] **Step 3: Verificar deploy**

Aguardar ~30s e confirmar deploy `READY` na Vercel. Abrir o app em modo claro e verificar:
- Sidebar com fundo champagne dourado
- Logo VYN legível
- Fundo geral off-white quente (não frio)
- Botões e badges com tons champagne
- Modo escuro inalterado ao alternar

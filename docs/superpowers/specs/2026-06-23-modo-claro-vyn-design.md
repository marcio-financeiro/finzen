# Spec: Refatoração do Modo Claro — Vyn

**Data:** 2026-06-23
**Abordagem:** B — Paleta + componentes (sem redesign de layout)

---

## Contexto

O modo claro (`html[data-theme="light"]`) existe desde o FinZen mas nunca recebeu as cores Vyn. O accent ainda é `#C07408` (amber FinZen), os fundos são frios (`#F2F5F9`), e ~16 ocorrências hardcoded de `rgba(245,158,11,...)` em `components.css` ficam visualmente inconsistentes em fundo claro.

**Fora do escopo:** layout, tipografia, componentes funcionais (tabelas, modais), cores de income/expense/transfer.

---

## Paleta Vyn — Modo Claro

### Tokens champagne para modo claro

| Token | Valor | Uso |
|---|---|---|
| `--accent` | `#7A5C1E` | Accent principal — passa WCAG AA 4.5:1 em fundo claro |
| `--gold-gradient` | `linear-gradient(135deg, #7A5C1E, #9A7A3A)` | Gradientes de destaque |
| `--accent-dim` | `rgba(122,92,30,0.12)` | Fundos tintados de accent |
| `--warning` | `#7A5C1E` | Igual ao accent (coerência) |
| `--warning-dim` | `rgba(122,92,30,0.12)` | Fundo de warning |
| `--bg` / `--app-bg` | `#F4F1EC` | Off-white champagne, levemente quente |
| `--surface` | `#FFFDF9` | Branco quente (não frio) |
| `--surface-2` | `#F5EFE3` | Superfície secundária champagne suave |
| `--surface-3` | `#EDE4D3` | Terceiro nível, mais dourado |
| `--border` | `#DDD0B8` | Borda champagne |
| `--muted` | `#6B5E4A` | Texto auxiliar com tom quente |
| `--hover-overlay` | `rgba(122,92,30,0.06)` | Hover champagne |
| `--shadow` | `0 24px 70px rgba(100,72,20,.12)` | Sombra dourada suave |

**Inalterados:** `--text`, `--success`, `--danger`, `--info`, `--success-dim`, `--danger-dim`, raios, fontes, transições.

---

## Sidebar Champagne

A sidebar recebe identidade visual própria no modo claro — fundo champagne que a diferencia do conteúdo principal.

### Overrides em `base.css`

```css
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
```

### Overrides em `navigation.css`

```css
/* Logo mark */
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

### Drawer mobile

```css
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
```

---

## Elementos de Destaque

### KPI Cards

```css
html[data-theme="light"] .dash-kpi,
html[data-theme="light"] .kpi-card {
  background: #FFFDF9;
  border: 1px solid rgba(122,92,30,0.18);
  box-shadow: 0 4px 16px rgba(122,92,30,0.10);
}
html[data-theme="light"] .dash-kpi:hover {
  box-shadow: 0 4px 20px rgba(122,92,30,0.18);
}
```

### Badges e tags champagne

```css
html[data-theme="light"] [class*="badge-gold"],
html[data-theme="light"] [class*="premium"],
html[data-theme="light"] [class*="tag-ouro"] {
  background: rgba(122,92,30,0.10);
  color: #5C4416;
}
```

### Gradientes sólidos em `components.css`

Os 2 gradientes com `#f59e0b,#fbbf24` recebem override:

```css
html[data-theme="light"] .logo-gradient,
html[data-theme="light"] .award-gradient {
  background: linear-gradient(135deg, #7A5C1E, #9A7A3A);
}
```

### Box-shadows e fundos amber (`rgba(245,158,11,...)`)

As ~14 ocorrências restantes em `components.css` recebem overrides agrupados em `base.css`, substituindo o RGB `245,158,11` por `122,92,30` nos mesmos percentuais de opacidade.

---

## Arquivos modificados

| Arquivo | O que muda |
|---|---|
| `css/base.css` | Bloco `html[data-theme="light"]` — tokens + overrides de sidebar, KPI, badges |
| `css/navigation.css` | Overrides de `.sidebar-logo-mark`, `.sidebar-logo-name`, `.sidebar-logo-sub` |

`components.css` **não é editado** — todos os overrides são adicionados em `base.css` via seletor `html[data-theme="light"]`.

---

## Critérios de aceitação

- [ ] Contrast ratio do `--accent` ≥ 4.5:1 em `--surface` (`#FFFDF9`)
- [ ] Sidebar claramente distinguível do conteúdo principal
- [ ] Logo VYN legível na sidebar champagne
- [ ] Nenhum `rgba(245,158,11,...)` visível de forma inconsistente em fundo claro
- [ ] Modo escuro inalterado
- [ ] `components.css` não editado

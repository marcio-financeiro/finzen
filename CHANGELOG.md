# FinZen — Changelog

> **Como usar este arquivo**
> A cada entrega, uma nova entrada é adicionada no topo com:
> - Versão e data
> - Arquivos modificados
> - O que foi adicionado, corrigido ou removido
> - Migrações de banco necessárias (se houver)
>
> **Fluxo de versão de assets (desde a Fase 1 da auditoria, 2026-08):**
> CSS é versionado automaticamente por `js/version.js` (`ASSET_VERSION`) — só
> incrementar esse número quando CSS mudar, não é mais preciso editar `?v=`
> em cada HTML manualmente. JS não é versionado por query string: o servidor
> serve `/js/*.js` com `must-revalidate`, o browser sempre confere com o
> Vercel se há versão nova.

---

## [11.6] — 2026-08-07 — Redesign visual "Ledger" + Fase 3 (parte 1)

### Redesign visual
- Conceito "Ledger": grade fina de papel de razão atrás do conteúdo, cards com hairline em vez de sombra difusa, header em mono — aplicado em `login.html`, `pages/dashboard.html` e, via `css/layout.css`/`css/components.css`, em todas as páginas que usam o shell padrão
- Login redesenhado (form real com Enter, toggle de senha, correção de contraste do texto digitado no tema claro)
- Remove sombra suave (glow) de botões primários e KPI cards nos dois temas

### Fase 3 (parte 1) — Shell e design system
- Extrai ~1.9k linhas de `<style>` inline de 19 páginas para `css/pages/*.css` (mesmo CSS, sem mudança visual)
- Unifica marca: `Vyn`/`VYN`/`VY` → `FinZen`/`FZ` em títulos, manifest, sidebar e drawer mobile

### Pendente da Fase 3
- Unificação de fato dos 13 variantes de card / 7 de aba / 4 spinners em componentes únicos (requer merge de regras entre páginas, verificação visual manual)
- `navigation.js` → `shell.js`

## [11.5] — 2026-08-06 — Auditoria: Fase 0 (segurança) + Fase 1 (limpeza)

### Fase 0 — Segurança e integridade financeira
- Corrige IDOR em `api/telegram-link.js` — `user_id` vinha do body/query, agora sempre do JWT
- Restringe `api/calendar-sync.js` ao dono do app (`FINZEN_USER_ID`)
- Elimina race condition de estado global em `api/telegram-webhook.js` (`AsyncLocalStorage`) e troca `SELECT→UPDATE` manual por RPC atômica em `execLancar`
- Crons (`telegram-cron`, `cotacao-cron`, `recurring-cron`) passam a exigir `CRON_SECRET` (fail-closed) e retornam status de erro real em falha
- Remove anon key hardcoded de `api/cotacao-cron.js` e `scripts/*.js` → env vars
- `js/movements.js`: `pagarMovimentoFinZen` usa `ajustarSaldo` (delta atômico) em vez de `SELECT→UPDATE` manual
- Remove `debit/credit/updateAccountBalance` mortos de `accountService.js`
- Corrige chave de câmbio errada em `patrimonySnapshot.js` (`usd_brl_rate` → `usd_brl`)
- `vercel.json`: security headers (CSP, HSTS, X-Frame-Options etc.)
- `api/quotes.js`: rate limit por IP
- **Migração aplicada:** `database/2026_08_06_fase0_seguranca.sql` — restringe as 5 RPCs `SECURITY DEFINER` a `service_role` + policies de RLS faltantes (account_transfers, exchange_transactions, ai_usage)

### Fase 1 — Limpeza e quick wins
- Remove 6 módulos JS órfãos (~1.300 linhas): `accounts.js`, `cards.js`, `categories.js`, `transfers.js`, `cardPurchases.js`, `assistant.js`
- `js/version.js` movido para o `<head>` de todas as páginas (antes ficava no fim do `<body>`, causando 2 downloads do CSS por navegação); remove `?v=1200` hardcoded dos `<link>`/`<script>`
- `vercel.json`: cache de `/js/*.js` de `no-store` para `must-revalidate`; `/css/*` ganha `immutable`
- `js/navigation.js`: remove chave duplicada do alias `transfers.html`; remove a nav inferior legada morta (`<nav class="mobile-nav">`) do JS e de 20 HTMLs
- **Migração aplicada:** `database/2026_08_06_fase1_indices.sql` — índices em `categories`, `credit_cards`, `goals`, `budgets`, `allocation_targets`, `offshore_overtime`, `investments`, `calendar_events(google_event_id)`
- `database/schema.sql` populado com o schema real extraído do banco (fonte de verdade)
- `CACHE_NAME` em `sw.js` → `vyn-v13.0` (HTMLs pré-cacheados mudaram de estrutura)
- `APP_VERSION` → `11.5`

---

## [11.2] — 2026-06-18

### Versão dos assets
| Arquivo alterado | Novo `?v=` a aplicar em todos os HTMLs |
|---|---|
| `js/navigation.js` | `?v=1101` |
| `css/navigation.css` | `?v=1101` |

### Adicionado
- **Menu reorganizado em 5 grupos colapsáveis:** Financeiro / Investimentos / Gestão Pessoal / Inteligência / Sistema
- **Calendário e Offshore** reinseridos no grupo Gestão Pessoal (estavam faltando)
- **Meu Perfil** reinserido no grupo Sistema
- **Toggle de privacidade** 👁️ / 🙈 para ocultar valores monetários
  - Desktop: rodapé do sidebar, ao lado da versão
  - Mobile: botão fixo no canto superior direito (espelho do ☰)
  - Oculta elementos com `.money`, `.kpi-card strong`, `.dash-kpi strong`, `[data-sensitive]`
  - Estado salvo em `localStorage` (`finzen_privacy`)
- **Limpeza automática** de chaves `localStorage` de versões antigas do nav (`nav_collapsed_*`)
- Grupo com página ativa abre forçado, mesmo se estava colapsado
- Drawer mobile exibe nome e e-mail do usuário logado
- Chave de versão do nav atualizada para `nav_collapsed_v3_*`

### Arquivos de banco
- Nenhuma migração necessária

---

## [11.1] — anterior

### Versão dos assets
| Arquivo | `?v=` vigente |
|---|---|
| Todos os JS/CSS | `?v=1020` |

### Estado entregue
- Dashboard com 6 blocos inteligentes
- Movimentações com filtro, pendentes e FAB
- Faturas agrupadas por mês
- Menu unificado via `navigation.js` (versão anterior — 2 grupos)
- Investimentos com 5 abas (Carteira / Aportar / Dividendos / Balancear / Termômetro)
- PWA + manifest + ícones
- FAB mobile (receita, despesa, cartão, transferência, câmbio)
- Câmbio BRL↔USD com RPC Supabase
- Calendário (3 visões: Mensal/Semanal/Lista, 7 tipos de evento, exportação .ics)
- Offshore (4 abas: Escala / Certificações / Horas Extras / Histórico)
- Chat IA via `api/analyze.js` (Claude Sonnet 4.6)
- Previsão inteligente de fluxo de caixa (cashflowAI.js)
- Detecção de anomalias e assinaturas fantasmas (anomalyAI.js)
- Score de saúde financeira no dashboard
- Extrato por conta com transferências
- Patrimônio histórico
- Relatório mensal com export PDF
- Analytics com Chart.js
- Perfil + onboarding 4 etapas
- Notificações via EmailJS
- Busca em 9 fontes simultâneas
- Backup e restauração
- Importador OFX/CSV
- Metas financeiras + FIRE + Comparador
- Orçamentos por categoria
- RLS ativo em todas as 21 tabelas

### Arquivos de banco
- `2026_06_11_account_transfers.sql`
- `2026_06_11_delete_account_transfer.sql`
- `2026_06_11_sort_order.sql`
- `2026_06_12_accounts_broker_kind.sql`
- `2026_06_12_investments_broker_usd_brl.sql`
- `2026_06_12_investments_fixes_9432.sql`
- `2026_06_12_patrimony_history.sql`
- `2026_06_12_recurrence_active.sql`
- `2026_06_12_recurring_transactions.sql`
- `2026_06_12_transactions_recurrence_simplified.sql`
- `2026_06_13_exchange_transactions_944a.sql`

---

## [9.4.4A] — anterior

### Adicionado
- Tabela `exchange_transactions`
- Função SQL `create_currency_exchange` para conversão atômica entre contas BRL e USD
- Tela de conversão cambial em Transferências
- Taxa de câmbio informada manualmente no momento da conversão

---

## [9.4.3.4] — anterior

### Corrigido
- Carregamento da navegação unificada no Dashboard
- Adicionado `navigation.css` ao Dashboard
- Estilos da sidebar reforçados para evitar menu desalinhado quando cache ou CSS falha


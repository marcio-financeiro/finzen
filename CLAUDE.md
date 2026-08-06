# CLAUDE.md — FinZen Assessor Pessoal

## Comunicação
- Responder sempre em **português**
- Comunicação direta e objetiva — Márcio é conciso, Claude também deve ser
- Frases curtas. Sem explicações longas desnecessárias
- Indicar exatamente **arquivo + trecho** onde inserir o código

## Estilo de trabalho
- **Confirmar antes de executar qualquer alteração**
- Nunca agir sem autorização explícita do Márcio
- Não consertar o que não foi pedido — implementar só o que foi solicitado
- Se uma correção falhar duas vezes, refazer o arquivo do zero a partir do original
- Preferir soluções simples — evitar complexidade desnecessária
- Credenciais Supabase no client-side são aceitáveis (uso pessoal)

## Verificação antes de entregar

**Toda implementação ou modificação deve ser testada antes de reportar como pronta.**

Fluxo obrigatório:
1. Fazer o commit e push
2. Aguardar deploy Vercel ficar `READY` (verificar via MCP `list_deployments`)
3. Abrir a página afetada no Chrome via DevTools MCP (`navigate_page`)
4. Testar o fluxo principal da feature (screenshot ou `evaluate_script` para confirmar estado)
5. Só então reportar como pronto — com evidência visual ou resultado do script

Checks adicionais:
- Checar que toda função que usa `await` é declarada como `async`
- Ao alterar JS: **não precisa fazer nada** — `vercel.json` serve `/js/*.js` com `Cache-Control: public, max-age=0, must-revalidate` (ETag), o browser sempre revalida no servidor
- Ao alterar CSS: incrementar `ASSET_VERSION` em `js/version.js` (ver valor atual no próprio arquivo) — ele reaplica `?v=` nos `<link>` CSS. `js/version.js` roda no `<head>`, logo após os `<link>` de CSS (não no fim do `<body>`) — se criar uma página nova, mantenha essa ordem
- Ao alterar HTMLs cacheados pelo SW (`login.html`, `pages/dashboard.html`, `pages/movements.html`, `pages/mobile.html`, `pages/card-bills.html`, `pages/registrations.html` — ver `CACHE_URLS` em `sw.js`): incrementar `CACHE_NAME` em `sw.js` (formato `vyn-vX.Y`)
- Nunca deixar quebrar páginas que não foram pedidas para alterar

## Contexto do projeto

**Márcio** — não programador, trabalha offshore (ciclos 14×21), usa VS Code + Linux Mint.
Workflow: Márcio descreve → Claude implementa → Márcio sobe no GitHub → Vercel auto-deploy (~30s) → Márcio testa.

**FinZen** é um PWA de finanças pessoais de uso pessoal.

- **Produção:** finzen-rho.vercel.app
- **Repo:** github.com/marcio-financeiro/finzen
- **Versão:** veja `js/config.js` → `APP_VERSION`

## Comandos de desenvolvimento

```bash
# Não há build local — Vercel faz o deploy automaticamente ao push
git add .
git commit -m "descricao"
git push  # → Vercel auto-deploy em ~30s
```

## Arquitetura

```
pages/          → HTMLs (uma página por módulo; accounts/cards/categories/
                  transfers/card-purchases são REDIRECTS para registrations/movements)
js/             → Módulos ES6 (um .js por página)
js/version.js   → Controle central de versão de assets (ASSET_VERSION)
js/eventBus.js  → Delegação de eventos via data-action (preferido ao window.fn)
js/toast.js     → toast() global + comTrava() anti-duplo-clique em botões salvar
js/moneyMask.js → máscara de moeda BR (attachMoneyMask/readMoneyValue/setMoneyValue)
js/modal.js     → openModal/showChoice/showDetail (Escape + trap de foco + role=dialog)
js/services/    → financeService, accountService, transferService,
                  cardService (fonte ÚNICA do cálculo de fatura + purchase_group_id),
                  balanceService (ajustarSaldo — delta atômico via RPC, com fallback)
js/utils/       → escapeHtml (usar em TODO dado do usuário interpolado em innerHTML),
                  dateUtils (hojeISO no fuso LOCAL — nunca toISOString p/ "hoje")
css/            → variables.css → base.css → layout.css → components.css →
                  navigation.css → mobile.css · editorial.css (breakpoint mobile: 820px)
api/quotes.js   → Serverless Function (proxy brapi.dev + Yahoo Finance)
api/_aiRateLimit.js → limite diário nos endpoints de IA (tabela ai_usage)
database/       → Migrations SQL (YYYY_MM_DD_descricao.sql) — aplicar no SQL Editor.
                  database/schema.sql = fonte de verdade do schema atual (extraída do banco)
js/config.js    → SUPABASE_URL, SUPABASE_ANON_KEY, APP_VERSION
manifest.json   → PWA (start_url: dashboard; shortcuts de lançamento)
vercel.json     → security headers (CSP etc.) + cache de /js e /css + crons (telegram/cotacao/recurring)
```

## Stack

| Camada       | Tecnologia                                    |
|--------------|-----------------------------------------------|
| Frontend     | Vanilla JS (ES Modules), HTML, CSS            |
| Backend/DB   | Supabase (PostgreSQL + Auth + RLS)            |
| Hosting      | Vercel (Serverless Node.js)                   |
| IA           | Claude Sonnet via api.anthropic.com           |
| Cotações BR  | brapi.dev (token em config.js)                |
| Cotações EUA | Yahoo Finance v7                              |
| Câmbio       | AwesomeAPI + brapi fallback                   |
| E-mail       | EmailJS                                       |

## Design system

Tokens reais em `css/variables.css` (única fonte de verdade — este bloco é só um resumo, conferir o arquivo antes de usar cor "de cabeça"):

```css
--bg:            #0a0c10
--surface:       #12151c
--surface-2:     #181c24
--surface-3:     #20242e
--border:        #232732
--accent:        #c08a3e   /* dourado */
--accent-bright: #dcb067
--success:       #3f8f63
--danger:        #cf6a55
--warning:       #c08a3e
--info:          #3b82f6
--text:          #e8e4d8
--muted:         #94907f
--radius-sm/md/lg: 8px/10px/12px
```

Existe também `html[data-theme="light"]` (tema claro) definido no mesmo arquivo — não usar `prefers-color-scheme`, a troca é manual via atributo.

Tokens de espaçamento (`--space-1`..`--space-8`) e tipografia (`--text-xs`..`--text-3xl`) também existem em `variables.css` mas **hoje quase não são usados** em `components.css` (valores mágicos em px direto) — ao escrever CSS novo, preferir os tokens.

Arquivos CSS em `css/`: variables.css → base.css → layout.css → components.css → navigation.css → mobile.css → editorial.css.
Importar nessa ordem em todas as páginas (editorial.css só onde necessário).

## Padrões de código obrigatórios

```js
// Auth no topo de todo módulo (preferido — helper novo):
import { requireAuth } from './supabaseClient.js';
const user = await requireAuth();

// Legado ainda presente em vários módulos:
const { data: sd } = await supabase.auth.getSession();
if (!sd.session) navigate('../login.html');
const user = sd.session.user;

// Saldo de conta: NUNCA fazer SELECT saldo → soma em JS → UPDATE.
// Usar sempre o delta atômico:
import { ajustarSaldo } from './services/balanceService.js';
await ajustarSaldo(accountId, delta); // delta pode ser negativo

// Fatura de cartão: cálculo de referência SÓ via cardService
import { invoiceRef, addMonthsRef, novoGrupoCompra, inserirParcelasCartao } from './services/cardService.js';

// XSS: TODO dado do usuário interpolado em innerHTML passa por escapeHtml
import { escapeHtml } from './utils/escapeHtml.js';

// Padrão preferido para eventos em HTML gerado dinamicamente (eventBus.js):
import { registrarAcao } from './eventBus.js';
registrarAcao('excluirItem', (el) => { const id = el.dataset.id; ... });
// No HTML: <button data-action="excluirItem" data-id="${item.id}">

// Fallback legado (onclick=""): expor no window
window.minhaFuncao = minhaFuncao;

// Toda função com await deve ser async
async function carregarDados() { ... }
```

## Banco de dados (Supabase)

29 tabelas, todas com RLS (`auth.uid() = user_id`, exceto `stay_*`/`travel_*`/`category_rules` que usam `FOR ALL`). Schema completo e atualizado: **`database/schema.sql`** (extraído do banco, é a fonte de verdade — não confiar de cabeça numa lista fixa aqui, ela fica desatualizada).

Grupos: financeiro (`accounts`, `transactions`, `credit_cards`, `card_transactions`, `categories`, `category_rules`, `budgets`, `goals`, `account_transfers`, `exchange_transactions`, `recurring_transactions`) · investimentos (`investments`, `investment_transactions`, `dividends`, `allocation_targets`, `patrimony_history`) · gestão pessoal (`calendar_events`, `offshore_cycles`, `offshore_overtime`, `certifications`) · viagens (`travel_favorites`, `travel_alerts`, `stay_favorites`, `stay_alerts`) · sistema (`user_settings`, `ai_usage`, `telegram_links`, `telegram_pending`, `profiles` — órfã, sem uso no código).

RPCs `SECURITY DEFINER` (`aviso_*`, `cotacao_*`) só podem ser chamadas com `service_role` desde a migration `2026_08_06_fase0_seguranca.sql` — nunca com a anon key.

## Proxy de cotações (api/quotes.js)

```
?tickers=BBAS3,AAPL   → /\d/.test(ticker) → brapi.dev (BR)
                       → /^[A-Z]{1,5}$/ → Yahoo Finance (EUA)
?dolar=true            → câmbio USD/BRL
?fundamental=true      → P/L, ROE, DY
```

Regra: tickers com dígito = BR; só letras = EUA.

## Áreas de risco

- **ES Modules + onclick:** funções de módulos não ficam no escopo global automaticamente — usar `data-action` + `registrarAcao` (preferido) ou `window.fn = fn` (legado)
- **Cache JS:** `vercel.json` serve `/js/*.js` com `Cache-Control: public, max-age=0, must-revalidate` — não adicionar `?v=` em `<script>` tags, o servidor sempre revalida (ETag/304) e o browser não reusa versão antiga
- **Cache CSS:** `js/version.js` roda no `<head>`, logo após os `<link>` de CSS — aplica `?v=XXXX` antes do browser terminar de parsear o `<head>`. Se mover esse `<script>` pro fim do `<body>` de novo, volta o bug de CSS baixado 2x (uma vez com o `?v=` "cru" do HTML, outra com o `?v=` corrigido tarde)
- **Cache HTML:** o SW cacheia `login.html`, `pages/dashboard.html`, `pages/movements.html`, `pages/mobile.html`, `pages/card-bills.html`, `pages/registrations.html` (ver `CACHE_URLS` em `sw.js`) — ao mudar estrutura de qualquer um desses, incrementar `CACHE_NAME`
- **Edge Functions Vercel:** bloqueiam APIs externas — usar Serverless Node.js (`vercel.json: {}`)
- **Yahoo Finance:** pode ser instável em IPs Vercel
- **BCB API:** bloqueia Vercel e CORS — inviável, não usar
- **Promise.all:** alinhar queries e variáveis com comentários para evitar desalinhamento silencioso
- **RPCs SECURITY DEFINER:** as RPCs de leitura/escrita em massa (`aviso_*`, `cotacao_*`, usadas por crons) exigem `service_role` — nunca chamar com a anon key do client

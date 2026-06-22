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
- Checar que toda função que usa `await` é declarada como `async`
- Ao alterar JS: **não precisa fazer nada** — `vercel.json` serve todos os `/js/*.js` com `Cache-Control: no-store`, browser sempre busca versão fresca
- Ao alterar CSS: incrementar `ASSET_VERSION` em `js/version.js` (atual: **1118**) — ele re-aplica `?v=` nos `<link>` CSS forçando re-fetch
- Ao alterar `sw.js`: incrementar `CACHE_NAME` (atual: `finzen-v11.7`) para o SW reinstalar e buscar HTMLs atualizados
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
pages/          → 36 HTMLs (uma página por módulo)
js/             → Módulos ES6 (um .js por página)
js/version.js   → Controle central de versão de assets (ASSET_VERSION)
js/eventBus.js  → Delegação de eventos via data-action (preferido ao window.fn)
js/services/    → financeService, accountService, transferService
css/            → base.css · layout.css · components.css · navigation.css · mobile.css · editorial.css
api/quotes.js   → Serverless Function (proxy brapi.dev + Yahoo Finance)
database/       → Migrations SQL (YYYY_MM_DD_descricao.sql)
js/config.js    → SUPABASE_URL, SUPABASE_ANON_KEY, APP_VERSION
manifest.json   → PWA (theme_color: #f59e0b)
vercel.json     → {} (Node.js padrão)
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

## Design system (v12.0 — Midnight Vault)

```css
--accent:      #f59e0b   /* dourado FinZen */
--bg-root:     #07080f   /* fundo raiz */
--bg-surface:  #0f1018   /* topbar, sidebar */
--bg-card:     #161821   /* cards */
--color-income:  #10b981
--color-expense: #ef4444
--color-transfer:#3b82f6
--font-ui:     'Inter', sans-serif
--font-mono:   'DM Mono', monospace
```

Arquivos CSS em `css/`: base.css → layout.css → components.css → navigation.css → mobile.css → editorial.css.
Importar nessa ordem em todas as páginas (editorial.css só onde necessário).

## Padrões de código obrigatórios

```js
// Auth no topo de todo módulo
const { data: sd } = await supabase.auth.getSession();
if (!sd.session) navigate('../login.html');
const user = sd.session.user;

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

Tabelas (todas com RLS `auth.uid() = user_id`):
`accounts` · `transactions` · `credit_cards` · `card_transactions`
`investments` · `investment_transactions` · `dividends`
`account_transfers` · `exchange_transactions` · `categories` · `budgets`
`goals` · `allocation_targets` · `category_rules` · `user_settings`
`recurring_transactions` · `calendar_events` · `offshore_cycles`
`offshore_overtime` · `certifications` · `patrimony_history`

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
- **Cache JS:** `vercel.json` já garante `no-store` para todos os `.js` — não adicionar `?v=` em `<script>` tags, o browser sempre busca do servidor
- **Cache CSS:** `version.js` aplica `?v=XXXX` nos `<link>` CSS em runtime — funciona porque mudar `href` de um `<link>` força re-fetch imediato
- **Cache HTML:** o SW cacheia `login.html` e `dashboard.html` — ao mudar estrutura desses HTMLs, incrementar `CACHE_NAME` em `sw.js`
- **`version.js` não faz cache-bust de JS:** o speculative preloader do browser busca scripts antes de `version.js` executar; por isso a abordagem `no-store` no servidor
- **Edge Functions Vercel:** bloqueiam APIs externas — usar Serverless Node.js (`vercel.json: {}`)
- **Yahoo Finance:** pode ser instável em IPs Vercel
- **BCB API:** bloqueia Vercel e CORS — inviável, não usar
- **Promise.all:** alinhar queries e variáveis com comentários para evitar desalinhamento silencioso

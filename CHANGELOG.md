# FinZen — Changelog

> **Como usar este arquivo**
> A cada entrega, uma nova entrada é adicionada no topo com:
> - Versão e data
> - Arquivos modificados (com o `?v=` novo a aplicar)
> - O que foi adicionado, corrigido ou removido
> - Migrações de banco necessárias (se houver)
>
> **Fluxo de atualização de versão:**
> Quando um JS ou CSS muda → incrementar o número após `?v=` em todos os HTMLs
> que importam aquele arquivo. O número atual de referência está no topo de cada entrada.

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


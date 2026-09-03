-- database/schema.sql — FONTE DE VERDADE do schema do FinZen em produção.
--
-- Extraído diretamente do Supabase (project qgamphwnlrriwalcbhbl) em
-- 2026-08-06, via information_schema/pg_catalog — não das migrations do
-- repo (várias tabelas/colunas/índices foram criados direto no SQL Editor
-- ao longo do tempo e nunca viraram migration versionada).
--
-- Isto é DOCUMENTAÇÃO, não um script pronto pra recriar o banco do zero:
-- não inclui RLS policies completas (ver seção no fim) nem as funções RPC
-- (essas estão versionadas em migrations próprias, ex:
-- 2026_08_06_fase0_seguranca.sql). Pra aplicar mudanças de schema, sempre
-- criar uma migration nova em database/ — nunca editar este arquivo como
-- se fosse a fonte de escrita.
--
-- 29 tabelas no schema public (o CLAUDE.md documenta 21 — desatualizado;
-- as 8 a mais são ai_usage, investment_transactions, profiles,
-- recurring_transactions, stay_alerts, stay_favorites, telegram_links,
-- telegram_pending, travel_alerts, travel_favorites — conferir).

-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCEIRO
-- ═══════════════════════════════════════════════════════════════════════════

create table public.accounts (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  tipo text not null,
  saldo_inicial numeric(14,2) default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  bank text,
  color text default '#4f8ef7',
  currency text default 'BRL',
  active boolean default true,
  saldo_atual numeric default 0,
  sort_order integer default 0,
  account_kind text not null default 'bank',
  broker_name text,
  icon text
);
-- ativo/is_active removidos em 2026_09_03_limpeza_colunas_legado.sql (legado
-- morto, sem uso em código/RLS/RPC) — coluna canônica de status é `active`.

create table public.transactions (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  account_id uuid not null references accounts(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  type text not null,
  amount numeric(15,2) not null,
  description text not null,
  date date not null,
  status text default 'confirmado',
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  recurring_id uuid references recurring_transactions(id),
  is_recurring boolean not null default false,
  recurrence_frequency text,
  recurrence_until date,
  recurrence_group_id uuid,
  parent_transaction_id uuid references transactions(id) on delete set null,
  recurrence_active boolean not null default true
);
-- Índices: idx_transactions_user_date(user_id,date desc), idx_transactions_user_status(user_id,status),
-- idx_transactions_recorrencia(user_id,is_recurring,recurrence_frequency),
-- idx_transactions_recurrence_active(user_id,is_recurring,recurrence_active),
-- idx_transactions_recurrence_group(user_id,recurrence_group_id),
-- idx_transactions_parent_transaction(parent_transaction_id), idx_transactions_recurring_id(recurring_id)

create table public.credit_cards (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  banco text,
  limite numeric(12,2) default 0,
  fechamento_dia integer not null,
  vencimento_dia integer not null,
  bandeira text,
  cor text default '#7c5cfc',
  ativo boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  sort_order integer default 0
);
-- Índice: idx_credit_cards_user_ativo(user_id,ativo) — Fase 1
-- is_active removida em 2026_09_03_limpeza_colunas_legado.sql (legado morto)

create table public.card_transactions (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references credit_cards(id) on delete cascade,
  category_id uuid references categories(id),
  descricao text not null,
  valor_total numeric(12,2) not null,
  parcelas integer default 1,
  parcela_atual integer default 1,
  valor_parcela numeric(12,2) not null,
  data_compra date not null,
  fatura_referencia text not null,
  status text default 'aberta',
  created_at timestamp with time zone default now(),
  purchase_group_id uuid
);
-- Índices: idx_card_tx_user_fatura, idx_card_tx_card_status, idx_card_tx_purchase_group

create table public.categories (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  tipo text not null,
  cor text default '#0f766e',
  ativo boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  icon text,
  budget_amount numeric(15,2),
  parent_id uuid references categories(id) on delete set null,
  sort_order integer default 0
);
-- Índice: idx_categories_user_ativo(user_id,ativo) — Fase 1
-- is_active removida em 2026_09_03_limpeza_colunas_legado.sql (legado morto)

create table public.category_rules (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null,
  category_id uuid references categories(id) on delete cascade,
  tipo text default 'despesa',
  hits integer default 1,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (user_id, pattern)
);

create table public.budgets (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  mes_referencia text not null,
  valor_planejado numeric(12,2) not null default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
-- Índice: idx_budgets_user_mes(user_id,mes_referencia) — Fase 1 (filtro mais quente do dashboard)

create table public.goals (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  descricao text,
  valor_alvo numeric(12,2) not null default 0,
  valor_atual numeric(12,2) not null default 0,
  data_alvo date,
  categoria text default 'geral',
  cor text default '#22c55e',
  ativo boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
-- Índice: idx_goals_user_ativo(user_id,ativo) — Fase 1

create table public.account_transfers (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_account_id uuid not null references accounts(id),
  to_account_id uuid not null references accounts(id),
  amount numeric(14,2) not null check (amount > 0),
  date date not null default current_date,
  description text,
  created_at timestamp with time zone not null default now()
);
-- Escrita via RPC create_account_transfer/delete_account_transfer (SECURITY DEFINER).

create table public.exchange_transactions (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_account_id uuid not null references accounts(id),
  to_account_id uuid not null references accounts(id),
  from_currency text not null,
  to_currency text not null,
  source_amount numeric not null check (source_amount > 0),
  target_amount numeric not null check (target_amount > 0),
  exchange_rate numeric not null check (exchange_rate > 0),
  date date not null default current_date,
  description text,
  created_at timestamp with time zone not null default now()
);
-- Escrita via RPC create_currency_exchange (SECURITY DEFINER).

create table public.recurring_transactions (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references accounts(id),
  category_id uuid references categories(id),
  type text not null check (type in ('receita','despesa')),
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  day_of_month integer not null check (day_of_month between 1 and 31),
  status_default text not null default 'pendente',
  active boolean not null default true,
  notes text,
  created_at timestamp with time zone not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INVESTIMENTOS
-- ═══════════════════════════════════════════════════════════════════════════

create table public.investments (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  nome text,
  tipo text not null,
  quantidade numeric(18,6) not null default 0,
  preco_medio numeric(18,6) not null default 0,
  moeda text default 'BRL',
  corretora text,
  cotacao_atual numeric(18,6),
  atualizado_em timestamp with time zone,
  ativo boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  exchange_rate numeric(14,6),
  valor_atual_brl numeric(14,2),
  valor_aplicado_brl numeric(14,2),
  tese_entrada text,
  gatilho_saida text,
  convicao text,
  ind_pl numeric(10,2), ind_roe numeric(10,2), ind_dy numeric(10,2), ind_pvpa numeric(10,2),
  ind_pl_auto numeric(10,2), ind_roe_auto numeric(10,2), ind_dy_auto numeric(10,2), ind_pvpa_auto numeric(10,2),
  ind_auto_em timestamp with time zone,
  notas text
);
-- Índice: idx_investments_user_ativo(user_id,ativo) — Fase 1
-- Escrita de cotacao_atual/valor_atual_brl/exchange_rate/atualizado_em também
-- via RPC cotacao_patch_ativo (service_role, api/cotacao-cron.js).
-- notas_livres removida em 2026_09_03_limpeza_colunas_legado.sql (cópia morta de `notas`)

create table public.investment_transactions (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_id uuid not null references investments(id) on delete cascade,
  tipo text not null,
  quantidade numeric(18,6),
  preco numeric(18,6),
  valor_total numeric(18,2),
  data_movimento date not null,
  observacao text,
  created_at timestamp with time zone default now(),
  valor_liquido numeric(18,2),
  imposto_retido numeric(18,2),
  account_id uuid references accounts(id) on delete set null,
  exchange_rate numeric(14,6),
  tipo_movimento text,
  preco_unitario numeric(14,6),
  moeda text default 'BRL',
  ticker text
);
-- Índice existente: (user_id, account_id, data_movimento) — sem índice em investment_id (backfill/CAGR).
-- tipo_ativo removida em 2026_09_03_limpeza_colunas_legado.sql (cópia morta de `tipo`, nunca lida)
-- ATENÇÃO: `tipo` tem semânticas conflitantes entre fluxos (js/investments.js grava classe do
-- ativo; js/assetTransactions.js e a RPC recalculate_investment esperam 'compra'/'venda') —
-- não mexer nela sem revisar recalculate_investment primeiro.

create table public.dividends (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_id uuid references investments(id) on delete set null,
  ticker text not null,
  tipo text not null,
  valor_por_cota numeric(14,6),
  quantidade_cotas numeric(14,6),
  valor_total numeric(14,2) not null,
  account_id uuid references accounts(id) on delete set null,
  data_pagamento date not null default current_date,
  observacao text,
  created_at timestamp with time zone not null default now(),
  transaction_id uuid
);
-- Índice: idx_dividends_user_data(user_id,data_pagamento desc)

create table public.allocation_targets (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  classe text not null,
  percentual_alvo numeric(8,2) not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
-- Índice: idx_allocation_targets_user(user_id) — Fase 1

create table public.patrimony_history (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  reference_month date not null,
  accounts_total numeric(14,2) not null default 0,
  investments_total numeric(14,2) not null default 0,
  cards_total numeric(14,2) not null default 0,
  net_worth numeric(14,2) not null default 0,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (user_id, reference_month)
);
-- Índice: idx_patrimony_history_user_month

-- ═══════════════════════════════════════════════════════════════════════════
-- GESTÃO PESSOAL
-- ═══════════════════════════════════════════════════════════════════════════

create table public.calendar_events (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  tipo text not null,
  status text not null default 'pendente',
  data_inicio date not null,
  data_fim date,
  hora time without time zone,
  descricao text,
  local text,
  cor text default '#4b84f3',
  icone text,
  recorrente boolean default false,
  frequencia text,
  lembrete_dias integer default 1,
  notif_email boolean default false,
  email_destino text,
  ics_exportado boolean default false,
  criado_em timestamp with time zone default now(),
  atualizado_em timestamp with time zone default now(),
  google_event_id text
);
-- Índices: idx_calendar_events_user_data(user_id,data_inicio),
-- idx_calendar_events_google_id(google_event_id) where not null — Fase 1

create table public.offshore_cycles (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data_embarque date not null,
  data_desembarque date,
  plataforma text,
  empresa text,
  contrato text,
  regime text default '14x21',
  status text default 'planejado',
  observacoes text,
  criado_em timestamp with time zone default now()
);
-- Índice: idx_offshore_cycles_user(user_id,data_embarque desc)

create table public.offshore_overtime (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid references offshore_cycles(id) on delete cascade,
  data date not null,
  horas_extras numeric(5,2) default 0,
  sobreaviso boolean default false,
  valor_hora numeric(10,2),
  descricao text,
  criado_em timestamp with time zone default now()
);
-- Índice: idx_offshore_overtime_user_data(user_id,data desc) — Fase 1

create table public.certifications (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  numero text,
  entidade text,
  data_emissao date,
  data_vencimento date,
  alerta_dias integer default 90,
  notif_email boolean default true,
  observacoes text,
  arquivo_url text,
  criado_em timestamp with time zone default now()
);
-- Índice: idx_certifications_user_venc(user_id,data_vencimento)

-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGENS (VYNHunter/StayHunter — pages/viagens.html, pages/hospedagens.html)
-- ═══════════════════════════════════════════════════════════════════════════

create table public.travel_favorites (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  origin text not null,
  destination text not null,
  depart_date date not null,
  return_date date,
  price_total numeric(12,2) not null,
  score integer,
  cabin_class text default 'eco',
  pax integer default 1,
  created_at timestamp with time zone default now()
);

create table public.travel_alerts (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  origin text not null,
  destination text not null,
  max_price numeric(12,2),
  drop_pct integer,
  ref_price numeric(12,2),
  last_price numeric(12,2),
  fired boolean default false,
  checked_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

create table public.stay_favorites (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  city text not null,
  prop_key integer not null,
  prop_name text not null,
  prop_type text,
  checkin date not null,
  checkout date not null,
  guests integer default 2,
  rooms integer default 1,
  total_price numeric(12,2) not null,
  score integer,
  created_at timestamp with time zone default now()
);

create table public.stay_alerts (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  city text not null,
  prop_key integer not null,
  prop_name text not null,
  checkin date,
  checkout date,
  max_price numeric(12,2),
  drop_pct integer,
  ref_price numeric(12,2),
  last_price numeric(12,2),
  fired boolean default false,
  checked_at timestamp with time zone,
  created_at timestamp with time zone default now()
);
-- pages/hospedagens.html está ÓRFÃ (sem link de entrada no menu) — ver auditoria Fase 4/UX.

-- ═══════════════════════════════════════════════════════════════════════════
-- SISTEMA
-- ═══════════════════════════════════════════════════════════════════════════

create table public.user_settings (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  setting_key text not null,
  setting_value text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (user_id, setting_key)
);
-- Chaves conhecidas: usd_brl (cotação — financeService.js), perfil_*, onboarding_concluido,
-- nav_version, inv_peso_classe_*, termometro_selic, termometro_ipca.
-- Índice: idx_user_settings_user_key

create table public.ai_usage (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  endpoint text not null,
  created_at timestamp with time zone not null default now()
);
-- Índice: idx_ai_usage_user_created(user_id,created_at desc)
-- Contador de rate limit dos endpoints de IA (api/_aiRateLimit.js).

create table public.telegram_links (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  chat_id text not null unique,
  linked_at timestamp with time zone default now()
);
-- Só policy de SELECT — escrita exclusiva via service_role
-- (api/telegram-link.js, api/telegram-webhook.js).

create table public.telegram_pending (
  code text not null primary key,
  user_id uuid not null,
  expires_at timestamp with time zone not null
);
-- RLS ativo, ZERO policies — só service_role acessa (deny-by-default correto,
-- não é falha: nenhum client autenticado deveria ler códigos de vinculação alheios).

create table public.profiles (
  id uuid not null primary key,
  nome text,
  email text,
  created_at timestamp with time zone default now()
);
-- Órfã: nenhuma referência a esta tabela em js/ ou api/ (grep confirmado,
-- 2026-08-06). RLS ativo, zero policies. Provável resquício de template
-- inicial do Supabase Auth — candidata a DROP numa fase futura, após
-- confirmar com o Márcio que não há dado importante nela.

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTAS DE RLS
-- ═══════════════════════════════════════════════════════════════════════════
-- Todas as tabelas de usuário têm RLS habilitado e policies com
-- `auth.uid() = user_id` (SELECT/INSERT/UPDATE/DELETE, ou `FOR ALL` nas mais
-- novas: stay_*, travel_*, category_rules).
--
-- Achado da auditoria (2026-08-06), não corrigido nesta fase — baixo risco
-- (são policies permissivas idênticas, o Postgres só faz OR entre elas; não
-- é uma falha de segurança, é redundância de manutenção): accounts,
-- allocation_targets, budgets, card_transactions, categories, credit_cards,
-- goals, investment_transactions e investments têm cada uma DUAS policies
-- para o mesmo comando (SELECT/INSERT/UPDATE/DELETE duplicados), sinal de
-- que alguma migration antiga rodou sem `drop policy if exists` antes do
-- `create policy`. Revisar e consolidar numa fase de polimento.

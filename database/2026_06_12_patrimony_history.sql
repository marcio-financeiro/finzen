-- =====================================================
-- FINZEN 9.2
-- HISTÓRICO PATRIMONIAL
-- =====================================================

create table if not exists public.patrimony_history (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,

  reference_month date not null,

  accounts_total numeric(14,2) not null default 0,
  investments_total numeric(14,2) not null default 0,
  cards_total numeric(14,2) not null default 0,

  net_worth numeric(14,2) not null default 0,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint patrimony_history_user_month_unique
  unique (user_id, reference_month)
);

alter table public.patrimony_history enable row level security;

drop policy if exists users_patrimony_history_select
on public.patrimony_history;

create policy users_patrimony_history_select
on public.patrimony_history
for select
using (auth.uid() = user_id);

drop policy if exists users_patrimony_history_insert
on public.patrimony_history;

create policy users_patrimony_history_insert
on public.patrimony_history
for insert
with check (auth.uid() = user_id);

drop policy if exists users_patrimony_history_update
on public.patrimony_history;

create policy users_patrimony_history_update
on public.patrimony_history
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists users_patrimony_history_delete
on public.patrimony_history;

create policy users_patrimony_history_delete
on public.patrimony_history
for delete
using (auth.uid() = user_id);

create index if not exists idx_patrimony_history_user_month
on public.patrimony_history(user_id, reference_month desc);

select 'FINZEN 9.2 HISTORICO PATRIMONIAL INSTALADO' as status;

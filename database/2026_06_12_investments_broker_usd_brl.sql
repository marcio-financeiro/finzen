-- =====================================================
-- FINZEN 9.4.3
-- COMPRA/VENDA VINCULADA À CORRETORA + USD/BRL
-- =====================================================

alter table public.investment_transactions
add column if not exists account_id uuid references public.accounts(id) on delete set null;

alter table public.investment_transactions
add column if not exists exchange_rate numeric(14,6);

alter table public.investments
add column if not exists exchange_rate numeric(14,6);

alter table public.investments
add column if not exists valor_atual_brl numeric(14,2);

alter table public.investments
add column if not exists valor_aplicado_brl numeric(14,2);

create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  setting_key text not null,
  setting_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_user_key_unique unique(user_id, setting_key)
);

alter table public.user_settings enable row level security;

drop policy if exists users_settings_select on public.user_settings;
create policy users_settings_select
on public.user_settings
for select
using (auth.uid() = user_id);

drop policy if exists users_settings_insert on public.user_settings;
create policy users_settings_insert
on public.user_settings
for insert
with check (auth.uid() = user_id);

drop policy if exists users_settings_update on public.user_settings;
create policy users_settings_update
on public.user_settings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists users_settings_delete on public.user_settings;
create policy users_settings_delete
on public.user_settings
for delete
using (auth.uid() = user_id);

create index if not exists idx_investment_transactions_account
on public.investment_transactions(user_id, account_id, data_movimento desc);

create index if not exists idx_user_settings_user_key
on public.user_settings(user_id, setting_key);

select 'FINZEN 9.4.3 INVESTIMENTOS CORRETORA USD BRL INSTALADO' as status;

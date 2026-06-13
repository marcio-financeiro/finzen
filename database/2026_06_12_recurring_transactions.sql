-- FINZEN 8.4 - Contas fixas/recorrentes
create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  category_id uuid references public.categories(id),
  type text not null check (type in ('receita', 'despesa')),
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  day_of_month integer not null check (day_of_month between 1 and 31),
  status_default text not null default 'pendente',
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.recurring_transactions enable row level security;

drop policy if exists "users_recurring_transactions_select" on public.recurring_transactions;
create policy "users_recurring_transactions_select" on public.recurring_transactions for select using (auth.uid() = user_id);

drop policy if exists "users_recurring_transactions_insert" on public.recurring_transactions;
create policy "users_recurring_transactions_insert" on public.recurring_transactions for insert with check (auth.uid() = user_id);

drop policy if exists "users_recurring_transactions_update" on public.recurring_transactions;
create policy "users_recurring_transactions_update" on public.recurring_transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users_recurring_transactions_delete" on public.recurring_transactions;
create policy "users_recurring_transactions_delete" on public.recurring_transactions for delete using (auth.uid() = user_id);

alter table public.transactions add column if not exists recurring_id uuid references public.recurring_transactions(id);
create index if not exists idx_transactions_recurring_id on public.transactions(recurring_id);
create index if not exists idx_recurring_transactions_user on public.recurring_transactions(user_id);

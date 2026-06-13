-- =====================================================
-- FINZEN 9.0.2
-- RECORRÊNCIA SIMPLIFICADA DIRETO EM TRANSACTIONS
-- Execute uma vez no Supabase SQL Editor.
-- =====================================================

alter table public.transactions
add column if not exists is_recurring boolean not null default false;

alter table public.transactions
add column if not exists recurrence_frequency text;

alter table public.transactions
add column if not exists recurrence_until date;

alter table public.transactions
add column if not exists recurrence_group_id uuid;

alter table public.transactions
add column if not exists parent_transaction_id uuid;

alter table public.transactions
drop constraint if exists fk_transactions_parent_transaction;

alter table public.transactions
add constraint fk_transactions_parent_transaction
foreign key (parent_transaction_id)
references public.transactions(id)
on delete set null;

alter table public.transactions
drop constraint if exists chk_transactions_recurrence_frequency;

alter table public.transactions
add constraint chk_transactions_recurrence_frequency
check (
  recurrence_frequency is null
  or recurrence_frequency in ('semanal','mensal','anual')
);

create index if not exists idx_transactions_recurrence_group
on public.transactions(user_id, recurrence_group_id);

create index if not exists idx_transactions_recorrencia
on public.transactions(user_id, is_recurring, recurrence_frequency);

create index if not exists idx_transactions_parent_transaction
on public.transactions(parent_transaction_id);

select 'FINZEN 9.0.2 RECORRENCIA INSTALADA' as status;

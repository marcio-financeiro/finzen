-- FINZEN 9.1.1
alter table public.transactions
add column if not exists recurrence_active boolean not null default true;

create index if not exists idx_transactions_recurrence_active
on public.transactions(user_id, is_recurring, recurrence_active);

select 'FINZEN 9.1.1 RECORRENCIAS COMPLETAS INSTALADA' as status;

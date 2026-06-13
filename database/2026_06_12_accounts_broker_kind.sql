-- =====================================================
-- FINZEN 9.4.2
-- CORRETORAS COMO CONTAS DE INVESTIMENTO
-- =====================================================

alter table public.accounts
add column if not exists account_kind text not null default 'bank';

alter table public.accounts
add column if not exists broker_name text;

alter table public.accounts
drop constraint if exists accounts_account_kind_check;

alter table public.accounts
add constraint accounts_account_kind_check
check (account_kind in ('bank', 'broker'));

update public.accounts
set account_kind = 'broker',
    broker_name = coalesce(nullif(bank, ''), nome)
where lower(coalesce(tipo, '')) like '%corretora%'
   or lower(coalesce(tipo, '')) like '%investimento%'
   or lower(coalesce(bank, '')) in ('rico', 'nomad', 'xp', 'nuinvest', 'clear');

create index if not exists idx_accounts_user_kind
on public.accounts(user_id, account_kind, active);

select 'FINZEN 9.4.2 CORRETORAS COMO CONTAS INSTALADO' as status;

-- =====================================================
-- FINZEN 9.4.3.2
-- CORREÇÕES INVESTIMENTOS: NOMAD USD + EXCLUSÃO DE ATIVOS
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

-- Classifica corretoras conhecidas
update public.accounts
set account_kind = 'broker',
    broker_name = coalesce(nullif(bank, ''), nome)
where lower(coalesce(nome, '')) in ('rico', 'nomad', 'xp', 'nuinvest', 'clear')
   or lower(coalesce(bank, '')) in ('rico', 'nomad', 'xp', 'nuinvest', 'clear')
   or lower(coalesce(tipo, '')) like '%corretora%';

-- Nomad deve ser tratada como conta/corretora em dólar
update public.accounts
set currency = 'USD',
    account_kind = 'broker',
    broker_name = 'Nomad'
where lower(coalesce(nome, '')) = 'nomad'
   or lower(coalesce(bank, '')) = 'nomad';

-- Rico deve ser corretora em real
update public.accounts
set currency = 'BRL',
    account_kind = 'broker',
    broker_name = 'Rico'
where lower(coalesce(nome, '')) = 'rico'
   or lower(coalesce(bank, '')) = 'rico';

create index if not exists idx_accounts_user_kind
on public.accounts(user_id, account_kind, active);

select 'FINZEN 9.4.3.2 CORRECOES INVESTIMENTOS INSTALADAS' as status;

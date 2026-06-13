-- FinZen 9.4.4A - Conversão cambial entre contas da mesma corretora
-- Execute este script no Supabase antes de subir os arquivos JS/HTML desta versão.

create table if not exists exchange_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_account_id uuid not null references accounts(id) on delete restrict,
  to_account_id uuid not null references accounts(id) on delete restrict,
  from_currency text not null,
  to_currency text not null,
  source_amount numeric not null check (source_amount > 0),
  target_amount numeric not null check (target_amount > 0),
  exchange_rate numeric not null check (exchange_rate > 0),
  date date not null default current_date,
  description text,
  created_at timestamptz not null default now()
);

alter table exchange_transactions enable row level security;

drop policy if exists "exchange_transactions_select_own" on exchange_transactions;
create policy "exchange_transactions_select_own"
on exchange_transactions for select
using (auth.uid() = user_id);

drop policy if exists "exchange_transactions_insert_own" on exchange_transactions;
create policy "exchange_transactions_insert_own"
on exchange_transactions for insert
with check (auth.uid() = user_id);

create index if not exists idx_exchange_transactions_user_date
on exchange_transactions(user_id, date desc, created_at desc);

create index if not exists idx_exchange_transactions_from_account
on exchange_transactions(from_account_id);

create index if not exists idx_exchange_transactions_to_account
on exchange_transactions(to_account_id);

create or replace function create_currency_exchange(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_source_amount numeric,
  p_exchange_rate numeric,
  p_date date default current_date,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_from_account accounts%rowtype;
  v_to_account accounts%rowtype;
  v_target_amount numeric;
  v_exchange_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_from_account_id is null or p_to_account_id is null then
    raise exception 'Selecione a conta de origem e destino.';
  end if;

  if p_from_account_id = p_to_account_id then
    raise exception 'A conta de origem e destino não podem ser iguais.';
  end if;

  if coalesce(p_source_amount, 0) <= 0 then
    raise exception 'Informe um valor de origem maior que zero.';
  end if;

  if coalesce(p_exchange_rate, 0) <= 0 then
    raise exception 'Informe uma taxa de câmbio válida.';
  end if;

  select * into v_from_account
  from accounts
  where id = p_from_account_id
    and user_id = v_user_id
    and active = true
  for update;

  if not found then
    raise exception 'Conta de origem não encontrada ou inativa.';
  end if;

  select * into v_to_account
  from accounts
  where id = p_to_account_id
    and user_id = v_user_id
    and active = true
  for update;

  if not found then
    raise exception 'Conta de destino não encontrada ou inativa.';
  end if;

  if coalesce(v_from_account.account_kind, 'bank') <> 'broker'
     or coalesce(v_to_account.account_kind, 'bank') <> 'broker' then
    raise exception 'Conversão cambial deve ser feita entre contas de corretora.';
  end if;

  if coalesce(v_from_account.currency, 'BRL') = coalesce(v_to_account.currency, 'BRL') then
    raise exception 'A conversão exige contas com moedas diferentes.';
  end if;

  if not (
    (coalesce(v_from_account.currency, 'BRL') = 'BRL' and coalesce(v_to_account.currency, 'BRL') = 'USD')
    or
    (coalesce(v_from_account.currency, 'BRL') = 'USD' and coalesce(v_to_account.currency, 'BRL') = 'BRL')
  ) then
    raise exception 'Nesta versão, a conversão suporta apenas BRL e USD.';
  end if;

  if coalesce(v_from_account.saldo_atual, 0) < p_source_amount then
    raise exception 'Saldo insuficiente na conta de origem.';
  end if;

  if coalesce(v_from_account.currency, 'BRL') = 'BRL' and coalesce(v_to_account.currency, 'BRL') = 'USD' then
    v_target_amount := p_source_amount / p_exchange_rate;
  else
    v_target_amount := p_source_amount * p_exchange_rate;
  end if;

  update accounts
  set saldo_atual = coalesce(saldo_atual, 0) - p_source_amount
  where id = p_from_account_id
    and user_id = v_user_id;

  update accounts
  set saldo_atual = coalesce(saldo_atual, 0) + v_target_amount
  where id = p_to_account_id
    and user_id = v_user_id;

  insert into exchange_transactions (
    user_id,
    from_account_id,
    to_account_id,
    from_currency,
    to_currency,
    source_amount,
    target_amount,
    exchange_rate,
    date,
    description
  ) values (
    v_user_id,
    p_from_account_id,
    p_to_account_id,
    coalesce(v_from_account.currency, 'BRL'),
    coalesce(v_to_account.currency, 'BRL'),
    p_source_amount,
    v_target_amount,
    p_exchange_rate,
    coalesce(p_date, current_date),
    p_description
  ) returning id into v_exchange_id;

  return v_exchange_id;
end;
$$;

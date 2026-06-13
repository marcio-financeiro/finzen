-- FINZEN 8.1.1
-- Transferências entre contas com atualização automática de saldos

create table if not exists public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_account_id uuid not null references public.accounts(id),
  to_account_id uuid not null references public.accounts(id),
  amount numeric(14,2) not null check (amount > 0),
  date date not null default current_date,
  description text,
  created_at timestamptz not null default now()
);

alter table public.account_transfers enable row level security;

drop policy if exists "users_account_transfers_select" on public.account_transfers;
create policy "users_account_transfers_select"
on public.account_transfers
for select
using (auth.uid() = user_id);

drop policy if exists "users_account_transfers_delete" on public.account_transfers;
create policy "users_account_transfers_delete"
on public.account_transfers
for delete
using (auth.uid() = user_id);

create or replace function public.create_account_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_date date,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_from public.accounts%rowtype;
  v_to public.accounts%rowtype;
  v_transfer_id uuid;
begin
  v_user := auth.uid();

  if v_user is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_from_account_id = p_to_account_id then
    raise exception 'A conta de origem e destino não podem ser iguais.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor da transferência deve ser maior que zero.';
  end if;

  select *
  into v_from
  from public.accounts
  where id = p_from_account_id
    and user_id = v_user
  for update;

  if not found then
    raise exception 'Conta de origem não encontrada.';
  end if;

  select *
  into v_to
  from public.accounts
  where id = p_to_account_id
    and user_id = v_user
  for update;

  if not found then
    raise exception 'Conta de destino não encontrada.';
  end if;

  if coalesce(v_from.currency, 'BRL') <> coalesce(v_to.currency, 'BRL') then
    raise exception 'Transferência entre moedas diferentes ainda não está habilitada.';
  end if;

  update public.accounts
  set saldo_atual = coalesce(saldo_atual, 0) - p_amount
  where id = p_from_account_id
    and user_id = v_user;

  update public.accounts
  set saldo_atual = coalesce(saldo_atual, 0) + p_amount
  where id = p_to_account_id
    and user_id = v_user;

  insert into public.account_transfers (
    user_id,
    from_account_id,
    to_account_id,
    amount,
    date,
    description
  )
  values (
    v_user,
    p_from_account_id,
    p_to_account_id,
    p_amount,
    coalesce(p_date, current_date),
    p_description
  )
  returning id into v_transfer_id;

  return v_transfer_id;
end;
$$;

grant execute on function public.create_account_transfer(uuid, uuid, numeric, date, text) to authenticated;

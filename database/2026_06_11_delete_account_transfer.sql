-- FINZEN 8.1.2.1
-- Função segura para excluir transferência e reverter saldos

create or replace function public.delete_account_transfer(
  p_transfer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_transfer public.account_transfers%rowtype;
begin
  v_user := auth.uid();

  if v_user is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select *
  into v_transfer
  from public.account_transfers
  where id = p_transfer_id
    and user_id = v_user
  for update;

  if not found then
    raise exception 'Transferência não encontrada.';
  end if;

  update public.accounts
  set saldo_atual = coalesce(saldo_atual, 0) + v_transfer.amount
  where id = v_transfer.from_account_id
    and user_id = v_user;

  update public.accounts
  set saldo_atual = coalesce(saldo_atual, 0) - v_transfer.amount
  where id = v_transfer.to_account_id
    and user_id = v_user;

  delete from public.account_transfers
  where id = p_transfer_id
    and user_id = v_user;
end;
$$;

grant execute on function public.delete_account_transfer(uuid) to authenticated;

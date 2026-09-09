-- RPC para desfazer "dar baixa": volta o lançamento pra pendente e reverte o
-- ajuste de saldo aplicado por fz_marcar_pago. Mesmo padrão (atômico,
-- security definer) — nunca fica pendente com saldo ainda ajustado nem
-- vice-versa.

create or replace function public.fz_desfazer_baixa(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_tx    record;
  v_delta numeric;
begin
  if v_user is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select * into v_tx from transactions
   where id = p_transaction_id and user_id = v_user
   for update;

  if not found then
    raise exception 'Lançamento não encontrado.';
  end if;
  if v_tx.status <> 'pago' then
    raise exception 'Lançamento não está pago.';
  end if;

  update transactions set status = 'pendente' where id = p_transaction_id;

  if v_tx.account_id is not null then
    v_delta := case when v_tx.type = 'receita' then -v_tx.amount else v_tx.amount end;
    update accounts
       set saldo_atual = coalesce(saldo_atual,0) + v_delta
     where id = v_tx.account_id and user_id = v_user;
  end if;
end;
$$;

revoke all on function public.fz_desfazer_baixa(uuid) from public, anon;
grant execute on function public.fz_desfazer_baixa(uuid) to authenticated;

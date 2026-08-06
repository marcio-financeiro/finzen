-- FASE 2 — Lançamento atômico (auditoria FinZen, 2026-08-06)
--
-- Hoje, lançar uma transação já paga faz 2 chamadas separadas ao banco
-- (INSERT em transactions, depois RPC increment_account_balance) — se a
-- segunda falhar (rede caiu, aba fechou), a transação fica registrada mas o
-- saldo não é ajustado. Idem para "dar baixa" num lançamento pendente
-- (UPDATE status + ajuste de saldo em 2 passos).
--
-- As duas RPCs abaixo fazem tudo na mesma transação do banco — ou os dois
-- passos acontecem, ou nenhum.

create or replace function public.fz_lancar_transacao(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_id      uuid;
  v_status  text := coalesce(p->>'status', 'pendente');
  v_type    text := p->>'type';
  v_amount  numeric := (p->>'amount')::numeric;
  v_account uuid := (p->>'account_id')::uuid;
  v_delta   numeric;
  v_novo    numeric;
begin
  if v_user is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if v_type not in ('receita','despesa') then
    raise exception 'Tipo inválido.';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Valor deve ser maior que zero.';
  end if;
  if v_account is null then
    raise exception 'Conta obrigatória.';
  end if;

  insert into transactions (
    user_id, account_id, category_id, type, amount, description, date, status, notes,
    is_recurring, recurrence_frequency, recurrence_until, recurrence_group_id, parent_transaction_id
  ) values (
    v_user,
    v_account,
    nullif(p->>'category_id','')::uuid,
    v_type,
    v_amount,
    p->>'description',
    coalesce(nullif(p->>'date','')::date, current_date),
    v_status,
    p->>'notes',
    coalesce((p->>'is_recurring')::boolean, false),
    nullif(p->>'recurrence_frequency',''),
    nullif(p->>'recurrence_until','')::date,
    nullif(p->>'recurrence_group_id','')::uuid,
    nullif(p->>'parent_transaction_id','')::uuid
  )
  returning id into v_id;

  if v_status = 'pago' then
    v_delta := case when v_type = 'receita' then v_amount else -v_amount end;
    update accounts
       set saldo_atual = coalesce(saldo_atual,0) + v_delta
     where id = v_account and user_id = v_user
    returning saldo_atual into v_novo;

    if v_novo is null then
      raise exception 'Conta não encontrada ou sem permissão.';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.fz_lancar_transacao(jsonb) from public, anon;
grant execute on function public.fz_lancar_transacao(jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fz_marcar_pago(p_transaction_id uuid)
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
  if v_tx.status = 'pago' then
    raise exception 'Lançamento já está pago.';
  end if;

  update transactions set status = 'pago' where id = p_transaction_id;

  if v_tx.account_id is not null then
    v_delta := case when v_tx.type = 'receita' then v_tx.amount else -v_tx.amount end;
    update accounts
       set saldo_atual = coalesce(saldo_atual,0) + v_delta
     where id = v_tx.account_id and user_id = v_user;
  end if;
end;
$$;

revoke all on function public.fz_marcar_pago(uuid) from public, anon;
grant execute on function public.fz_marcar_pago(uuid) to authenticated;

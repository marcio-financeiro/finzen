-- ─────────────────────────────────────────────────────────────────────────────
-- Saldo atômico — elimina a race condition do padrão "SELECT saldo → soma em
-- JS → UPDATE" usado no client. Duas abas abertas podiam perder escrita e
-- corromper o saldo. O client agora chama esta RPC com o DELTA; o UPDATE
-- acontece numa única instrução, com lock de linha implícito.
--
-- O client tem fallback: se esta função ainda não existir, usa o caminho
-- antigo. Aplicar esta migration ativa o caminho atômico automaticamente.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.increment_account_balance(
  p_account_id uuid,
  p_delta      numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_novo numeric;
begin
  update accounts
     set saldo_atual = coalesce(saldo_atual, 0) + p_delta
   where id = p_account_id
     and user_id = auth.uid()
  returning saldo_atual into v_novo;

  if v_novo is null then
    raise exception 'Conta não encontrada ou sem permissão';
  end if;

  return v_novo;
end;
$$;

revoke all on function public.increment_account_balance(uuid, numeric) from public;
grant execute on function public.increment_account_balance(uuid, numeric) to authenticated;

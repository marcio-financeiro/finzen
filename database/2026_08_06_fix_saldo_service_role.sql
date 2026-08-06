-- Correção de regressão introduzida na Fase 0: increment_account_balance
-- depende de auth.uid(), que é NULL quando chamado com a service key (sem
-- JWT de usuário) — quebrava silenciosamente o ajuste de saldo feito por
-- api/telegram-webhook.js (execLancar), que roda com service_role.

create or replace function public.fz_increment_saldo_service(p_account_id uuid, p_user_id uuid, p_delta numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_novo numeric;
begin
  update accounts
     set saldo_atual = coalesce(saldo_atual,0) + p_delta
   where id = p_account_id and user_id = p_user_id
  returning saldo_atual into v_novo;

  if v_novo is null then
    raise exception 'Conta não encontrada.';
  end if;
  return v_novo;
end;
$$;

revoke all on function public.fz_increment_saldo_service(uuid,uuid,numeric) from public, anon, authenticated;
grant execute on function public.fz_increment_saldo_service(uuid,uuid,numeric) to service_role;

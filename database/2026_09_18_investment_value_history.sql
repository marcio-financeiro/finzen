-- ─────────────────────────────────────────────────────────────────────────────
-- investment_value_history — snapshot diário do valor total da carteira de
-- investimentos (soma de investments.valor_atual_brl de todos os ativos
-- ativos, RF incluída). Alimentado por api/cotacao-cron.js (seg-sex, 19h
-- BRT) logo depois de atualizar as cotações do dia. Usado pelo resumo
-- semanal por e-mail (api/summary-cron.js) pra calcular a variação de
-- mercado da carteira na semana, descontando aportes/resgates feitos no
-- período (ver resumoSemanal em api/_financeSummary.js).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.investment_value_history (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  date            date not null,
  valor_total_brl numeric(14,2) not null default 0,
  created_at      timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists idx_investment_value_history_user_date
  on public.investment_value_history (user_id, date desc);

alter table public.investment_value_history enable row level security;

-- Escrita só pelo cron (service role, que ignora RLS); o usuário pode ver
-- o próprio histórico.
create policy "investment_value_history_select_own" on public.investment_value_history
  for select using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- cotacao_get_ativos() passa a devolver também user_id e valor_atual_brl —
-- o cron precisa agrupar por usuário (tabela é multi-tenant como o resto do
-- schema) e somar o valor de ativos sem cotação encontrada no dia (fallback)
-- e o valor de ativos de renda fixa (não passam pelo loop de cotação, mas
-- entram no total da carteira). Muda o tipo de retorno, então precisa
-- recriar do zero (DROP + CREATE) e reaplicar o GRANT/REVOKE já usado em
-- 2026_08_06_fase0_seguranca.sql.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.cotacao_get_ativos();

CREATE FUNCTION public.cotacao_get_ativos()
RETURNS TABLE(id uuid, user_id uuid, ticker text, tipo text, moeda text, quantidade numeric, cotacao_atual numeric, corretora text, exchange_rate numeric, valor_atual_brl numeric)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT id, user_id, ticker, tipo, moeda, quantidade, cotacao_atual, corretora, exchange_rate, valor_atual_brl
  FROM investments
  WHERE ativo = true;
$$;

REVOKE ALL ON FUNCTION public.cotacao_get_ativos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cotacao_get_ativos() TO service_role;

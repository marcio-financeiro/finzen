-- FASE 0 — Segurança (auditoria FinZen, 2026-08-06)
--
-- IMPORTANTE — ORDEM DE DEPLOY: só rode este script DEPOIS que o código dos
-- crons/scripts já estiver publicado usando SUPABASE_SERVICE_KEY (não a anon
-- key). Rodando antes, api/telegram-cron.js, api/cotacao-cron.js e os
-- scripts/ do GitHub Actions param de funcionar até o próximo deploy.
--
-- O que faz:
-- 1. Recria as 5 RPCs SECURITY DEFINER usadas pelos crons (3 já existiam no
--    repo, 2 só existiam no banco) e restringe EXECUTE a service_role — hoje
--    qualquer pessoa com a anon key pública consegue chamá-las e ler (ou, no
--    caso de cotacao_patch_ativo, ESCREVER em) dados de TODOS os usuários.
-- 2. Adiciona as policies de RLS que faltavam em account_transfers,
--    exchange_transactions e ai_usage.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1a. aviso_* — usadas por scripts/aviso-vencimento.js (GitHub Actions)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION aviso_get_despesas(p_data text)
RETURNS TABLE(description text, amount numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT description, amount FROM transactions
  WHERE status = 'pendente' AND type = 'despesa' AND date::text = p_data;
$$;

CREATE OR REPLACE FUNCTION aviso_get_cartoes_hoje(p_dia int)
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, nome FROM credit_cards
  WHERE vencimento_dia = p_dia AND ativo = true;
$$;

CREATE OR REPLACE FUNCTION aviso_get_faturas_cartao(p_ids uuid[], p_ref text)
RETURNS TABLE(card_id uuid, valor_parcela numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT card_id, valor_parcela FROM card_transactions
  WHERE card_id = ANY(p_ids) AND fatura_referencia = p_ref
    AND status IN ('aberta', 'pendente');
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1b. cotacao_* — usadas por api/cotacao-cron.js. Não estavam versionadas no
-- repo (existiam só no banco); recriadas aqui com a definição REAL já em
-- produção como fonte de verdade (confirmada via pg_get_functiondef antes de
-- aplicar — a suposição inicial, com user_id, estava errada).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cotacao_get_ativos()
RETURNS TABLE(id uuid, ticker text, tipo text, moeda text, quantidade numeric, cotacao_atual numeric, corretora text, exchange_rate numeric)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT id, ticker, tipo, moeda, quantidade, cotacao_atual, corretora, exchange_rate
  FROM investments
  WHERE ativo = true;
$$;

CREATE OR REPLACE FUNCTION public.cotacao_patch_ativo(p_id uuid, p_cotacao numeric, p_valor_brl numeric, p_exchange_rate numeric, p_atualizado_em timestamp with time zone)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  UPDATE investments SET
    cotacao_atual   = p_cotacao,
    valor_atual_brl = p_valor_brl,
    exchange_rate   = CASE WHEN p_exchange_rate > 0 THEN p_exchange_rate ELSE exchange_rate END,
    atualizado_em   = p_atualizado_em
  WHERE id = p_id;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1c. Restringir as 5 RPCs a service_role — a anon key pública (e qualquer
-- usuário autenticado) deixa de conseguir chamá-las.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION aviso_get_despesas(text)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION aviso_get_cartoes_hoje(int)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION aviso_get_faturas_cartao(uuid[], text)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cotacao_get_ativos()                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cotacao_patch_ativo(uuid,numeric,numeric,numeric,timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION aviso_get_despesas(text)                  TO service_role;
GRANT EXECUTE ON FUNCTION aviso_get_cartoes_hoje(int)                TO service_role;
GRANT EXECUTE ON FUNCTION aviso_get_faturas_cartao(uuid[], text)     TO service_role;
GRANT EXECUTE ON FUNCTION cotacao_get_ativos()                       TO service_role;
GRANT EXECUTE ON FUNCTION cotacao_patch_ativo(uuid,numeric,numeric,numeric,timestamptz) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Policies de RLS faltantes (defense-in-depth — os fluxos atuais passam
-- por RPCs SECURITY DEFINER ou pelo service role, mas nenhuma tabela de
-- usuário deve ficar sem as 4 policies básicas).
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "users_account_transfers_insert" on public.account_transfers;
create policy "users_account_transfers_insert"
on public.account_transfers for insert
with check (auth.uid() = user_id);

drop policy if exists "users_account_transfers_update" on public.account_transfers;
create policy "users_account_transfers_update"
on public.account_transfers for update
using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "exchange_transactions_update_own" on exchange_transactions;
create policy "exchange_transactions_update_own"
on exchange_transactions for update
using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "exchange_transactions_delete_own" on exchange_transactions;
create policy "exchange_transactions_delete_own"
on exchange_transactions for delete
using (auth.uid() = user_id);

drop policy if exists "ai_usage_insert_own" on public.ai_usage;
create policy "ai_usage_insert_own"
on public.ai_usage for insert
with check (auth.uid() = user_id);

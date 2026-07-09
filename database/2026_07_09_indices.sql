-- ─────────────────────────────────────────────────────────────────────────────
-- Índices para as consultas mais frequentes do app.
-- Nenhuma migration anterior criava índices além das PKs — toda listagem
-- de movimentações/faturas fazia scan filtrando por user_id.
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists idx_transactions_user_date
  on public.transactions (user_id, date desc);

create index if not exists idx_transactions_user_status
  on public.transactions (user_id, status);

create index if not exists idx_transactions_recurrence_group
  on public.transactions (recurrence_group_id)
  where recurrence_group_id is not null;

create index if not exists idx_card_tx_user_fatura
  on public.card_transactions (user_id, fatura_referencia);

create index if not exists idx_card_tx_card_status
  on public.card_transactions (card_id, status);

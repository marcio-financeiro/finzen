-- FASE 1 — Índices faltantes (auditoria FinZen, 2026-08-06)
-- Todas com IF NOT EXISTS — seguro rodar mesmo se algum já existir.
-- Confirmado via pg_indexes antes de escrever: transactions, dividends,
-- calendar_events, offshore_cycles, category_rules e certifications já
-- tinham índice em user_id; as tabelas abaixo não tinham nenhum (só a PK).

create index if not exists idx_categories_user_ativo
  on public.categories (user_id, ativo);

create index if not exists idx_credit_cards_user_ativo
  on public.credit_cards (user_id, ativo);

create index if not exists idx_goals_user_ativo
  on public.goals (user_id, ativo);

create index if not exists idx_budgets_user_mes
  on public.budgets (user_id, mes_referencia);

create index if not exists idx_allocation_targets_user
  on public.allocation_targets (user_id);

create index if not exists idx_offshore_overtime_user_data
  on public.offshore_overtime (user_id, data desc);

create index if not exists idx_investments_user_ativo
  on public.investments (user_id, ativo);

-- google_event_id é a chave de sincronização com o Google Calendar
-- (api/calendar-sync.js) — sem índice, cada sync fazia seq scan.
create index if not exists idx_calendar_events_google_id
  on public.calendar_events (google_event_id)
  where google_event_id is not null;

-- FINZEN 8.0.2
-- Ordem manual para contas, cartões e categorias

alter table public.accounts
add column if not exists sort_order integer default 0;

alter table public.credit_cards
add column if not exists sort_order integer default 0;

alter table public.categories
add column if not exists sort_order integer default 0;

-- Preenche posições iniciais para registros antigos
with ranked as (
  select id, row_number() over(partition by user_id order by created_at asc) as rn
  from public.accounts
)
update public.accounts a
set sort_order = ranked.rn
from ranked
where a.id = ranked.id
  and coalesce(a.sort_order, 0) = 0;

with ranked as (
  select id, row_number() over(partition by user_id order by created_at asc) as rn
  from public.credit_cards
)
update public.credit_cards c
set sort_order = ranked.rn
from ranked
where c.id = ranked.id
  and coalesce(c.sort_order, 0) = 0;

with ranked as (
  select id, row_number() over(partition by user_id order by tipo asc, nome asc) as rn
  from public.categories
)
update public.categories c
set sort_order = ranked.rn
from ranked
where c.id = ranked.id
  and coalesce(c.sort_order, 0) = 0;

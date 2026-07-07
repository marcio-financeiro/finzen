-- Backfill: associa categoria "Fatura de Cartão" às faturas já pagas sem categoria

-- 1. Cria a categoria por usuário que precisar (se ainda não existir)
insert into categories (user_id, nome, tipo, icon, ativo)
select distinct t.user_id, 'Fatura de Cartão', 'despesa', '💳', true
from transactions t
where t.category_id is null
  and t.notes = 'Pagamento de fatura de cartão de crédito'
  and not exists (
    select 1 from categories c
    where c.user_id = t.user_id
      and c.tipo = 'despesa'
      and lower(trim(c.nome)) = 'fatura de cartão'
  );

-- 2. Associa as transações antigas à categoria
update transactions t
set category_id = c.id
from categories c
where t.category_id is null
  and t.notes = 'Pagamento de fatura de cartão de crédito'
  and c.user_id = t.user_id
  and c.tipo = 'despesa'
  and lower(trim(c.nome)) = 'fatura de cartão';

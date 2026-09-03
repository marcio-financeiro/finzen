-- Remove colunas duplicadas/legado sem uso em código, RLS policy ou RPC
-- (confirmado via grep no repo + consulta direta a pg_policies/pg_proc no
-- banco em produção antes de aplicar).

alter table public.accounts drop column is_active;
alter table public.accounts drop column ativo;
alter table public.credit_cards drop column is_active;
alter table public.categories drop column is_active;
alter table public.investments drop column notas_livres;
alter table public.investment_transactions drop column tipo_ativo;

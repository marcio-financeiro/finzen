-- FINZEN: corrigir investment_transactions (coluna ticker ausente)
-- + backfill das posições já cadastradas, para o CAGR ter histórico pra calcular.
--
-- Causa raiz: salvarAtivo() em js/investments.js sempre falhava ao inserir em
-- investment_transactions (faltava investment_id/tipo obrigatórios, e tentava
-- gravar uma coluna "ticker" que não existia). O erro era silencioso, então o
-- ativo era criado normalmente mas a movimentação nunca era registrada.

alter table public.investment_transactions
  add column if not exists ticker text;

-- Backfill: 1 movimentação de "compra" por ativo já cadastrado (aproxima a
-- data pela created_at do ativo, já que o histórico real não foi registrado).
insert into public.investment_transactions
  (user_id, investment_id, ticker, tipo, tipo_ativo, tipo_movimento,
   quantidade, preco_unitario, preco, valor_total, moeda, data_movimento,
   observacao, created_at)
select
  i.user_id, i.id, i.ticker, i.tipo, i.tipo, 'compra',
  i.quantidade, i.preco_medio, i.preco_medio,
  i.quantidade * i.preco_medio, coalesce(i.moeda, 'BRL'), i.created_at::date,
  'Backfill automático (posição cadastrada antes da correção do CAGR)', i.created_at
from public.investments i
where not exists (
  select 1 from public.investment_transactions t where t.investment_id = i.id
);

select 'FINZEN: investment_transactions corrigida (' || count(*) || ' movimentações no total)' as status
from public.investment_transactions;

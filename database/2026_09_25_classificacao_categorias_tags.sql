-- 2026_09_25_classificacao_categorias_tags.sql
-- Campos de classificação usados pela exportação de dados para análise com
-- IA (FinZen Flash — "Exportar para análise com IA"): sem eles, fixo/
-- variável, essencial/não-essencial e tags saem sempre null no export,
-- porque a informação não existe hoje no banco. Aditivo, não quebra nada
-- existente — todas as colunas são opcionais (null = "usuário ainda não
-- classificou", nunca inventar um valor default).

alter table categories
  add column if not exists fixo_variavel text check (fixo_variavel in ('fixo', 'variavel')),
  add column if not exists essencial boolean;

alter table transactions
  add column if not exists tags text[];

comment on column categories.fixo_variavel is 'Classificação manual: gasto fixo (aluguel, assinatura) ou variável (mercado, lazer). Null = não classificado.';
comment on column categories.essencial is 'Classificação manual: despesa essencial (moradia, saúde) vs não-essencial (lazer, supérfluo). Null = não classificado.';
comment on column transactions.tags is 'Tags livres definidas pelo usuário no lançamento, usadas para agrupar/filtrar na exportação para IA. Null/vazio = sem tags.';

-- ─────────────────────────────────────────────────────────────────────────────
-- purchase_group_id — identificador de grupo para parcelas da mesma compra.
--
-- Antes as parcelas irmãs eram identificadas por (card_id, parcelas,
-- valor_total): duas compras de mesmo valor/parcelamento no mesmo cartão
-- eram tratadas como UMA compra ao editar/excluir "esta e as seguintes".
--
-- O client tem fallback: insere com purchase_group_id se a coluna existir,
-- e usa o critério antigo para linhas legadas sem group id.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.card_transactions
  add column if not exists purchase_group_id uuid;

-- Backfill: agrupa parcelas existentes pela assinatura da compra.
-- (data_compra + descricao entram na chave para separar compras iguais
-- feitas em dias/descrições diferentes.)
with grupos as (
  select user_id, card_id, parcelas, valor_total, data_compra, descricao,
         gen_random_uuid() as gid
    from public.card_transactions
   where purchase_group_id is null
   group by user_id, card_id, parcelas, valor_total, data_compra, descricao
)
update public.card_transactions ct
   set purchase_group_id = g.gid
  from grupos g
 where ct.purchase_group_id is null
   and ct.user_id     = g.user_id
   and ct.card_id     = g.card_id
   and ct.parcelas    = g.parcelas
   and ct.valor_total = g.valor_total
   and coalesce(ct.data_compra::text,'') = coalesce(g.data_compra::text,'')
   and coalesce(ct.descricao,'')          = coalesce(g.descricao,'');

create index if not exists idx_card_tx_purchase_group
  on public.card_transactions (purchase_group_id);

-- Funções RPC SECURITY DEFINER para aviso-vencimento.js
-- Permitem consulta sem service key (usa anon key + bypass RLS via SECURITY DEFINER)

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

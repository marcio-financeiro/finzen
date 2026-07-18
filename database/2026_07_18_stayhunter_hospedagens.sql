-- =====================================================================
-- FinZen — Módulo Hospedagens (StayHunter)
-- Migration: 2026_07_18_stayhunter_hospedagens.sql
-- Tabelas de favoritos e alertas de hospedagem, com RLS padrão.
-- =====================================================================

-- Hospedagens salvas (favoritos)
CREATE TABLE IF NOT EXISTS stay_favorites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  city         text NOT NULL,            -- chave da cidade (ex.: RIO)
  prop_key     int  NOT NULL,            -- índice determinístico da propriedade
  prop_name    text NOT NULL,
  prop_type    text,                     -- hotel | pousada | resort | hostel | apto | casa | chale
  checkin      date NOT NULL,
  checkout     date NOT NULL,
  guests       int  DEFAULT 2,
  rooms        int  DEFAULT 1,
  total_price  numeric(12,2) NOT NULL,   -- valor total no momento do save
  score        int,                      -- índice de valor real 0-100
  created_at   timestamptz DEFAULT now()
);

-- Alertas de preço de hospedagem
CREATE TABLE IF NOT EXISTS stay_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  city         text NOT NULL,
  prop_key     int  NOT NULL,
  prop_name    text NOT NULL,
  checkin      date,
  checkout     date,
  max_price    numeric(12,2),            -- avisar abaixo deste total
  drop_pct     int,                      -- ou queda de X% sobre ref_price
  ref_price    numeric(12,2),
  last_price   numeric(12,2),
  fired        boolean DEFAULT false,
  checked_at   timestamptz,
  created_at   timestamptz DEFAULT now()
);

-- RLS — política padrão FinZen: auth.uid() = user_id
ALTER TABLE stay_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE stay_alerts    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stay_favorites_all" ON stay_favorites
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "stay_alerts_all" ON stay_alerts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_stay_fav_user ON stay_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_stay_al_user  ON stay_alerts(user_id);

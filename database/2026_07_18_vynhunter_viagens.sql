-- =====================================================================
-- FinZen — Módulo Viagens (VYNHunter)
-- Migration: 2026_07_18_vynhunter_viagens.sql
-- Cria tabelas de favoritos e alertas de passagens, com RLS padrão.
-- =====================================================================

-- Pesquisas salvas (favoritos)
CREATE TABLE IF NOT EXISTS travel_favorites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  origin       text NOT NULL,           -- código IATA (ex.: GIG)
  destination  text NOT NULL,
  depart_date  date NOT NULL,
  return_date  date,
  price_total  numeric(12,2) NOT NULL,  -- preço no momento do save
  score        int,                     -- score 0-100 da oferta
  cabin_class  text DEFAULT 'eco',      -- eco | pre | exe
  pax          int  DEFAULT 1,
  created_at   timestamptz DEFAULT now()
);

-- Alertas de preço
CREATE TABLE IF NOT EXISTS travel_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  origin       text NOT NULL,
  destination  text NOT NULL,
  max_price    numeric(12,2),           -- avisar abaixo deste valor
  drop_pct     int,                     -- ou queda de X% sobre ref_price
  ref_price    numeric(12,2),           -- preço de referência na criação
  last_price   numeric(12,2),           -- último preço verificado
  fired        boolean DEFAULT false,
  checked_at   timestamptz,
  created_at   timestamptz DEFAULT now()
);

-- RLS — política padrão FinZen: auth.uid() = user_id
ALTER TABLE travel_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_alerts    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "travel_favorites_all" ON travel_favorites
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "travel_alerts_all" ON travel_alerts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_travel_fav_user ON travel_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_travel_al_user  ON travel_alerts(user_id);

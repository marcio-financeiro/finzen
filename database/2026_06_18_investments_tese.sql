-- Migration: adiciona colunas do Diário de Tese na tabela investments
-- Data: 2026-06-18

ALTER TABLE investments
  ADD COLUMN IF NOT EXISTS tese_entrada  TEXT,
  ADD COLUMN IF NOT EXISTS gatilho_saida TEXT,
  ADD COLUMN IF NOT EXISTS convicao      TEXT CHECK (convicao IN ('alta','media','baixa')),
  ADD COLUMN IF NOT EXISTS notas         TEXT;

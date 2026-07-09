-- ─────────────────────────────────────────────────────────────────────────────
-- ai_usage — contador de uso dos endpoints de IA (rate limiting).
-- Protege o custo da API Anthropic: cada chamada a /api/assistant ou
-- /api/analyze registra uma linha; o servidor bloqueia acima do limite
-- diário (env AI_LIMITE_DIARIO, padrão 50).
-- O servidor tem fallback: se esta tabela não existir, não limita.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.ai_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  endpoint   text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_user_created
  on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

-- Escrita/leitura só pelo service role (endpoints serverless);
-- o usuário pode ver o próprio consumo.
create policy "ai_usage_select_own" on public.ai_usage
  for select using (auth.uid() = user_id);

-- Adiciona coluna para rastrear o ID do evento correspondente no Google Calendar
-- Necessário para update/delete sem duplicar eventos a cada edição
alter table calendar_events
  add column if not exists google_event_id text;

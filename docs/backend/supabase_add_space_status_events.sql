-- YASA Space Status / Information Service v1
-- Adds a backward-compatible JSON event buffer to existing spaces.

alter table public.spaces
  add column if not exists status_events_json jsonb default '[]'::jsonb;

comment on column public.spaces.status_events_json is
  'YASA space-wide status events for the Information Service. v1 bounded JSON buffer, future migration target: dedicated event table.';

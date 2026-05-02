-- YASA: Space rule profile cross-device sync
-- Run once in Supabase SQL Editor (Primary Database, role postgres).

alter table if exists public.spaces
  add column if not exists rule_profile_json jsonb;

comment on column public.spaces.rule_profile_json is
  'Optional SpaceRuleProfile payload for cross-device sync (host -> members).';

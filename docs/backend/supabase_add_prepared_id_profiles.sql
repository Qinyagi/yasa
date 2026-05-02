-- YASA Prepared ID Profiles / Host onboarding roster
-- Adds a backward-compatible JSON roster buffer to existing spaces.

alter table public.spaces
  add column if not exists prepared_id_profiles_json jsonb default '[]'::jsonb;

comment on column public.spaces.prepared_id_profiles_json is
  'YASA Host-prepared ID profiles for Space-wide read-only Shiftpal roster matching. Owner-authored; does not grant membership or permissions.';

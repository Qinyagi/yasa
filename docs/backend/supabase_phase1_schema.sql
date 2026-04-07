-- YASA Supabase Phase 1 (Profiles, Spaces, Memberships, Swaps)
-- Execute in Supabase SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null,
  display_name text not null,
  avatar_url text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  invite_token text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.space_members (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'coadmin', 'member')),
  joined_at timestamptz not null default now(),
  unique(space_id, profile_id)
);

create table if not exists public.swaps (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  requester_profile_id uuid not null references public.profiles(id) on delete restrict,
  accepted_by_profile_id uuid references public.profiles(id) on delete restrict,
  date date not null,
  shift_code text not null,
  message text,
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists idx_space_members_space_id on public.space_members(space_id);
create index if not exists idx_space_members_profile_id on public.space_members(profile_id);
create index if not exists idx_swaps_space_id on public.swaps(space_id);
create index if not exists idx_swaps_requester_profile_id on public.swaps(requester_profile_id);
create index if not exists idx_swaps_status on public.swaps(status);

alter table public.profiles enable row level security;
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.swaps enable row level security;

-- Profiles: user manages own profile.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = auth_user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = auth_user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- Members can see spaces they belong to.
drop policy if exists spaces_select_member on public.spaces;
create policy spaces_select_member on public.spaces
  for select using (
    exists (
      select 1 from public.space_members sm
      where sm.space_id = spaces.id
        and sm.profile_id in (
          select p.id from public.profiles p where p.auth_user_id = auth.uid()
        )
    )
  );

-- Any authenticated user may create a space (owner link validated in app service layer).
drop policy if exists spaces_insert_authenticated on public.spaces;
create policy spaces_insert_authenticated on public.spaces
  for insert with check (auth.uid() is not null);

drop policy if exists spaces_update_owner on public.spaces;
create policy spaces_update_owner on public.spaces
  for update using (
    owner_profile_id in (
      select p.id from public.profiles p where p.auth_user_id = auth.uid()
    )
  );

-- Membership visibility only for members of that space.
drop policy if exists members_select_member on public.space_members;
create policy members_select_member on public.space_members
  for select using (
    exists (
      select 1 from public.space_members sm
      where sm.space_id = space_members.space_id
        and sm.profile_id in (
          select p.id from public.profiles p where p.auth_user_id = auth.uid()
        )
    )
  );

drop policy if exists members_insert_authenticated on public.space_members;
create policy members_insert_authenticated on public.space_members
  for insert with check (auth.uid() is not null);

drop policy if exists members_update_owner_or_coadmin on public.space_members;
create policy members_update_owner_or_coadmin on public.space_members
  for update using (
    exists (
      select 1
      from public.space_members sm
      join public.profiles p on p.id = sm.profile_id
      where sm.space_id = space_members.space_id
        and p.auth_user_id = auth.uid()
        and sm.role in ('owner', 'coadmin')
    )
  );

-- Swaps visible for members of same space.
drop policy if exists swaps_select_member on public.swaps;
create policy swaps_select_member on public.swaps
  for select using (
    exists (
      select 1 from public.space_members sm
      where sm.space_id = swaps.space_id
        and sm.profile_id in (
          select p.id from public.profiles p where p.auth_user_id = auth.uid()
        )
    )
  );

drop policy if exists swaps_insert_member on public.swaps;
create policy swaps_insert_member on public.swaps
  for insert with check (
    exists (
      select 1 from public.space_members sm
      where sm.space_id = swaps.space_id
        and sm.profile_id = swaps.requester_profile_id
        and sm.profile_id in (
          select p.id from public.profiles p where p.auth_user_id = auth.uid()
        )
    )
  );

drop policy if exists swaps_update_member on public.swaps;
create policy swaps_update_member on public.swaps
  for update using (
    exists (
      select 1 from public.space_members sm
      where sm.space_id = swaps.space_id
        and sm.profile_id in (
          select p.id from public.profiles p where p.auth_user_id = auth.uid()
        )
    )
  );


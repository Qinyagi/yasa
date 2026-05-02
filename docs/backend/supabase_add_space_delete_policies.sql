-- YASA Space delete policies
-- Enables Space owners to delete their own Space row.
-- space_members rows are removed by ON DELETE CASCADE.

drop policy if exists spaces_delete_owner on public.spaces;
create policy spaces_delete_owner on public.spaces
  for delete using (
    owner_profile_id in (
      select p.id from public.profiles p where p.auth_user_id = auth.uid()
    )
  );

drop policy if exists members_delete_self_or_owner on public.space_members;
create policy members_delete_self_or_owner on public.space_members
  for delete using (
    user_id in (
      select p.id from public.profiles p where p.auth_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.spaces s
      join public.profiles p on p.id = s.owner_profile_id
      where s.id = space_members.space_id
        and p.auth_user_id = auth.uid()
    )
  );

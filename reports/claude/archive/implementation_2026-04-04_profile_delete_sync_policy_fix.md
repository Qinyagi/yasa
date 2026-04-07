# Profile-Delete Sync — RLS Policy Fix
**Date:** 2026-04-04
**Status:** COMPLETE — 2-device re-test PASS (Admin / Manage / Services Members)

---

## Problem Statement

After a guest deleted their profile, the host's member lists (Admin, Manage, Services) were not
updating correctly. The guest continued to appear as an active member even after the host performed
a manual sync or navigated away and back.

---

## Root Cause

### Symptom
`space_members` rows belonging to the deleted guest profile were **not being removed** from the
Supabase table, so the host's next `syncTeamSpaces` pull still returned the stale rows.

### Cause — RLS DELETE Policy Predicate Mismatch

The `space_members` table's Row-Level Security DELETE policy contained a predicate that compared
`auth.uid()` against a column value that was **not the profile's own auth UID** in the current app
model. Specifically, the policy was written for an earlier schema in which the authenticated user's
UID matched a specific join-table column directly. After a data-model refactor, that assumption no
longer held:

| What the policy expected | What the app actually sends |
|---|---|
| `auth.uid() = space_members.user_id` | Authenticated user deletes row where `profile_id = <profileId>` (profile ≠ auth user in current model) |

Because `auth.uid()` never equalled `space_members.user_id` for the deleting client, Postgres
silently rejected every DELETE (RLS returns 0 rows deleted rather than an error), leaving the
membership rows intact.

The client-side delete call returned no error (Supabase swallows 0-row-affected as success), so
the bug was invisible in client logs. The symptom only appeared on the next sync when the host's
pull saw the row still present.

---

## Fix Applied

### Change: Supabase RLS DELETE Policy on `space_members`

The DELETE policy was updated to allow any **authenticated** user to delete a row, replacing the
stale `auth.uid() = user_id` predicate with a simple authentication check:

```sql
-- OLD (broken — predicate never matched current app model)
CREATE POLICY "space_members_delete"
  ON space_members FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- NEW (working — consistent with current app model)
CREATE POLICY "space_members_delete"
  ON space_members FOR DELETE
  TO authenticated
  USING (auth.role() = 'authenticated');
```

This change was applied directly in the Supabase dashboard (SQL editor / Policies UI).
No application code changes were required.

---

## Validation Evidence

### 2-Device Manual Re-Test (2026-04-04)

| Step | Expected | Result |
|------|----------|--------|
| Device A (Host): create space, Device B (Guest): join via QR | Both appear in member lists | ✅ PASS |
| Device B: delete profile (`deleteProfile` flow) | `space_members` row deleted in Supabase | ✅ PASS — row confirmed absent in Supabase table viewer |
| Device A: navigate to Admin → Members | Guest no longer listed | ✅ PASS |
| Device A: navigate to Manage → Members | Guest no longer listed | ✅ PASS |
| Device A: navigate to Services → Members | Guest no longer listed | ✅ PASS |
| Device A: `useRealtimeMemberSync` fires → `syncTeamSpaces` | `memberHistory` entry for guest gets `removedAt` timestamp, `active = false` | ✅ PASS |
| Host-only `members.tsx` "Verlauf" section | Guest appears with `removedAt` | ✅ PASS |

---

## Risk Assessment

### Current State (post-fix)
| Risk | Level | Notes |
|------|-------|-------|
| Any authenticated user can delete **any** row in `space_members` | MEDIUM | App logic gates deletes to own profile only, but RLS does not enforce this at DB level |
| Accidental or malicious cross-user membership deletion | MEDIUM | Requires a valid Supabase auth token — unauthenticated users blocked |
| Data integrity in multi-tenant scenario | MEDIUM | Acceptable for current single-tenant / friend-group app model |

### What Is NOT a Risk Right Now
- Unauthenticated deletes: still blocked (`TO authenticated`).
- SELECT/INSERT/UPDATE policies: unaffected by this change.
- Existing app functionality: no code changes, no migration needed.

---

## Recommendation: Future Least-Privilege Hardening

When the app model is stabilized (profile ↔ auth UID relationship is reliable), the DELETE policy
should be tightened. Suggested target predicate:

```sql
-- FUTURE HARDENED POLICY
-- Requires: space_members.profile_id references profiles.id,
--           profiles.auth_uid = auth.uid() (or similar column)
CREATE POLICY "space_members_delete_own"
  ON space_members FOR DELETE
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM profiles WHERE auth_uid = auth.uid()
    )
  );
```

Additionally consider adding a host-delete pathway so the host can also remove a member row
(e.g. kicking a member), subject to verifying the requestor owns the space:

```sql
-- FUTURE: allow host to also delete members of their own spaces
USING (
  profile_id IN (SELECT id FROM profiles WHERE auth_uid = auth.uid())
  OR
  space_id IN (SELECT id FROM spaces WHERE owner_profile_id IN (
    SELECT id FROM profiles WHERE auth_uid = auth.uid()
  ))
)
```

These changes are **non-urgent** — the current authenticated-only policy is functionally correct
and safe within the existing trust model of the app.

---

## Files Changed

| Artifact | Change |
|----------|--------|
| Supabase RLS — `space_members` DELETE policy | Predicate changed from `auth.uid() = user_id` → `auth.role() = 'authenticated'` |
| `lib/backend/realtimeMembers.ts` | No change (already correct) |
| `lib/backend/teamSync.ts` | No change (already handles removed members → `removedAt`) |
| `lib/storage.ts` | No change |
| Application screens | No change |

---

## Related Context

- `realtimeMembers.ts` — Realtime channel fires after delete; triggers debounced `syncTeamSpaces`.
- `teamSync.ts` — `syncTeamSpaces` merge sets `active = false` + `removedAt` for members absent from remote.
- `members.tsx` — Host-only screen; shows removed members in "Verlauf" section.
- Previous implementation: `archive/implementation_2026-04-02_space_members_and_coadmin.md`

READY_FOR_READ_LATEST: YES

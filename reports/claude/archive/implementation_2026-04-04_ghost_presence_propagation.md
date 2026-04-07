# Ghost Presence Propagation — Cross-Device Sync
**Date:** 2026-04-04
**Status:** COMPLETE — tsc exit 0, all tests PASS (163 total, 36 new)

---

## Problem Statement

When a member on Device A marks a ghost as present today ("👻 Ghost als anwesend markieren"),
the ghost entry did **not appear** in "Meine Shiftpals" on any other device in the same space.

Two independent gaps caused this:

| Gap | Root cause |
|-----|-----------|
| **Ghost definitions** | Ghost profiles are stored only in local `AsyncStorage (yasa.ghosts.v1)`. Other devices have no knowledge of ghost IDs — they cannot request their shift plans from the backend. |
| **Ghost presence** | `markGhostPresent` writes a `UserShiftPlan` to local `AsyncStorage` only. It was never pushed to `shift_plans` in Supabase. `pullShiftPlansByProfileIds` in `today.tsx` only pulled plans for real space members — ghost IDs were excluded. |

---

## Architecture of the Fix

### Two-layer sync design

```
Layer 1 — Ghost Definitions
  spaces.ghosts_json (new JSONB column)   ← push: host only (manage.tsx)
  pullGhostsForSpace()                    ← pull: all members (today.tsx loadData)
  mergeRemoteGhosts()                     ← merge into local AsyncStorage
  storage.ts: yasa.ghosts.v1             ← local source of truth (pre-existing)

Layer 2 — Ghost Presence (shift plans)
  shift_plans (Supabase table, pre-existing)
  pushShiftPlanToBackend()               ← push: any member after markGhostPresent
  pullShiftPlansByProfileIds(            ← pull: today.tsx loadData
    [...memberIds, ...ghostIds]          ←   ghost IDs now included
  )
```

### End-to-end data flow

**Host Device (creates ghosts, marks present):**
```
createGhost(spaceId, label, ownerId)
  → yasa.ghosts.v1 (local)
  → pushGhostsForSpace(spaceId, activeGhosts)   ← NEW
      → spaces.ghosts_json (Supabase)

markGhostPresent(ghostId, date, shiftCode)
  → yasa.shifts.v1 (local)
  → pushShiftPlanToBackend(ghostPlan)            ← NEW
      → shift_plans (Supabase)
```

**Any Device (on focus / sync):**
```
loadData():
  pullGhostsForSpace(spaceId)                   ← NEW
    → mergeRemoteGhosts(spaceId, remoteGhosts)  ← NEW
      → yasa.ghosts.v1 (updated with remote ghosts)
  listGhosts(spaceId)                           ← now has remote ghosts
  pullShiftPlansByProfileIds(                    ← updated
    [...memberIds, ...ghostIds]                  ← ghost IDs included
  )
  → resolvedPlans[ghost.id]                     ← ghost plan found
  → ghostEntries rendered in "Ghosts heute"
```

### Graceful degradation
- `pullGhostsForSpace` returns `[]` if `ghosts_json` column not yet migrated → no crash, local ghosts used
- All new backend calls are best-effort (try/catch) → focus-sync recovers on retry
- `mergeRemoteGhosts` is additive: local-only ghosts (pending push) preserved
- Empty remote ghost list → no-op, local ghosts untouched

---

## Supabase Migration Required

```sql
-- One-time migration — run once per Supabase project
ALTER TABLE spaces
  ADD COLUMN IF NOT EXISTS ghosts_json JSONB DEFAULT '[]'::jsonb;
```

RLS implications:
- SELECT: any authenticated user can read (they already read the spaces row)
- UPDATE of `ghosts_json`: called only from host-only UI (manage.tsx owner guard enforces this in app logic); no additional RLS restriction required at this stage

---

## Files Changed

| File | Change |
|------|--------|
| `lib/backend/ghostSync.ts` | **NEW** — `pushGhostsForSpace`, `pullGhostsForSpace` |
| `lib/storage.ts` | **NEW** `mergeRemoteGhosts(spaceId, remoteGhosts)` exported function |
| `app/(team)/today.tsx` | Ghost pre-load before shift plan pull; ghost IDs in pull set; push ghost plan after markGhostPresent |
| `app/(space)/manage.tsx` | Push ghost defs to backend after `createGhost` and `archiveGhost` |
| `lib/__tests__/ghostPresenceSync.test.ts` | **NEW** — 36 pure-function tests (12 suites) |
| `package.json` | Added `ghostPresenceSync.test.ts` to `npm test` script |

---

## Detailed Changes

### `lib/backend/ghostSync.ts` (NEW)

```typescript
export async function pushGhostsForSpace(
  spaceId: string,
  ghosts: UserProfile[]
): Promise<void>

export async function pullGhostsForSpace(
  spaceId: string
): Promise<UserProfile[]>
```

- `pushGhostsForSpace`: Uses `UPDATE` (not upsert) on `spaces.ghosts_json`. Only sends `ghosts_json` — does not affect any other space column.
- `pullGhostsForSpace`: Reads `id,ghosts_json` from spaces. Returns `[]` on error (never throws). Column-absent scenarios return `[]` gracefully.

### `lib/storage.ts` — `mergeRemoteGhosts`

```typescript
export async function mergeRemoteGhosts(
  spaceId: string,
  remoteGhosts: UserProfile[]
): Promise<void>
```

Merge semantics:
- Empty remote → no-op (protects local state when backend unreachable)
- Remote ghost (by id) wins on metadata (label, status, avatarUrl)
- Local-only ghosts (not in remote, e.g. pending push) preserved
- New remote ghosts added to local storage

### `app/(team)/today.tsx`

**Import additions:**
```typescript
import { pullGhostsForSpace } from '../../lib/backend/ghostSync';
import { pushShiftPlanToBackend } from '../../lib/backend/shiftSync';
import { mergeRemoteGhosts } from '../../lib/storage';
// getAllShiftPlans already imported
```

**loadData restructure (critical order):**
```
Before:  shift plan pull → ... → listGhosts → build ghostEntries
After:   pullGhostsForSpace → mergeRemoteGhosts → listGhosts →
         pullShiftPlansByProfileIds([...memberIds, ...ghostIds]) →
         build ghostEntries
```

Ghost pre-load is placed AFTER member sync and membership guard — correct scope.
`setAvailableGhosts(ghosts)` called once (earlier, before shift plan pull).

**handleConfirmGhostPresence — backend push:**
```typescript
await markGhostPresent(selectedGhost.id, today, selectedShiftCode);
// NEW: push to backend so other devices see this presence
try {
  const allPlans = await getAllShiftPlans();
  const ghostPlan = allPlans[selectedGhost.id];
  if (ghostPlan) await pushShiftPlanToBackend(ghostPlan);
} catch { /* best-effort */ }
```

### `app/(space)/manage.tsx`

`handleCreateGhost` — after successful local create:
```typescript
try {
  const updatedGhosts = await listGhosts(space.id);
  await pushGhostsForSpace(space.id, updatedGhosts);
} catch { /* best-effort */ }
```

`handleArchiveGhost` — after archive:
```typescript
try {
  const remaining = await listGhosts(space.id);  // archived ghost excluded
  await pushGhostsForSpace(space.id, remaining);
} catch { /* best-effort */ }
```

---

## Test Coverage — `ghostPresenceSync.test.ts`

| Suite | Tests | What is verified |
|-------|-------|-----------------|
| G1: Pull set inclusion | 5 | Ghost IDs added to pull set; archived excluded; dedup |
| G2: mergeRemoteGhosts — new ghost | 3 | New remote ghosts added correctly |
| G3: mergeRemoteGhosts — update | 3 | Remote wins on label/status; others unchanged |
| G4: mergeRemoteGhosts — local-only | 2 | Local ghosts not in remote preserved |
| G5: mergeRemoteGhosts — empty remote | 2 | No-op, no data loss |
| G6: Ghost presence entry building | 5 | Correct entries, isGhost flag, label, code |
| G7: Absent from resolvedPlans | 3 | No crash, no stale entries |
| G8: Ghost plan push decision | 3 | Plan found → push; absent → skip |
| G9: Push null safety | 1 | Unknown ID → null, no throw |
| G10: Cross-device scenario | 4 | Full Device A → Device B flow simulation |
| G11: Deduplication | 2 | No duplicate ghost IDs in pull set or merges |
| G12: Archived ghost exclusion | 3 | Archived ghost not in pull set or entries |
| **Total** | **36** | |

---

## Validation — QA Checklist (Manual)

| Step | Device | Expected | Evidence |
|------|--------|----------|---------|
| Host creates ghost in manage.tsx | A (Host) | Ghost pushed to `spaces.ghosts_json` | Supabase table viewer |
| Member opens today.tsx | B (Member) | Ghost definition pulled + merged locally | `listGhosts` returns ghost |
| Member marks ghost present | B (Member) | `markGhostPresent` + `pushShiftPlanToBackend` | `shift_plans` row appears in Supabase |
| Host opens today.tsx | A (Host) | Ghost appears in "Ghosts heute" section | UI renders ghost entry |
| Any device opens today.tsx after marking | C (3rd device) | Ghost appears in "Ghosts heute" section | Focus-sync convergence |
| Host archives ghost | A (Host) | Archived ghost removed from `ghosts_json` | `pushGhostsForSpace` sends updated list |
| Other device syncs after archive | B (Member) | Archived ghost no longer appears | `ghostStatus: 'archived'` → filtered in `listGhosts` |

---

## Regression Safety

| Guard | Status |
|-------|--------|
| Host-only admin guards in manage.tsx | ✅ Unchanged |
| memberHistory / profile-delete flow | ✅ Unchanged (ghost sync is additive, separate layer) |
| `space_members` member sync | ✅ Unchanged (ghosts never added to space_members) |
| TypeScript strict mode | ✅ tsc exit 0 |
| Existing 127 tests | ✅ All PASS |
| New ghost tests | ✅ 36/36 PASS |

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|-----------|
| `ghosts_json` column not yet migrated | LOW | `pullGhostsForSpace` returns `[]` gracefully; app degrades to local-only ghosts |
| Non-owner member calls `pushGhostsForSpace` | VERY LOW | Only called from host-only UI (owner guard in manage.tsx) |
| Network failure during ghost push | LOW | Best-effort; focus-sync on next open recovers |
| Ghost plan pushed but ghost def not yet synced | LOW | Focus-sync next open: defs + plans pulled together in loadData order |
| Ghost `id` collision (UUID) | NEGLIGIBLE | UUID v4 collision probability is astronomically low |

## Related Files
- `lib/backend/teamSync.ts` — unchanged; `syncTeamSpaces` not affected
- `lib/backend/realtimeMembers.ts` — unchanged; member realtime unaffected
- `lib/backend/shiftSync.ts` — `pushShiftPlanToBackend` reused (no change)
- Previous fix: `archive/implementation_2026-04-04_profile_delete_sync_policy_fix.md`

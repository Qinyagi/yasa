# QA Review – Ghost Presence Cross-Device Propagation Re-Gate
**Date:** 2026-04-04 10:27
**Reviewer:** Senior QA Reviewer (Minimax M2.5)
**PROJECT ROOT:** C:\Users\XyZ\Documents\YASA\yasa ✓

---

## Verdict: **PASS** ✅

Ghost presence propagation implemented correctly. Two-layer sync (ghost definitions + shift plans)
verified in code. All 163 tests pass. TypeScript clean. Regression guards intact.

---

## 1. Behavior Claims — Verified

| Claim | Code Evidence | Status |
|-------|--------------|--------|
| Ghost marked present on Device A appears on Device B/C in same space | `today.tsx:283-291` — `markGhostPresent` + `pushShiftPlanToBackend`; `today.tsx:133-148` — pull + merge + ghost IDs in pull set | ✅ VERIFIED |
| Works for host/coadmin/member roles | `today.tsx` ghost handlers available to all members; `manage.tsx:133,165` push only from host (owner guard at `manage.tsx:199`) | ✅ VERIFIED |
| No duplicates or stale residues after refresh/focus | `buildPullSet` uses `Set` for dedup (`ghostPresenceSync.test.ts:67`); `mergeRemoteGhosts` uses `Map` keyed by id (`storage.ts:864`) | ✅ VERIFIED |
| Fallback sync converges after reconnect | All backend calls best-effort with try/catch; focus-sync on next open recovers (`today.tsx:137-139,155-157,293-295`) | ✅ VERIFIED |

---

## 2. Integration Points — Confirmed

### today.tsx — Ghost pre-load + presence push

| Location | Code Path | Status |
|----------|-----------|--------|
| `today.tsx:23-26` | Imports: `mergeRemoteGhosts`, `pullShiftPlansByProfileIds`, `pushShiftPlanToBackend`, `pullGhostsForSpace` | ✅ VERIFIED |
| `today.tsx:133-141` | Ghost pre-load: `pullGhostsForSpace` → `mergeRemoteGhosts` → `listGhosts` | ✅ VERIFIED |
| `today.tsx:145-148` | Pull set: `[...memberIds, ...ghostIds]` — ghost IDs included | ✅ VERIFIED |
| `today.tsx:283-291` | `handleConfirmGhostPresence`: `markGhostPresent` → `pushShiftPlanToBackend` | ✅ VERIFIED |

### manage.tsx — Ghost definition push

| Location | Code Path | Status |
|----------|-----------|--------|
| `manage.tsx:28` | Import: `pushGhostsForSpace` | ✅ VERIFIED |
| `manage.tsx:131-136` | `handleCreateGhost`: push after `createGhost` | ✅ VERIFIED |
| `manage.tsx:162-168` | `handleArchiveGhost`: push after `archiveGhost` | ✅ VERIFIED |

### ghostSync.ts — Backend push/pull

| Function | Behavior | Status |
|----------|----------|--------|
| `pushGhostsForSpace` (`ghostSync.ts:53-67`) | UPDATE `spaces.ghosts_json` WHERE `id = spaceId` | ✅ VERIFIED |
| `pullGhostsForSpace` (`ghostSync.ts:80-98`) | SELECT `id,ghosts_json` from spaces; returns `[]` on error | ✅ VERIFIED |

### storage.ts — mergeRemoteGhosts

| Location | Behavior | Status |
|----------|----------|--------|
| `storage.ts:855-875` | Empty remote → no-op; remote wins on metadata overlap; local-only ghosts preserved | ✅ VERIFIED |

---

## 3. Regression Checks — PASS

| Guard | Evidence | Status |
|-------|----------|--------|
| Host-only guard in manage.tsx | `manage.tsx:199` — `profile.id !== space.ownerProfileId` redirect intact | ✅ VERIFIED |
| Member sync (join/delete) unchanged | No changes to `teamSync.ts`, `realtimeMembers.ts` | ✅ VERIFIED |
| Admin/manage/services member views unchanged | Ghost sync is additive layer; no member view modifications | ✅ VERIFIED |
| `space_members` DELETE policy fix intact | No overlap with ghost sync; separate backend table (`spaces.ghosts_json` vs `space_members`) | ✅ VERIFIED |

---

## 4. Technical Checks — PASS

| Command | Result |
|---------|--------|
| `npm run typecheck` | ✅ Exit 0 — tsc clean |
| `npm test` | ✅ 163/163 PASS |
| Previous tests | ✅ 127/127 PASS (no regressions) |
| New ghost presence suite | ✅ 36/36 PASS (12 suites) |

### Test Suite Coverage Confirmed

| Suite | Tests | Coverage |
|-------|-------|----------|
| G1: Pull set inclusion | 5 | Ghost IDs added, archived excluded, dedup |
| G2: mergeRemoteGhosts — new ghost | 3 | Remote ghosts added to local |
| G3: mergeRemoteGhosts — metadata update | 3 | Remote wins on overlap |
| G4: mergeRemoteGhosts — local-only preserved | 2 | Pending push scenario safe |
| G5: mergeRemoteGhosts — empty remote | 2 | No-op, no data loss |
| G6: Ghost presence entry building | 5 | Correct entries, isGhost, label, code |
| G7: Absent from resolvedPlans | 3 | No crash, no stale entries |
| G8: Ghost plan push decision | 3 | Plan found → push; absent → skip |
| G9: Push null safety | 1 | Unknown ID → null, no throw |
| G10: Cross-device scenario | 4 | Full Device A → Device B flow |
| G11: Deduplication | 2 | No duplicate ghost IDs |
| G12: Archived ghost exclusion | 3 | Archived filtered from pull set and entries |

---

## 5. Security & Risk Assessment

| Risk | Level | Assessment |
|------|-------|------------|
| `ghosts_json` column not yet migrated | LOW | `pullGhostsForSpace` returns `[]` gracefully — no crash, local ghosts still work |
| Non-owner calls `pushGhostsForSpace` | VERY LOW | Only called from host-only UI (`manage.tsx:199` owner guard) |
| Network failure during ghost push | LOW | Best-effort try/catch; focus-sync recovers on next open |
| Ghost plan pushed but definition not yet synced | LOW | Next focus-sync: defs + plans pulled together in loadData order |
| Ghost UUID collision | NEGLIGIBLE | UUID v4 |

**Risk Verdict:** **acceptable for now** — all new code paths are best-effort with graceful degradation.

---

## 6. Open Items

| Item | Severity | Action Required |
|------|----------|-----------------|
| Supabase migration: `ALTER TABLE spaces ADD COLUMN ghosts_json JSONB DEFAULT '[]'::jsonb` | REQUIRED | Must run before feature is live |
| No realtime channel for shift_plans (ghost presence) | LOW | Focus-sync convergence sufficient for current requirements |
| Ghost definitions host-only push — host offline delays propagation | LOW | Acceptable; recovers on reconnect |

---

## Verification Summary

| Aspect | Status |
|--------|--------|
| Ghost marked present → appears on other devices | ✅ VERIFIED |
| Works for host/coadmin/member | ✅ VERIFIED |
| No duplicates after refresh/focus | ✅ VERIFIED |
| Fallback sync converges | ✅ VERIFIED |
| Member sync (join/delete) unaffected | ✅ VERIFIED |
| Admin/manage/services views unchanged | ✅ VERIFIED |
| Host-only guards intact | ✅ VERIFIED |
| TypeScript clean | ✅ VERIFIED |
| Tests pass | ✅ 163/163 |
| Security risk acceptable | ✅ ACCEPTABLE FOR NOW |

---

**PASS** — All re-gate requirements satisfied.

**Date/Time:** 2026-04-04 10:27
**Scope completed:** Re-gate validation of ghost presence cross-device propagation
**Open items:** Supabase migration required before feature goes live
**READY_FOR_READ_LATEST: YES**
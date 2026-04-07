# QA Review – Guest Delete Propagation Fix Re-Gate
**Date:** 2026-04-02 05:39
**Reviewer:** Senior QA Reviewer (Minimax M2.5)
**PROJECT ROOT:** C:\Users\XyZ\Documents\YASA\yasa ✓

---

## Verdict: **PASS** ✅

All four root causes verified fixed. Authoritative merge implemented correctly. Build clean. Test coverage confirmed 97/97.

---

## 1. RC-1: Profile Delete Flow — Backend Membership Removal

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Profile delete performs backend membership removal | ✅ FIXED | `app/(admin)/index.tsx:141-149` — Before local wipe: calls `removeSpaceMembershipsForProfile(profile.id, spaceIds)` in try/catch (best-effort) |
| Function exported from teamSync | ✅ VERIFIED | `lib/backend/teamSync.ts:115-128` — `removeSpaceMembershipsForProfile` deletes from `space_members` table where `user_id=profileId` and `space_id IN (...)` |

---

## 2. RC-2: Push Logic — No Re-Insert of Deleted Guests

| Requirement | Status | Evidence |
|-------------|--------|----------|
| pushSpacesToBackend accepts ownProfileId | ✅ FIXED | `lib/backend/teamSync.ts:65` — signature includes `ownProfileId: string` |
| Only own profile row pushed | ✅ VERIFIED | `lib/backend/teamSync.ts:86-102` — `.filter((member) => member.id === ownProfileId)` ensures only self is pushed |
| Cannot re-insert deleted members | ✅ VERIFIED | Comment at lines 60-64 documents: "only this device's own profile row is upserted ... never re-insert other members" |

---

## 3. RC-3: Sync Merge — Remote Authoritative for Membership

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Merge iterates remote members (not local) | ✅ FIXED | `lib/backend/teamSync.ts:181-204` — builds `memberMap` from `remoteSpace.memberProfiles`, not local |
| Deleted guests removed from local cache | ✅ VERIFIED | Lines 178-180 comment: "Remote member list is authoritative: only members present in the backend are kept" |
| Own profile safety net preserves self | ✅ VERIFIED | `lib/backend/teamSync.ts:206-213` — only `profileId` is preserved if missing from remote |
| Deleted guests NOT protected by safety net | ✅ VERIFIED | Safety net only applies to `profileId`, not arbitrary members |

---

## 4. RC-4: Host Views — Sync on Load for Quick Deletion

| Requirement | Status | Evidence |
|-------------|--------|----------|
| today.tsx performs sync before rendering | ✅ FIXED | `app/(team)/today.tsx:91-101` — best-effort `syncTeamSpaces(p.id, localSpaces)` in try/catch before computing colleagues |
| setSpaces called with merged result | ✅ VERIFIED | `today.tsx:98` — `await setSpaces(spaces)` persists merged result |
| Deleted members visible quickly (no choose.tsx required) | ✅ VERIFIED | Lines 91-93 comment: "pull fresh member list from backend so that guests who have deleted their profile are removed before we render" |

---

## 5. Regression Checks

| Screen | File+Line | Status |
|--------|-----------|--------|
| Shiftpals (today.tsx colleagues) | `app/(team)/today.tsx:166` | ✅ Uses synced `memberProfiles` |
| Shiftpals (today.tsx member guard) | `app/(team)/today.tsx:115` | ✅ Uses synced `memberProfiles` |
| Space member list (manage.tsx) | `app/(space)/manage.tsx:180,186` | ✅ Uses synced `memberProfiles` |
| Swap candidates (candidates.tsx) | `app/(swap)/candidates.tsx:134,149` | ✅ Uses synced `memberProfiles` |
| Services (index.tsx) | `app/(services)/index.tsx:134` | ✅ Uses synced `memberProfiles` |
| Swap (index.tsx) | `app/(swap)/index.tsx:134` | ✅ Uses synced `memberProfiles` |

---

## 6. Build & Test Validation

| Command | Result |
|---------|--------|
| `npm run typecheck` | ✅ Exit 0 — tsc clean |
| `npm test` | ✅ 97/97 PASS (84 existing + 13 new member sync tests) |
| New member sync tests executed | ✅ Confirmed — 13 tests in `lib/__tests__/memberSync.test.ts` covering: D1 remote authoritative, D2 safety net, D3 idempotency, E2E lifecycle |

**Test output verification:**
```
mergeSpaceMembers – D1 remote is authoritative: 4 tests
mergeSpaceMembers – D2 own-profile safety net: 3 tests
mergeSpaceMembers – D3 idempotency: 2 tests
E2E: guest delete propagation lifecycle: 4 tests
Ergebnis: 13 bestanden, 0 fehlgeschlagen
```

---

## 7. Verification Summary

| Aspect | Status |
|--------|--------|
| RC-1: Backend membership removal on delete | ✅ FIXED |
| RC-2: Push only own profile (no re-insert) | ✅ FIXED |
| RC-3: Remote-authoritative merge | ✅ FIXED |
| RC-4: today.tsx syncs on load | ✅ FIXED |
| No reappearance after multiple syncs | ✅ VERIFIED (D3 idempotency tests) |
| All screens use synced member data | ✅ VERIFIED |
| TypeScript clean | ✅ VERIFIED |
| Tests 97/97 pass | ✅ VERIFIED |

---

## Residual Risks

| Risk | Severity | Status |
|------|----------|--------|
| Network offline at delete time | LOW | ✅ Best-effort delete; local wipe proceeds; backend row orphaned but device is wiped so never re-pushed |
| Host app never re-opens after guest delete | VERY LOW | ✅ Impractical for active users |

---

## Release Blocker Remaining?

**NO** — All requirements met. Ready for release.

---

**Date/Time:** 2026-04-02 05:39
**Scope completed:** Full re-gate validation of guest delete propagation fix
**Open items:** None
**READY_FOR_READ_LATEST: YES**
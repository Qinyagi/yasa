# QA Review – Shiftpals Avatar Root-Cause Fix
**Date:** 2026-04-01
**Reviewer:** Senior QA Reviewer (Minimax M2.5)
**PROJECT ROOT:** C:\Users\XyZ\Documents\YASA\yasa ✓

---

## Verdict: **PASS** ✅

All four root causes verified fixed. Build clean. Minor residual risk noted.

---

## Verification Matrix

| Requirement | Status | File+Line Evidence |
|-------------|--------|-------------------|
| RC-1: No empty owner avatar on invite import/migration | ✅ FIXED | `lib/storage.ts:227` — `fallbackAvatarSeed(s.ownerProfileId, ownerName)`<br>`lib/storage.ts:367` — `fallbackAvatarSeed(payload.ownerProfileId, payload.ownerDisplayName)` |
| RC-2: Backend sync does not let fallback seeds overwrite real seeds | ✅ FIXED | `lib/backend/teamSync.ts:86` — `!isFallbackAvatarSeed(member.avatarUrl, member.id, member.displayName)`<br>`lib/backend/teamSync.ts:160` — merge prefers non-fallback |
| RC-3: Canonical avatar resolver used consistently | ✅ FIXED | All 4 screens import from `lib/avatarSeed.ts`:<br>· `today.tsx:26` import<br>· `choose.tsx:15` import<br>· `candidates.tsx:23` import<br>· `manage.tsx:26` import |
| Ghost avatar seed uses canonical resolver | ✅ FIXED | `today.tsx:468` — `resolveAvatarSeed(ghost.id, ghost.ghostLabel ?? ghost.displayName, ghost.avatarUrl)`<br>`manage.tsx:245` — same pattern |

---

## Build & Test Validation

| Command | Result |
|---------|--------|
| `npm run typecheck` | exit 0 — tsc clean |
| `npm test` | 57/57 PASS |

---

## Regression Check

| Screen | Regression Risk | Status |
|--------|-----------------|--------|
| Space member list (`manage.tsx`) | Avatar rendering | ✅ Uses canonical `resolveAvatarSeed` |
| Swap candidates (`candidates.tsx`) | Avatar rendering | ✅ Uses canonical `resolveAvatarSeed` |
| Profile header | — | Not present in codebase |
| Today/Shiftpals list (`today.tsx`) | Ghost + members | ✅ Both use canonical resolver |

---

## Residual Risks

| Risk | Severity | Notes |
|------|----------|-------|
| `app/(services)/index.tsx:19` has local duplicate `resolveAvatarSeed` without legacy URL handling or lowercase normalization | LOW | Only affects services index screen, not core workflow. Should be migrated to import from `lib/avatarSeed.ts`. |
| One-time avatar transition on Device B after sync (fallback → real) | LOW | Expected UX behavior, documented in implementation report. |

---

## Manual 2-Device Test Checklist

Pre-condition: Two devices (A = owner, B = joiner), both on current build.

| Step | Device | Action | Expected Result |
|------|--------|--------|-----------------|
| 1 | A | Create space → note avatar in profile header | Owner sees own avatar with real seed |
| 2 | B | Scan QR invite → join space | Owner snapshot has fallback seed |
| 3 | B → today.tsx | Before sync (fallback) | Owner avatar may differ from Device A (expected) |
| 4 | B → choose.tsx | Navigate → syncTeamSpaces runs | Push/pull occurs |
| 5 | B → today.tsx | After sync | Owner now shows correct avatar matching Device A's real seed |
| 6 | Both | Verify all name-avatar pairs consistent | No mismatches |
| 7 | A → today.tsx | Create ghost → verify ghost picker avatar | Ghost picker avatar matches ghost row |
| 8 | Both → services | Navigate to services index | Note: local resolveAvatarSeed may show different avatar than canonical |

---

## File + Line Evidence Summary

**RC-1 Fix:**
- `lib/storage.ts:227` — `avatarUrl: fallbackAvatarSeed(s.ownerProfileId, ownerName)`
- `lib/storage.ts:367` — `avatarUrl: fallbackAvatarSeed(payload.ownerProfileId, payload.ownerDisplayName)`

**RC-2 Fix:**
- `lib/backend/teamSync.ts:86` — skips push for fallback seeds
- `lib/backend/teamSync.ts:160-163` — merge prefers non-fallback seeds

**RC-3 Fix:**
- `lib/avatarSeed.ts:17` — canonical `fallbackAvatarSeed` function
- `lib/avatarSeed.ts:47` — canonical `resolveAvatarSeed` function
- All 4 screens import and use canonical resolver

**Ghost Fix:**
- `app/(team)/today.tsx:468` — ghost uses `resolveAvatarSeed`
- `app/(space)/manage.tsx:245` — ghost uses `resolveAvatarSeed`

---

**READY_FOR_READ_LATEST: YES**
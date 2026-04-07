# Implementation Report – Shiftpals Avatar Cross-Device Root Cause Fix
**Date:** 2026-04-01
**Scope:** Avatar identity inconsistency in "Meine Shiftpals" (`app/(team)/today.tsx`) across two devices

---

## Root Cause Summary

Three layered bugs caused the avatar mismatch:

### RC-1 (PRIMARY): `importSpaceFromInvite` stores `avatarUrl: ''` for the Space owner

**File:** `lib/storage.ts:360` (before fix)

When Device B scans the QR invite and creates the Space locally, the owner's `MemberSnapshot` is built from QR payload data — which does NOT include the owner's `avatarUrl`. The code stored `''`:

```ts
{ id: payload.ownerProfileId, displayName: payload.ownerDisplayName, avatarUrl: '' },
```

**Effect on cross-device rendering:**
- Device A (owner): renders own avatar via `profile.avatarUrl` (e.g. `'alice'`) → multiavatar seed `'alice'`
- Device B (joiner, before sync): renders owner as a colleague using snapshot `avatarUrl: ''` → falls back to `${ownerId}:${ownerDisplayName}`.toLowerCase()` → different seed → different avatar

This was the primary cause of the "wrong identity avatar" on Device B.

**Same bug also in `migrateSpace`** (storage.ts:225) which builds a legacy owner snapshot with `avatarUrl: ''`.

### RC-2 (BACKEND RACE): `pushSpacesToBackend` could overwrite a real seed with a fallback

**File:** `lib/backend/teamSync.ts:87` (before fix)

```ts
...(member.avatarUrl ? { avatar_url: member.avatarUrl } : {}),
```

After RC-1 fix (owner snapshot gets a fallback seed instead of `''`), the fallback seed would be pushed to the backend, potentially overwriting Device A's real seed (`'alice'`) in the `space_members` table on the next sync.

Additionally, `syncTeamSpaces` merge logic unconditionally preferred `remoteMember.avatarUrl`, meaning a stale fallback from Device B could defeat the real seed from Device A.

### RC-3 (COSMETIC/DIVERGENCE): `resolveAvatarSeed` duplicated in 4 screens without legacy URL handling

**Files:** `today.tsx:37-43`, `choose.tsx:18-24`, `candidates.tsx:44-50`, `manage.tsx:28-34`

All four copies lacked `extractSeedFromLegacyUrl` handling. If any `MemberSnapshot.avatarUrl` contained an old `https://api.multiavatar.com/<seed>.svg` URL (pre-iteration-8 profile), `resolveAvatarSeed` returned the full URL string as the seed. `buildMultiavatarSvg` would then generate an avatar for the URL string — not for the intended seed name.

Additionally, `today.tsx:475` and `manage.tsx:252` used a different inline ghost seed formula (`${space.id}:${ghostLabel}`) instead of `resolveAvatarSeed`, creating a third independent formula.

---

## Evidence (File + Line References)

| File | Line | Issue |
|------|------|-------|
| `lib/storage.ts` | 360 | `avatarUrl: ''` for owner in `importSpaceFromInvite` |
| `lib/storage.ts` | 225 | `avatarUrl: ''` for owner in `migrateSpace` legacy fallback |
| `lib/backend/teamSync.ts` | 87 | Skips push when avatarUrl empty, but not when fallback seed |
| `lib/backend/teamSync.ts` | 152-155 | Merge always prefers remote, even if remote is stale fallback |
| `app/(team)/today.tsx` | 37-43 | Local `resolveAvatarSeed` – no legacy URL handling |
| `app/(team)/today.tsx` | 475 | Ghost picker uses different seed formula than ghost row display |
| `app/(space)/choose.tsx` | 18-24 | Local copy of `resolveAvatarSeed` |
| `app/(swap)/candidates.tsx` | 44-50 | Local copy of `resolveAvatarSeed` |
| `app/(space)/manage.tsx` | 28-34 | Local copy of `resolveAvatarSeed` |
| `app/(space)/manage.tsx` | 252 | Ghost list uses different seed formula |

---

## Files Changed

1. **`lib/avatarSeed.ts`** ← NEW (canonical module)
2. **`lib/storage.ts`** — import `fallbackAvatarSeed`; fix `migrateSpace` and `importSpaceFromInvite`
3. **`lib/backend/teamSync.ts`** — import from `lib/avatarSeed`; fix push (skip fallback seeds); fix merge (prefer real seeds)
4. **`app/(team)/today.tsx`** — import `resolveAvatarSeed`; fix ghost picker seed formula
5. **`app/(space)/choose.tsx`** — import `resolveAvatarSeed`; remove local function
6. **`app/(swap)/candidates.tsx`** — import `resolveAvatarSeed`; remove local function
7. **`app/(space)/manage.tsx`** — import `resolveAvatarSeed`; remove local function; fix ghost list seed formula

---

## Fix Strategy (Why This Is Robust)

### 1. Canonical `lib/avatarSeed.ts`
Single source of truth. All screens import from here. Future changes to seed resolution logic happen in one place.

**Priority order in `resolveAvatarSeed`:**
1. Legacy `https://api.multiavatar.com/<seed>.svg` URL → extract seed via `extractSeedFromLegacyUrl`
2. Clean avatarUrl (non-empty, non-URL) → use directly, lowercased
3. No avatarUrl → `${id}:${displayName}`.toLowerCase()

### 2. `fallbackAvatarSeed` is explicit and deterministic
Previously, the fallback was implicit (inside `resolveAvatarSeed` only). Now it's a named export that can be used when building snapshots without the member's full profile. Both `importSpaceFromInvite` and `migrateSpace` use it to ensure a non-empty, predictable seed from the start.

### 3. `isFallbackAvatarSeed` guards backend propagation
When pushing to the backend, we skip `avatar_url` for members whose local snapshot has only the deterministic fallback. This prevents Device B from overwriting Device A's real seed (`'alice'`) in the backend with a generated `${ownerId}:${ownerName}` string.

### 4. `syncTeamSpaces` merge prefers real seeds
The merge now distinguishes real seeds from generated fallbacks. If both remote and local have seeds, the non-fallback wins. Only if both are fallback does it fall back to whichever is available. This ensures the real seed (once propagated) is never displaced by a stale fallback.

### Cross-device lifecycle (after fix):

| Step | Device A (owner) | Device B (joiner) |
|------|-----------------|-------------------|
| Space created | Snapshot: `avatarUrl = 'alice'` | — |
| QR scanned | — | Snapshot: owner `avatarUrl = fallbackSeed(ownerId, ownerName)` |
| Both show in today.tsx (before sync) | Owner sees joiner correctly | Joiner sees owner with fallback avatar |
| choose.tsx syncTeamSpaces | Pushes `'alice'` (real seed) for owner | Pushes nothing for owner (fallback not pushed) |
| After pull | — | Gets `'alice'` for owner from backend |
| today.tsx (after sync) | Correct | Owner now shows correct avatar `'alice'` |

---

## Validation Results

### Typecheck
```
npm run typecheck → tsc --noEmit
Exit code: 0 (clean)
```

### Tests
```
npm test → sucrase-node lib/__tests__/*.test.ts
37 shiftEngine tests:    PASS
15 timeclock tests:      PASS
4  strategyEngine tests: PASS
1  timeAccountEngine:    PASS
Total: 57/57 PASS, 0 failed
```

### Manual Verification Checklist (2-device test)

Pre-condition: Two devices (A = space owner, B = joiner), both on current build.

1. **[Device A]** Create space → note displayName and resulting avatar shown in profile header
2. **[Device B]** Scan QR invite → join space
3. **[Device B → today.tsx]** Before syncing: owner appears as colleague → avatar may differ from A's self-view (expected — uses fallback seed before sync)
4. **[Device B → choose.tsx]** Navigate to choose.tsx → syncTeamSpaces runs → spaces saved
5. **[Device B → today.tsx]** Navigate back to today.tsx → owner now shows consistent avatar matching Device A
6. **[Both devices]** Verify: colleague name matches the avatar identity (no name-avatar mismatches)
7. **[Device A → today.tsx]** Verify: joiner's avatar is consistent with how joiner appears on Device B's own profile header
8. **[Ghost test]** Create a ghost on Device A → ghost shows same avatar in the ghost picker modal AND in the ghost present row

---

## Remaining Risks

| Risk | Severity | Notes |
|------|----------|-------|
| One-time avatar change on Device B after sync | LOW | Expected behavior: fallback avatar → real avatar transition is acceptable UX |
| Pre-existing stale snapshots (empty `avatarUrl: ''`) in production AsyncStorage | LOW | Will be resolved on next `syncTeamSpaces` (choose.tsx). `migrateSpace` fix also handles on-read migration. |
| Users who have not synced since fix deployment | LOW | First visit to choose.tsx triggers sync and resolves |
| Legacy URL avatarUrls in production that weren't previously extracted | LOW | `resolveAvatarSeed` now extracts them via `extractSeedFromLegacyUrl` — generates correct seed from legacy URLs |

---

READY_FOR_READ_LATEST: YES

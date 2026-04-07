# Root-Cause Fix — Avatar Cross-Device Identity Consistency
**Date:** 2026-04-02 (filed 2026-04-01 iteration 3)
**Severity:** P0 / release-blocking
**Status:** COMPLETE — tsc exit 0, 84/84 tests PASS (57 existing + 27 new)

---

## Root Cause (Single Sentence)

The QR invite payload (`qr.tsx:88`) did not include the host's `ownerAvatarUrl`, so Device B had no way to know the host's real avatar seed at join time — it always received a generated fallback — and no amount of backend sync could fix this before the user visited `today.tsx`.

---

## Data-Flow Divergence Map

```
Step  │ Device A (Host)                         │ Device B (Guest)
──────┼─────────────────────────────────────────┼──────────────────────────────
1     │ create-profile.tsx:130                  │ (creates own profile similarly)
      │ profile.avatarUrl = "müsba"             │ profile.avatarUrl = "berta"
──────┼─────────────────────────────────────────┼
2     │ create.tsx:79                           │
      │ memberProfiles[0].avatarUrl = "müsba"   │ (not involved)
      │ ← CORRECT in owner's local storage      │
──────┼─────────────────────────────────────────┼
3     │ qr.tsx:88  ← ROOT CAUSE                 │
      │ payload = "...&ownerId=host-uuid         │
      │            &ownerName=M%C3%BCsba         │
      │            &token=..."                   │
      │ ownerAvatar MISSING from payload         │
──────┼─────────────────────────────────────────┼──────────────────────────────
4     │                                         │ join.tsx: QR scanned
      │                                         │ payload.ownerAvatarUrl = undefined
      │                                         │
5     │                                         │ importSpaceFromInvite()
      │                                         │ owner snapshot:
      │                                         │   avatarUrl = fallbackAvatarSeed(
      │                                         │     "host-uuid", "Müsba")
      │                                         │   = "host-uuid:müsba"  ← WRONG
──────┼─────────────────────────────────────────┼──────────────────────────────
6     │                                         │ choose.tsx → syncTeamSpaces
      │                                         │ If Device A hasn't synced yet:
      │                                         │   backend has no avatar_url row
      │                                         │   pull returns fallback again
      │                                         │   "host-uuid:müsba" persists
──────┼─────────────────────────────────────────┼──────────────────────────────
7     │                                         │ today.tsx → getSpaces()
      │                                         │ resolveAvatarSeed(host-uuid,
      │                                         │   "Müsba", "host-uuid:müsba")
      │                                         │ = "host-uuid:müsba"
      │                                         │ → WRONG avatar rendered ← BUG
```

**Divergence starts at Step 3**: `qr.tsx:88` — `ownerAvatar` absent from payload.

---

## Evidence (File + Line)

| File | Line | Evidence |
|------|------|----------|
| `app/(space)/qr.tsx` | 88 | QR payload string: no `ownerAvatar` parameter |
| `app/(space)/join.tsx` | 36-55 | `parseInvitePayload`: no `ownerAvatarUrl` field parsed |
| `app/(space)/join.tsx` | 141-150 | `importSpaceFromInvite` called without `ownerAvatarUrl` |
| `lib/storage.ts` | 312-319 | `importSpaceFromInvite` payload type: no `ownerAvatarUrl` field |
| `lib/storage.ts` | 367 | Owner snapshot → `fallbackAvatarSeed(...)` always used |

---

## Files Changed

| File | Change |
|------|--------|
| `app/(space)/qr.tsx` | Add `ownerAvatar` param to QR payload URL (from owner snapshot or profile.avatarUrl) |
| `app/(space)/join.tsx` | Add `ownerAvatarUrl` to `InvitePayload` interface; parse from QR URL |
| `app/(space)/join.tsx` | Pass `ownerAvatarUrl` to `importSpaceFromInvite` |
| `lib/storage.ts` | `importSpaceFromInvite`: add `ownerAvatarUrl?` field to payload type |
| `lib/storage.ts` | `importSpaceFromInvite`: use `ownerAvatarUrl` when provided; fallback when not (legacy QR) |
| `lib/storage.ts` | `importSpaceFromInvite` existing-space path: update owner snapshot if better seed is now known |
| `lib/__tests__/avatarSeed.test.ts` | NEW — 27 tests covering I1/I2/I3 invariants + E2E lifecycle |
| `package.json` | Add `avatarSeed.test.ts` to `npm test` |

---

## Why This Fix Cannot Regress Easily

### 1. The seed is transmitted at the moment of truth

The QR is generated from the space's local `memberProfiles`, which always contains the owner's real `avatarUrl` (set in `create.tsx:79` from `profile.avatarUrl`). The seed travels in-band with the QR — no network, no timing, no race condition.

### 2. Legacy QR codes are handled gracefully

Old QR codes without `ownerAvatar` produce an empty `ownerAvatarUrl`. The code checks `ownerAvatarUrl && trim().length > 0` before using it — falling back to `fallbackAvatarSeed` exactly as before. Sync will eventually correct it.

### 3. Defence-in-depth: merge + push guards still active

Even if a fallback somehow reaches local storage (e.g., from a legacy QR), the `syncTeamSpaces` merge logic (from the previous iteration) correctly promotes the real seed when Device A pushes it to the backend. The `isFallbackAvatarSeed` guards prevent fallback from overwriting real seeds in the backend.

### 4. Re-join updates stale owner snapshots

The existing-space path of `importSpaceFromInvite` now also updates the owner's snapshot if a better seed is delivered by a new QR scan (e.g., user re-joins with a fresh QR that now contains `ownerAvatar`).

### 5. Tests enforce the invariants

Three invariants are now machine-checked:
- **I1**: `resolveAvatarSeed` is deterministic for all input categories (clean seed, legacy URL, empty)
- **I2**: Real seed always outranks fallback in merge
- **I3**: No code path can downgrade real seed to fallback (tested across 10 simulated sync cycles)

---

## Test Additions + Outputs

**File:** `lib/__tests__/avatarSeed.test.ts`

```
  fallbackAvatarSeed
  ✓ produces lowercase id:name string
  ✓ is deterministic (same input → same output)
  ✓ distinguishes different ids
  ✓ distinguishes different names

  isFallbackAvatarSeed
  ✓ recognises generated fallback
  ✓ rejects real user-chosen seed
  ✓ rejects empty string as fallback (empty ≠ generated)
  ✓ rejects legacy URL as fallback

  resolveAvatarSeed – I1 determinism
  ✓ clean seed returned lowercased
  ✓ clean seed already lowercase unchanged
  ✓ legacy SVG URL → seed extracted and lowercased
  ✓ legacy SVG URL already lowercase → same result
  ✓ empty avatarUrl → fallback seed
  ✓ undefined avatarUrl → fallback seed
  ✓ whitespace-only avatarUrl → fallback seed
  ✓ never returns empty string when id+name provided

  mergeAvatarUrl – I2 real seed outranks fallback
  ✓ remote=real + existing=fallback → real wins
  ✓ remote=fallback + existing=real → real wins
  ✓ remote=real + existing=real → real wins (stable)
  ✓ remote=fallback + existing=fallback → fallback (no real seed to promote)
  ✓ second sync: remote=real replaces stored fallback

  mergeAvatarUrl – I3 no downgrade of real seed
  ✓ remote=empty + existing=real → real preserved
  ✓ remote=fallback + existing=real → real preserved (no downgrade)
  ✓ multiple merge cycles with real seed stay stable

  E2E: host-join-sync avatar seed lifecycle
  ✓ R2 QR: guest receives real seed immediately via ownerAvatarUrl
  ✓ Legacy QR (no ownerAvatarUrl): guest falls back then sync corrects it
  ✓ sync is idempotent: multiple sync cycles keep real seed stable

  Ergebnis: 27 bestanden, 0 fehlgeschlagen
```

**Total: 84/84 tests PASS (57 existing + 27 new)**

---

## Manual Repro Before/After Table

Repro: Host creates profile "Müsba" (seed = `"müsba"`), creates space, shows QR. Guest scans QR, joins, goes to "Meine Shiftpals".

| Step | Before Fix | After Fix |
|------|-----------|-----------|
| Host creates space | `memberProfiles[0].avatarUrl = "müsba"` | Same |
| QR payload | `...&ownerId=…&ownerName=M%C3%BCsba&token=…` | `...&ownerAvatar=m%C3%BCsba&token=…` |
| Guest `importSpaceFromInvite` | owner `avatarUrl = "host-uuid:müsba"` (fallback) | owner `avatarUrl = "müsba"` (real) |
| Guest `today.tsx` (before any sync) | Avatar for `"host-uuid:müsba"` ← **WRONG** | Avatar for `"müsba"` ← **CORRECT** |
| Guest `today.tsx` (after sync, Device A synced) | Avatar for `"müsba"` ← correct | Avatar for `"müsba"` ← correct |
| Guest `today.tsx` (after sync, Device A NOT yet synced) | Avatar for `"host-uuid:müsba"` ← **still wrong** | Avatar for `"müsba"` ← **CORRECT** |

---

## Manual 2-Device Verification Checklist

**Prerequisites:** Two physical devices (or simulators), same build with this fix deployed.

1. **[Device A]** Create profile with a short name, e.g. "Torvi" (seed = `"torvi"`)
2. **[Device A]** Create space "TestSpace"
3. **[Device A]** Open QR screen — note the QR is generated
4. **[Device B]** Create profile with a different name, e.g. "Kelda"
5. **[Device B]** Scan QR code from Device A
6. **[Device B]** Confirm join → app navigates to choose.tsx
7. **[Device B → today.tsx IMMEDIATELY]** — Before any sync completes:
   - Host "Torvi" appears as colleague (if matching shift)
   - Host's avatar should be the avatar for seed `"torvi"` (NOT a generic fallback circle)
   - ✅ Expected: same avatar as Device A shows for "Torvi" in profile header
8. **[Device A → today.tsx]** — Guest "Kelda" appears (if matching shift):
   - Avatar for seed `"kelda"` ← matches what Device B shows for own profile header
9. **[Both devices → name/avatar pairs]**: Name = correct, Avatar = correct, no mismatches
10. **[Run multiple choose.tsx syncs]**: Navigate back and forth — avatar stays stable, never changes to a fallback circle

**Expected QR URL format (verify in debug/dev mode):**
```
yasa://join?spaceId=<id>&name=TestSpace&ownerId=<uuid>&ownerName=Torvi&ownerAvatar=torvi&token=<token>
```

---

## Remaining Risks

| Risk | Severity | Notes |
|------|----------|-------|
| QR codes generated BEFORE this fix (already distributed) | LOW | No `ownerAvatar` param → falls back to sync-based resolution (legacy path active) |
| `ownerAvatar` in QR URL with special characters | VERY LOW | Seed is always `trim().toLowerCase()` of display name — no special chars beyond Unicode; `encodeURIComponent` handles correctly |
| Avatar change on existing installs if owner snapshot had fallback | ACCEPTABLE | After guest re-scans a new QR or syncs, avatar corrects itself — expected behavior |

READY_FOR_READ_LATEST: YES

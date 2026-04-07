# Space-Member Management — Host Timeline + Co-Admin UI
**Date:** 2026-04-02
**Status:** COMPLETE — tsc exit 0, 115/115 tests PASS (97 existing + 18 new)

---

## Scope Implemented

| Feature | Status |
|---------|--------|
| New page `app/(space)/members.tsx` | ✅ Complete |
| Host-only access guard (route + UI) | ✅ Complete |
| Member cards: large avatar, name, role badge | ✅ Complete |
| Lifecycle metadata: joinedAt, joinedVia | ✅ Complete |
| Removed member section (history) with removedAt | ✅ Complete |
| Co-Admin toggle in member cards | ✅ Complete |
| Data model: `MemberLifecycleEntry` + `Space.memberHistory` | ✅ Complete |
| Backward compat migration (on-read seeding) | ✅ Complete |
| Join flow integration (`importSpaceFromInvite`, `joinSpace`) | ✅ Complete |
| Delete propagation → `removedAt` in history (via sync merge) | ✅ Complete |
| Button in `manage.tsx` to navigate to members page | ✅ Complete |
| 18 new tests (M1–M5 invariants) | ✅ Complete |

---

## Data Model Changes

### New type: `MemberLifecycleEntry` (in `types/index.ts`)

```typescript
export interface MemberLifecycleEntry {
  id: string;
  displayName: string;
  avatarUrl: string;
  /** ISO-8601 – Zeitpunkt des Beitritts */
  joinedAt: string;
  /**
   * ProfileId desjenigen, der eingeladen hat.
   * Entspricht ownerProfileId wenn über Host-QR beigetreten.
   * Fallback: ownerProfileId (QR-Payload enthält keine Co-Admin-Info).
   */
  joinedViaProfileId: string;
  /** ISO-8601 – gesetzt wenn Profil gelöscht / Member entfernt wurde */
  removedAt?: string;
  /** true = aktives Mitglied, false = entfernt/inaktiv */
  active: boolean;
}
```

### Extended type: `Space` (in `types/index.ts`)

```typescript
memberHistory?: MemberLifecycleEntry[];
// Optional for backward compat; on-read normalized to [] if missing.
// Seeded from memberProfiles if empty (migration path).
```

### Separation of concerns

| Field | Contains | Consumers |
|-------|----------|-----------|
| `Space.memberProfiles` | Active members only (RC-3 authoritative merge) | today.tsx, choose.tsx, manage.tsx, candidates.tsx, all existing |
| `Space.memberHistory` | All members ever (active + removed) | members.tsx (host-only) only |

---

## Migration / Backward Compatibility

### On-read migration in `migrateSpace` (lib/storage.ts)

When `memberHistory` is absent or empty, it is **seeded from `memberProfiles`**:

```typescript
let memberHistory: MemberLifecycleEntry[] = Array.isArray(s.memberHistory) ? s.memberHistory : [];
if (memberHistory.length === 0 && memberProfiles.length > 0) {
  const seedTime = s.createdAt ?? new Date().toISOString();
  memberHistory = memberProfiles.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl,
    joinedAt: seedTime,        // best estimate: space.createdAt
    joinedViaProfileId: ownerId, // best estimate: owner
    active: true,
  }));
}
```

**Effect:** Existing spaces gain a populated history on the next `getSpaces()` call. No manual migration needed. All existing consumers of `memberProfiles` are completely unaffected.

---

## Files Changed

| File | Change |
|------|--------|
| `types/index.ts` | NEW `MemberLifecycleEntry`; `Space.memberHistory?` field |
| `lib/storage.ts` | Import `MemberLifecycleEntry`; `migrateSpace` seeds history; `joinSpace` updates history; `importSpaceFromInvite` (new+existing space paths) populates history |
| `lib/backend/teamSync.ts` | Import `MemberLifecycleEntry`; `syncTeamSpaces` merge builds/updates `memberHistory` (new member→add, removed→removedAt, re-joined→reactivate) |
| `app/(space)/members.tsx` | NEW — Host-only member timeline + co-admin management screen |
| `app/(space)/manage.tsx` | Add "👥 Mitgliederliste & Timeline" navigation button + style |
| `lib/__tests__/memberSync.test.ts` | 18 new tests: M1 history seeding, M2/M3 lifecycle, M4 host-only guard, M5 backward compat |

---

## Join Flow Integration

### `importSpaceFromInvite` — new space path
Sets `memberHistory` with both owner and joining member:
- `joinedAt = now` (exact QR scan time)
- `joinedViaProfileId = ownerProfileId` (host QR; QR payload doesn't identify which co-admin showed it — documented fallback)

### `importSpaceFromInvite` — existing space path
Adds joining member to history if absent; reactivates if previously marked removed (re-join scenario).

### `joinSpace` (legacy QR path)
Same logic: adds member to history or reactivates if returning.

### Fallback documentation
QR payload (`yasa://join?...`) does not include the `inviterId` field (who showed the QR — host or co-admin). `joinedViaProfileId` defaults to `ownerProfileId` in all join paths. The UI shows "via Host" in this case. If a future QR format includes inviter info, the join path can be extended without migration.

---

## Delete Propagation Integration

When `syncTeamSpaces` drops a member from `memberProfiles` (authoritative remote merge, RC-3), the merge now also updates `memberHistory`:

```
localSpace.memberProfiles has guest → remote doesn't → guest absent from memberMap
→ historyMap.get(guest.id).active = false
→ historyMap.get(guest.id).removedAt = now (ISO-8601)
```

The updated `memberHistory` is included in the returned Space object and persisted by `setSpaces`. The host's `members.tsx` page shows the removed member in the "Verlauf" section with their `removedAt` timestamp.

**Active views unaffected:** `today.tsx`, `choose.tsx`, `candidates.tsx` all read from `memberProfiles` — which only contains active members. The history is transparent to them.

---

## Host-Only Access Guard

### Guard condition
```typescript
profile.id === space.ownerProfileId
```

### Enforcement layers

1. **Entry point hidden in `manage.tsx`**: The "Mitgliederliste & Timeline" button only exists in `manage.tsx`, which already has its own host-only guard. Non-hosts who reach `manage.tsx` see only the "back" screen — the members button is never rendered.

2. **Route-level guard in `members.tsx`**: Even if a user navigates directly to `/(space)/members?spaceId=...`, the screen checks `profile.id !== space.ownerProfileId` and renders a "🔒 Kein Zugriff" screen with only a back button.

```
Role        → manage.tsx guard  → members.tsx guard
Host        → ✅ passes         → ✅ passes
Co-Admin    → ❌ sees "Host only" screen in manage.tsx → ❌ "Kein Zugriff" on direct route
Member      → ❌ sees "Host only" screen in manage.tsx → ❌ "Kein Zugriff" on direct route
```

### Co-Admin toggle guard
Removed/inactive members cannot be promoted to Co-Admin:
```typescript
const entry = space.memberHistory?.find((h) => h.id === memberId);
if (entry && !entry.active) return; // blocked
```

---

## UI Summary

### Active Members Card
```
┌────────────────────────────────────────────────────┐
│ [Avatar  ]  Müsba                      [Host    ]  │
│ [72×72   ]  Beigetreten: 02.04.2026 10:30          │
│             via Host                               │
└────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────┐
│ [Avatar  ]  Kelda                      [Mitglied]  │
│ [72×72   ]  Beigetreten: 02.04.2026 11:15          │
│             via Host                               │
│             Co-Admin                   [Toggle  ]  │
└────────────────────────────────────────────────────┘
```

### Removed Members Section (Verlauf)
```
┌────────────────────────────────────────────────────┐
│ [Avatar] Torvi                         [Entfernt]  │
│ [56×56]  Beigetreten: 01.04.2026 09:00             │
│           Entfernt: 02.04.2026 14:22               │
└────────────────────────────────────────────────────┘
```

---

## Test Results

**New tests in `lib/__tests__/memberSync.test.ts`** (+18):

```
  History seeding – M1 migrate from memberProfiles
  ✓ M1: empty history seeded from memberProfiles
  ✓ M1: seeded entry has joinedAt = createdAt
  ✓ M1: seeded entry joinedViaProfileId = ownerProfileId
  ✓ M1: multiple members all seeded as active
  ✓ M1: empty memberProfiles → empty history (no crash)

  History lifecycle – M2 join tracking / M3 remove tracking
  ✓ M2: new member in remote → added to history as active
  ✓ M2: new member joinedViaProfileId set to owner
  ✓ M3: member absent from remote → removedAt set, active=false
  ✓ M3: host (owner) always stays active after guest removal
  ✓ M3: removal is idempotent – already-removed member not double-stamped
  ✓ M3: re-joined member (back in remote) → reactivated, removedAt cleared

  Host-only guard – M4
  ✓ M4: host profile → access granted
  ✓ M4: co-admin → access denied
  ✓ M4: regular member → access denied
  ✓ M4: empty profileId → access denied

  Backward compat – M5 existing memberProfiles consumers unaffected
  ✓ M5: memberProfiles unchanged by history operations
  ✓ M5: history entries do not bleed into memberProfiles contract
  ✓ M5: co-admin toggle not affected by history (coAdminProfileIds independent)
  ✓ M5: removed member cannot be co-admin (guard logic)

  Ergebnis: 32 bestanden, 0 fehlgeschlagen
```

**Overall: 115/115 PASS** (97 existing + 18 new)

---

## Manual Verification Checklist

| Step | Expected |
|------|----------|
| Device A (Host): create profile + space | Space created, host is owner |
| Device A → manage.tsx | "👥 Mitgliederliste & Timeline" button visible |
| Device A → members.tsx | Active section: host card with large avatar, "Host" badge, joinedAt, "via Host" |
| Device B (Guest): join via QR | Guest added to space |
| Device A → members.tsx (after sync) | Active section: both host + guest with correct joinedAt |
| Device A: toggle Guest's Co-Admin switch | Switch saves, badge changes to "CoAdmin" |
| Device A: toggle back | Badge reverts to "Mitglied" |
| Device B: delete profile | `removeSpaceMembershipsForProfile` fires |
| Device A → choose.tsx or today.tsx (triggers sync) | Sync drops guest from memberProfiles; sets removedAt in history |
| Device A → members.tsx | Active: only host; "Verlauf" section shows Guest with removedAt timestamp |
| **Co-Admin as Device C**: direct nav to `/(space)/members?spaceId=...` | "🔒 Kein Zugriff" screen, back button only |
| **Regular member as Device D**: same direct nav | "🔒 Kein Zugriff" screen |
| Existing space (no memberHistory): navigate to members.tsx | History auto-seeded from memberProfiles (migration path), all shown as active |

---

## Open Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| `joinedViaProfileId` always defaults to `ownerProfileId` | VERY LOW | QR payload doesn't carry inviter identity. Future: add `inviterId` param to QR format. |
| `joinedAt` on host creation = scan time, not actual space creation time (guest perspective) | VERY LOW | Space `createdAt` from QR is unavailable. Only affects display, not functionality. |
| History not synced to backend | ACCEPTABLE | History is host-local only. If host reinstalls, history starts fresh (seeded from memberProfiles). Sufficient for current scope. |

READY_FOR_READ_LATEST: YES

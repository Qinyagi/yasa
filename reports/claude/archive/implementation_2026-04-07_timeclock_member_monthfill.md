# Timeclock Member Parity + Current-Month Backfill
**Date:** 2026-04-07
**Status:** COMPLETE — tsc exit 0, 186 tests PASS (3 new B-tests)

---

## Part 1 — Member Parity Bug Fix

### Symptom

Auto-placeholder stamping (`source: 'auto_placeholder'`) appeared in the Host's
timeclock event list after opening the app, but was completely absent on Member
devices running the same APK, even when both profiles had shift plans with the
same shift pattern.

### Root Cause

**File:** `lib/storage.ts`, function `getShiftForDate`

```typescript
// BEFORE — only looks in pre-generated entries array
export async function getShiftForDate(
  profileId: string,
  dateISO: string
): Promise<ShiftType | null> {
  const overrides = await getShiftOverrides(profileId);
  if (dateISO in overrides) return overrides[dateISO] ?? null;
  const plan = await getShiftPlan(profileId);
  if (!plan) return null;
  const entry = plan.entries.find((e) => e.dateISO === dateISO);
  return entry?.code ?? null;                   // ← returns null if date not in entries
}
```

The `UserShiftPlan.entries` array is populated by `generateShiftEntries(effectiveStartISO, pattern, weeksNeeded)` which only generates entries for a forward window. The bound is:

```typescript
const forwardEndISO = addDaysISO(anchorDate, repetitions * 7 - 1);
```

With default `repetitions = 10`, `forwardEndISO = anchorDate + 69 days`. If the Member
set up their plan in January with anchorDate = January 15, entries only cover through
March 25. April dates are beyond `generatedUntilISO` and absent from `entries`.

**Why this affects Members more than Hosts:**

| Device | Plan setup | `generatedUntilISO` | Recent past dates in entries? |
|--------|-----------|---------------------|-------------------------------|
| Host | Re-saved plan recently (settings tweak, etc.) | Covers current month | ✅ Yes → autoStamp works |
| Member | Set up once months ago, never re-saved | Only through Feb/Mar 2026 | ❌ No → autoStamp skips |

The `autoStampMissedShifts` function calls `getShiftForDate` → receives `null` → silently skips every day in the lookback → returns 0 → no placeholders created for Member.

### Fix

```typescript
// AFTER — two-stage lookup with cycle-formula fallback
export async function getShiftForDate(
  profileId: string,
  dateISO: string
): Promise<ShiftType | null> {
  const overrides = await getShiftOverrides(profileId);
  if (dateISO in overrides) return overrides[dateISO] ?? null;
  const plan = await getShiftPlan(profileId);
  if (!plan) return null;
  // Fast path: pre-generated entries (O(n) scan)
  const entry = plan.entries.find((e) => e.dateISO === dateISO);
  if (entry !== undefined) return entry.code;
  // Fallback: cycle arithmetic — handles dates outside generatedUntilISO window
  return shiftCodeAtDate(plan.startDateISO, plan.pattern, dateISO);
}
```

`shiftCodeAtDate` is already imported in `storage.ts` from `./shiftEngine`:

```typescript
import { diffDaysUTC, shiftCodeAtDate } from './shiftEngine';
```

The function:
```typescript
export function shiftCodeAtDate(startISO, pattern, targetISO): ShiftType | null {
  if (!pattern.length) return null;
  const diff = diffDaysUTC(startISO, targetISO);
  if (Number.isNaN(diff)) return null;
  if (diff < 0) return null;                       // date before plan start → null ✓
  return pattern[diff % pattern.length];           // cycle wrap ✓
}
```

**Safety guarantees of the fallback:**
- Date before `plan.startDateISO`: diff < 0 → null (correct, no shift data for that period)
- Ghost plans (pattern = []): null (ghost entries use entries-only, no pattern)
- Override check is still first (unchanged)
- If entry IS in `entries`: fast path wins, fallback never reached

**Scope of improvement:** This fix benefits ALL callers of `getShiftForDate`:
- `autoStampMissedShifts` — the primary beneficiary
- `detectStampPrompt` in `index.tsx` (today/yesterday popup) — also more robust for Members
- `timeclock.tsx loadData` today/yesterday shift detection — same

---

## Part 2 — Current-Month Backfill

### Change

Replaced the fixed 7-day lookback constant with a dynamic current-month bound:

```typescript
// BEFORE
export const AUTOSTAMP_LOOKBACK_DAYS = 7;
for (let daysBack = 1; daysBack <= AUTOSTAMP_LOOKBACK_DAYS; daysBack++) {

// AFTER
// AUTOSTAMP_LOOKBACK_DAYS removed
const daysToCheck = now.getDate() - 1;  // days elapsed since month start
for (let daysBack = 1; daysBack <= daysToCheck; daysBack++) {
```

### Date Computation

```typescript
const date = new Date(
  now.getFullYear(),
  now.getMonth(),
  now.getDate() - daysBack   // minimum = now.getDate() - (now.getDate() - 1) = 1 → never negative
);
```

Since `daysBack` max = `now.getDate() - 1`, the minimum day value in the Date constructor
is always 1 — no month-wrap, no JavaScript Date day=0 (previous month last day) edge case.

### Boundary Behaviour

| `now` date | `daysToCheck` | Days checked | Notes |
|------------|---------------|--------------|-------|
| April 1 | 0 | none | First of month: no cross-month bleed |
| April 4 | 3 | April 1, 2, 3 | All current-month history |
| April 30 | 29 | April 1–29 | Full month except today |
| May 1 | 0 | none | Clean month boundary |

### Removed Export

`AUTOSTAMP_LOOKBACK_DAYS` was exported from `autoStamp.ts` and referenced in tests.
It is removed in this iteration. Tests updated accordingly.

---

## All Files Changed

| File | Change |
|------|--------|
| `lib/storage.ts` | `getShiftForDate` — added `shiftCodeAtDate` fallback (2 lines) |
| `lib/autoStamp.ts` | Removed `AUTOSTAMP_LOOKBACK_DAYS`; loop bound `now.getDate() - 1`; updated JSDoc |
| `lib/__tests__/timeclock.test.ts` | Removed `AUTOSTAMP_LOOKBACK_DAYS` import + constant test; added B1, B2, B3 |

---

## Tests Added

### B1 — First day of month → 0 events (month boundary)

```typescript
// nowOverride = April 1 at 18:00 → getDate()=1 → daysToCheck=0
// Even with F shift on March 31: loop never runs → 0 events
```

### B2 — Mid-month all days covered

```typescript
// nowOverride = April 4 at 18:00 → daysToCheck=3
// F shift on April 1, 2, 3 → 3 × 2 = 6 events
```

### B3 — Member parity via shiftCodeAtDate fallback

```typescript
// Sparse plan: startDateISO='2026-01-01', pattern=['F'],
// entries=[{dateISO:'2026-01-01', code:'F'}] (only one entry),
// generatedUntilISO='2026-01-07' (intentionally stale)
//
// For '2026-04-03': entries.find → undefined
//                   shiftCodeAtDate('2026-01-01', ['F'], '2026-04-03')
//                   diff = 92, 92 % 1 = 0 → 'F'
// nowOverride = April 4 18:00 → daysToCheck=3 → April 1-3 → 6 events
```

### Existing tests still PASS

All A1–A8 tests pass unchanged because:
- `nowOverride = new Date(2026, 3, 4, 18, 0, 0)` → April 4 → `daysToCheck = 3`
- All test dates (April 2, April 3) are within the 3-day range ✓
- Cutoff logic, idempotency, anomaly skip — all unchanged

---

## Test Results

```
autoStampMissedShifts suite (27 total):
  ✓ AUTOSTAMP_EXTRA_GRACE_HOURS ist 2
  ✓ G7–G10: getShiftForDate (override + plan paths)
  ✓ G11–G15: reminder, day-changes, compaction, strategy
  ✓ A1–A8: core autostamp scenarios
  ✓ B1: First day of month → 0 lookback
  ✓ B2: Monatsmitte → alle Tage seit Monatsanfang
  ✓ B3: Member-Parität – shiftCodeAtDate fallback

Total suite: 186 PASS, 0 failed
tsc --noEmit: exit 0
```

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| `shiftCodeAtDate` fallback returns wrong code | LOW | `shiftCodeAtDate` is the single source of truth for cycle arithmetic, used by calendar.tsx and today.tsx debug already |
| Entry in `entries` vs. fallback disagrees | IMPOSSIBLE | Fast path wins for entries; fallback only reached when entry is absent |
| Month backfill > 7 days creates many events | LOW | Still bounded to current month; first-day guard prevents cross-month |
| Ghost plan broken by fallback | NONE | Ghost pattern=[] → `shiftCodeAtDate` returns null; ghost entries path unchanged |

---

## Related Files

- `lib/shiftEngine.ts` — `shiftCodeAtDate` source (unchanged)
- `lib/autoStamp.ts` — autoStamp function (month backfill)
- `lib/storage.ts` — `getShiftForDate` fix
- Previous: `archive/implementation_2026-04-04_timeclock_autostamp.md`

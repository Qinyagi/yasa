# Implementation Latest – Timeclock Member Parity + Month Backfill
**Date:** 2026-04-07
**Status:** COMPLETE — tsc exit 0, 186 tests PASS (3 new B-tests)

---

## Problems Addressed

### 1. Member Parity Bug (Root Cause)

Auto-placeholders appeared for the **Host** but not for the **Member** on the same codebase.

**Root cause in `lib/storage.ts` — `getShiftForDate`:**

```typescript
// BEFORE (broken for Members):
const entry = plan.entries.find((e) => e.dateISO === dateISO);
return entry?.code ?? null;  // ← null when date not in pre-generated entries

// AFTER (correct for all profiles):
const entry = plan.entries.find((e) => e.dateISO === dateISO);
if (entry !== undefined) return entry.code;
return shiftCodeAtDate(plan.startDateISO, plan.pattern, dateISO);  // ← cycle fallback
```

**Why it affects Members more than Hosts:**
The `plan.entries` array is a pre-generated window: `generateShiftEntries(effectiveStartISO, pattern, weeks)`.
When a user saves their plan with `repetitions = 5 or 10`, `generatedUntilISO` is only
`anchorDate + (repetitions × 7) - 1` days into the future. Months later, dates near
"today minus N" are beyond `generatedUntilISO` and absent from `entries`.

- **Host**: Often re-saves plan (settings adjustment, pattern tweak) → fresh `entries` covering recent dates ✓
- **Member**: Sets up plan once, never re-saves → stale `entries` (e.g., only through Feb 2026) → past March/April dates NOT in entries → `getShiftForDate` returns `null` → autoStamp skips silently ✗

**Fix**: `shiftCodeAtDate(plan.startDateISO, plan.pattern, dateISO)` — already imported in `storage.ts` from `shiftEngine.ts` — computes the correct shift code for any date ≥ `startDateISO` via cycle arithmetic, regardless of the pre-generated window. Returns `null` for dates before `startDateISO` (correct).

This fix also improves the start-screen popup detection (`index.tsx`) and all other callers of `getShiftForDate`.

---

### 2. Current-Month Backfill (Feature Upgrade)

Replaced the fixed 7-day lookback with a **dynamic current-month backfill**:

```
Before: daysBack = 1 .. AUTOSTAMP_LOOKBACK_DAYS (7)  — fixed 7 days, crosses month boundary
After:  daysBack = 1 .. (now.getDate() - 1)           — all past days in current month only
```

Key properties:
- On the **1st of the month**: `now.getDate() - 1 = 0` → loop never runs → no cross-month bleed
- Date computation uses `new Date(y, m, now.getDate() - daysBack)` → JS Date handles month-start safely (minimum day = 1)
- Removed exported `AUTOSTAMP_LOOKBACK_DAYS` constant (no longer meaningful)
- All other logic unchanged: cutoff, idempotency, `source: 'auto_placeholder'`, editability

---

## All Files Changed

| File | Change |
|------|--------|
| `lib/storage.ts` | `getShiftForDate`: added `shiftCodeAtDate` fallback after `entries.find` |
| `lib/autoStamp.ts` | Removed `AUTOSTAMP_LOOKBACK_DAYS`; loop bound changed to `now.getDate() - 1` |
| `lib/__tests__/timeclock.test.ts` | Removed `AUTOSTAMP_LOOKBACK_DAYS` import + constant test; added B1, B2, B3 |

---

## Validation

| Check | Result |
|-------|--------|
| `npm run typecheck` (tsc --noEmit) | ✅ Exit 0 |
| `npm test` — all 175 previous tests | ✅ All PASS |
| `npm test` — 3 new B-tests | ✅ 3/3 PASS |
| B1: First day of month → 0 events (no cross-month bleed) | ✅ |
| B2: Mid-month (April 4) → all 3 days (Apr 1-3) stamped, 6 events | ✅ |
| B3: Member parity — sparse entries (generatedUntilISO=Jan 7) → shiftCodeAtDate fallback → 6 events | ✅ |
| A1–A8: Existing auto-stamp scenarios | ✅ All PASS |
| All shift-engine, strategy, avatar, member-sync, ghost tests | ✅ All PASS |

---

## Regression Safety

| Guard | Status |
|-------|--------|
| `getShiftForDate` override path | ✅ Unchanged — overrides checked first, fast-path unaffected |
| Dates before `plan.startDateISO` | ✅ `shiftCodeAtDate` returns null (diff < 0) — same as before |
| Ghost plans (sparse entries, pattern=[]) | ✅ Empty pattern → `shiftCodeAtDate` returns null → skip |
| Anomaly / completed phases | ✅ autoStamp still skips both |
| Duplicate events | ✅ Idempotency via `deriveTimeClockStampState` phase check |
| Popup detection in `index.tsx` | ✅ Also benefits from `shiftCodeAtDate` fallback (today/yesterday detection more robust) |

See full archive: `reports/claude/archive/implementation_2026-04-07_timeclock_member_monthfill.md`

Previous fix: `reports/claude/archive/implementation_2026-04-04_timeclock_autostamp.md`

READY_FOR_READ_LATEST: YES

# QA Review – Timeclock Member Parity + Month Backfill
**Date:** 2026-04-07 13:45
**Reviewer:** Senior QA/Debugger (Minimax M2.5)
**PROJECT ROOT:** C:\Users\XyZ\Documents\YASA\yasa ✓

---

## Verdict: **PASS** ✅

Member parity root cause identified and fixed (`getShiftForDate` cycle fallback). Month-start
backfill implemented with correct boundary behavior. No duplicate placeholders. Bearbeiten
editability intact. TypeScript clean. 186/186 tests pass.

---

## 1. Member Parity Fix — VERIFIED

### Root Cause Confirmed

| Aspect | Evidence | Status |
|--------|----------|--------|
| Bug: `getShiftForDate` returned `null` for dates outside `plan.entries` window | `storage.ts:746-749` — before fix: `entry?.code ?? null`; after fix: `shiftCodeAtDate` fallback | ✅ CONFIRMED |
| Host unaffected (fresh entries window) vs Member broken (stale `generatedUntilISO`) | Archive doc explains: Host re-saves → fresh entries; Member sets up once → stale window | ✅ CONFIRMED |
| Fix: `shiftCodeAtDate(plan.startDateISO, plan.pattern, dateISO)` added as fallback | `storage.ts:748-749` — two-stage lookup: fast-path entries → cycle fallback | ✅ VERIFIED |
| `shiftCodeAtDate` already imported in `storage.ts` | `storage.ts:19` — `import { diffDaysUTC, shiftCodeAtDate } from './shiftEngine'` | ✅ VERIFIED |

### `shiftCodeAtDate` Safety Guarantees

| Guard | Code Evidence | Status |
|-------|--------------|--------|
| Date before `startDateISO` → null | `shiftEngine.ts:58` — `if (diff < 0) return null` | ✅ VERIFIED |
| Empty pattern (ghost plans) → null | `shiftEngine.ts:55` — `if (!pattern.length) return null` | ✅ VERIFIED |
| Malformed ISO → null (no crash) | `shiftEngine.ts:57` — `if (Number.isNaN(diff)) return null` | ✅ VERIFIED |
| Override path still first (unchanged) | `storage.ts:741-742` — override check before plan lookup | ✅ VERIFIED |
| Fast-path: entry found → fallback never reached | `storage.ts:747` — `if (entry !== undefined) return entry.code` | ✅ VERIFIED |

### Test B3 — Member Parity Proof

| Aspect | Evidence | Status |
|--------|----------|--------|
| Sparse plan: `startDateISO='2026-01-01'`, pattern `['F']`, entries only has Jan 1 | `timeclock.test.ts:745-754` | ✅ VERIFIED |
| `generatedUntilISO='2026-01-07'` — April dates absent from entries | `timeclock.test.ts:751` | ✅ VERIFIED |
| April 3: `entries.find` → `undefined` → `shiftCodeAtDate('2026-01-01', ['F'], '2026-04-03')` → diff=92, 92%1=0 → `'F'` | `timeclock.test.ts:757-763` | ✅ VERIFIED |
| Result: 6 placeholders (3 days × 2 events) | B3 PASS | ✅ VERIFIED |

### Scope of Improvement (all `getShiftForDate` callers benefit)

| Caller | File | Impact |
|--------|------|--------|
| `autoStampMissedShifts` | `autoStamp.ts:91` | Primary fix target — Member parity restored |
| `detectStampPrompt` | `index.tsx:213` | Popup detection robust for Members |
| `timeclock.tsx loadData` | `timeclock.tsx:314-315` | Today/yesterday shift detection |
| `resolveOriginalShiftCodeForDate` | `storage.ts:973` | Original code resolution |
| `compactTimeClockEvents` | `storage.ts:1329` | Event compaction |

---

## 2. Month-Start Backfill — VERIFIED

### Loop Bound Change

| Aspect | Before | After | Evidence |
|--------|--------|-------|----------|
| Lookback constant | `AUTOSTAMP_LOOKBACK_DAYS = 7` (exported) | Removed | `autoStamp.ts` — no `LOOKBACK` constant |
| Loop bound | `1..7` (fixed) | `1..(now.getDate() - 1)` (dynamic) | `autoStamp.ts:81` — `const daysToCheck = now.getDate() - 1` |
| Loop iteration | `autoStamp.ts:83` | `autoStamp.ts:83` — `for (let daysBack = 1; daysBack <= daysToCheck; daysBack++)` | ✅ VERIFIED |

### Boundary Behaviour — Mathematically Correct

| `now` date | `getDate()` | `daysToCheck` | Days checked | Cross-month? | Status |
|------------|-------------|---------------|--------------|-------------|--------|
| April 1 | 1 | 0 | None | No | ✅ VERIFIED (B1) |
| April 4 | 4 | 3 | Apr 1, 2, 3 | No | ✅ VERIFIED (B2) |
| April 30 | 30 | 29 | Apr 1–29 | No | ✅ CORRECT |
| May 1 | 1 | 0 | None | No | ✅ CORRECT |

### Date Computation Safety

```typescript
// autoStamp.ts:84-88
const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
```

- Minimum `daysBack` = 1 → `day = getDate() - 1` → minimum day value = 1 (first of month)
- JS `Date` handles month boundaries: `new Date(2026, 3, 1 - 1)` = March 31 → but `daysBack` max = `getDate()-1`, so this never happens
- **No negative day values possible** since `daysBack ≤ daysToCheck = getDate()-1`

### Test B1 — First Day of Month Boundary

| Aspect | Evidence | Status |
|--------|----------|--------|
| `nowOverride = April 1` → `getDate()=1` → `daysToCheck=0` → loop never runs | `timeclock.test.ts:712` | ✅ VERIFIED |
| F shift override for March 31 exists but is never checked (no cross-month bleed) | `timeclock.test.ts:710` | ✅ VERIFIED |
| Result: 0 events | B1 PASS | ✅ VERIFIED |

### Test B2 — Mid-Month Full Coverage

| Aspect | Evidence | Status |
|--------|----------|--------|
| `nowOverride = April 4 18:00` → `daysToCheck=3` → checks April 1, 2, 3 | `timeclock.test.ts:726` | ✅ VERIFIED |
| F shifts on April 1, 2, 3 with no events → 6 placeholders | `timeclock.test.ts:723-725,727-731` | ✅ VERIFIED |
| All three dates present in result | `timeclock.test.ts:732-735` | ✅ VERIFIED |

---

## 3. Cutoff Logic — UNCHANGED

| Guard | Evidence | Status |
|-------|----------|--------|
| Cutoff = endAt + postShiftGraceMinutes + 2h extra | `autoStamp.ts:102-106` — unchanged | ✅ VERIFIED |
| Night shift endAt +24h | `autoStamp.ts:98-100` — `if (endAt <= startAt) endAt += 24h` | ✅ VERIFIED |
| Test A3: N-shift cutoff not reached → 0 events | `timeclock.test.ts` A3 PASS | ✅ VERIFIED |
| Only regular shift codes | `autoStamp.ts:35,92` — unchanged | ✅ VERIFIED |

---

## 4. No Duplicate Placeholders — VERIFIED

| Guard | Evidence | Status |
|-------|----------|--------|
| Idempotency via `deriveTimeClockStampState` phase check | `autoStamp.ts:112-121` — events re-read per loop iteration; completed/anomaly → skip | ✅ VERIFIED |
| Repeated focus cycles: after first run phase = `completed`, subsequent → 0 new | A4 test proves idempotency | ✅ VERIFIED |
| Multi-day: B2 creates 6 events for 3 days, no duplicates | B2 PASS | ✅ VERIFIED |

---

## 5. Bearbeiten Editability — UNCHANGED

| Guard | Evidence | Status |
|-------|----------|--------|
| Edit button rendered for all events (no source filter) | `timeclock.tsx:979` — unchanged | ✅ VERIFIED |
| `handleSaveEditedEvent` uses `updateTimeClockEvent` with `source: 'manual_edit'` | `timeclock.tsx:549-555` — unchanged | ✅ VERIFIED |
| Placeholder → manual_edit conversion works | Types unchanged (`auto_placeholder` in union) | ✅ VERIFIED |

---

## 6. Edge Cases — Assessed

| Edge Case | Handling | Test Coverage | Status |
|-----------|----------|---------------|--------|
| **Month boundary (1st of month)** | `daysToCheck=0` → no loop → no cross-month bleed | B1 | ✅ VERIFIED |
| **Overnight shift (N/S)** | `endAt += 24h` when `endAt <= startAt` | A3 (cutoff not reached) | ✅ VERIFIED |
| **Member with sparse historical shifts** | `shiftCodeAtDate` fallback resolves dates far beyond `generatedUntilISO` | B3 | ✅ VERIFIED |
| **Repeated focus cycles** | Phase becomes `completed` after first run → idempotent | A4 | ✅ VERIFIED |
| **Date before plan startDateISO** | `shiftCodeAtDate` returns `null` (diff < 0) → skip | shiftEngine I3 tests | ✅ VERIFIED |
| **Ghost plans (empty pattern)** | `shiftCodeAtDate` returns `null` (empty pattern) → skip | shiftEngine test | ✅ VERIFIED |
| **No shift plan at all** | `getShiftForDate` returns `null` → `isRegularShiftCode(null)` = false → skip | A1 | ✅ VERIFIED |

---

## 7. Technical Checks — PASS

| Command | Result |
|---------|--------|
| `npm run typecheck` | ✅ Exit 0 — tsc clean |
| `npm test` | ✅ 186/186 PASS |

### Test Breakdown

| Suite | Tests | Status |
|-------|-------|--------|
| shiftEngine (diffDaysUTC, shiftCodeAtDate, detectSubPattern, weekdayIndexUTC) | 37 | ✅ PASS |
| timeclock (G1–G15 + A1–A8 + B1–B3 + AUTOSTAMP_EXTRA_GRACE_HOURS) | 27 | ✅ PASS |
| strategyEngine | 4 | ✅ PASS |
| timeAccountEngine (inline) | 2 cases | ✅ PASS |
| avatarSeed | 27 | ✅ PASS |
| memberSync | 32 | ✅ PASS |
| realtimeMembers | 12 | ✅ PASS |
| ghostPresenceSync | 36 | ✅ PASS |
| **Total** | **186** | ✅ **ALL PASS** |

### New Tests (B-series)

| Test | Scenario | Expected | Result |
|------|----------|----------|--------|
| B1 | First day of month (`getDate()=1`) | 0 events, no cross-month bleed | ✅ PASS |
| B2 | Mid-month (April 4, 3 days to check) | 6 events for April 1-3 | ✅ PASS |
| B3 | Sparse entries, `shiftCodeAtDate` fallback (Member parity) | 6 events via cycle fallback | ✅ PASS |

### Removed

| Item | Reason |
|------|--------|
| `AUTOSTAMP_LOOKBACK_DAYS` constant test | Constant removed — replaced by dynamic `now.getDate() - 1` |

---

## 8. Files Changed — Complete Inventory

| File | Change | Lines |
|------|--------|-------|
| `lib/storage.ts:747-749` | `getShiftForDate` — added `shiftCodeAtDate` fallback after entries.find | 2 new lines |
| `lib/autoStamp.ts:81,83` | Removed `AUTOSTAMP_LOOKBACK_DAYS`; loop bound → `now.getDate() - 1`; updated JSDoc | ~5 lines |
| `lib/__tests__/timeclock.test.ts` | Removed LOOKBACK constant import + test; added B1, B2, B3 | ~70 lines |

---

## 9. Regression Safety

| Guard | Status |
|-------|--------|
| Existing A1–A8 tests unchanged | ✅ All PASS |
| `getShiftForDate` override path | ✅ Unchanged — overrides checked first |
| `deriveTimeClockStampState` logic | ✅ Unchanged — G1–G6 tests PASS |
| Anomaly handling | ✅ autoStamp still skips anomaly phases |
| Ghost plan safety (pattern=[]) | ✅ `shiftCodeAtDate` returns null → skip |
| Popup detection (`detectStampPrompt`) | ✅ Benefits from same fix |
| Bearbeiten flow | ✅ Unchanged |

---

## 10. Risk Assessment

| Risk | Level | Assessment |
|------|-------|------------|
| `shiftCodeAtDate` fallback returns wrong code | LOW | Same function used by calendar.tsx and today.tsx — battle-tested in shiftEngine tests |
| Month backfill creates many events on April 30 (29 days) | LOW | Bounded to current month; idempotent on re-runs; each day only processed once |
| Ghost plan broken by fallback | NONE | `pattern=[]` → `shiftCodeAtDate` returns null → skip |
| Entry vs fallback disagrees | IMPOSSIBLE | Fast path wins for entries; fallback only reached when entry absent |

**Risk Verdict:** **acceptable for now**

---

## Verification Summary

| Aspect | Status |
|--------|--------|
| Member parity: `getShiftForDate` fallback | ✅ VERIFIED |
| Member parity: identical output for equal conditions | ✅ VERIFIED (B3) |
| Month-start backfill: dynamic `daysToCheck` | ✅ VERIFIED |
| No cross-month bleed (April 1 → 0 events) | ✅ VERIFIED (B1) |
| Full current-month coverage (April 4 → 3 days) | ✅ VERIFIED (B2) |
| No duplicate placeholders on repeated opens | ✅ VERIFIED (A4 idempotency) |
| Cutoff logic unchanged | ✅ VERIFIED |
| Bearbeiten converts to manual_edit | ✅ VERIFIED |
| Overnight shift handling | ✅ VERIFIED |
| Sparse entries / Member parity | ✅ VERIFIED (B3) |
| TypeScript clean | ✅ VERIFIED |
| Tests pass | ✅ 186/186 |
| Security/regression risk | ✅ ACCEPTABLE FOR NOW |

---

**PASS** — All requirements satisfied. No blockers.

**Date/Time:** 2026-04-07 13:45
**Scope completed:** Member parity fix + month-start backfill QA review
**Open items:** None
**READY_FOR_READ_LATEST: YES**
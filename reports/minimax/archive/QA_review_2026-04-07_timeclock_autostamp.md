# QA Review – Timeclock Auto-Placeholder Stamping
**Date:** 2026-04-07 11:55
**Reviewer:** Senior QA + Debug Reviewer (Minimax M2.5)
**PROJECT ROOT:** C:\Users\XyZ\Documents\YASA\yasa ✓

---

## Verdict: **PASS** ✅

Auto-placeholder stamping implemented correctly. All state machine phases handled. Idempotency
verified. Editability via Bearbeiten intact. TypeScript clean. 173/173 tests pass.

---

## 1. Kommen/Gehen Visibility — VERIFIED

| Requirement | Code Evidence | Status |
|-------------|--------------|--------|
| Banner on home screen when placeholders created | `index.tsx:346-360` — `missedStampCount > 0` → `TouchableOpacity` → `router.push('/(services)/timeclock')` | ✅ VERIFIED |
| `(Platzhalter)` badge in timeclock event list | `timeclock.tsx:969-971` — `e.source === 'auto_placeholder'` → badge rendered | ✅ VERIFIED |
| autoStamp called on both entry points | `index.tsx:217` (loadCurrentContext) + `timeclock.tsx:304` (loadData) | ✅ VERIFIED |
| Banner i18n correct (singular/plural) | `index.tsx:354-356` — `missedStampCount === 1 ? singular : plural` | ✅ VERIFIED |

---

## 2. Auto Placeholder Generation After Cutoff — VERIFIED

| Requirement | Code Evidence | Status |
|-------------|--------------|--------|
| Cutoff = endAt + grace + 2h extra | `autoStamp.ts:95-99` — `endAt + postShiftGraceMinutes * 60s + AUTOSTAMP_EXTRA_GRACE_HOURS * 3600s` | ✅ VERIFIED |
| Only regular shift codes processed | `autoStamp.ts:35` — `REGULAR_SHIFT_CODES = ['F','S','N','KS','KN','T']`; `autoStamp.ts:85` — `isRegularShiftCode` guard | ✅ VERIFIED |
| Lookback = 7 days | `autoStamp.ts:27,76` — `AUTOSTAMP_LOOKBACK_DAYS = 7`; loop `daysBack = 1..7` | ✅ VERIFIED |
| Night shift endAt adjusted +24h | `autoStamp.ts:91-93` — `if (endAt <= startAt) endAt += 24h` | ✅ VERIFIED |
| `awaiting_check_in` → 2 events (Kommen+Gehen) | `autoStamp.ts:116-134` | ✅ VERIFIED |
| `awaiting_check_out` → 1 event (Gehen only) | `autoStamp.ts:135-146` | ✅ VERIFIED |
| `completed` → skip (idempotent) | `autoStamp.ts:111` | ✅ VERIFIED |
| `anomaly` → skip (no interference) | `autoStamp.ts:111` | ✅ VERIFIED |

### Default Cutoff Table (confirmed from code):

| Shift | End | Grace | Extra | Cutoff |
|-------|-----|-------|-------|--------|
| F | 14:00 | 15 min | 2 h | 16:15 |
| S | 22:00 | 15 min | 2 h | 00:15+1d |
| N | 06:00+1d | 30 min | 2 h | 08:30+1d |
| KS | 22:00 | 15 min | 2 h | 00:15+1d |
| KN | 06:00 | 30 min | 2 h | 08:30 |
| T | 16:00 | 15 min | 2 h | 18:15 |

---

## 3. Placeholder Editability via Bearbeiten — VERIFIED

| Requirement | Code Evidence | Status |
|-------------|--------------|--------|
| Edit button rendered for all events | `timeclock.tsx:979` — `onPress={() => openEditModal(e.id)}` — no source filter | ✅ VERIFIED |
| `openEditModal` loads event data | `timeclock.tsx:531-538` — finds event by id, populates edit state | ✅ VERIFIED |
| `handleSaveEditedEvent` uses `updateTimeClockEvent` | `timeclock.tsx:549` — patch with `source: 'manual_edit'` | ✅ VERIFIED |
| `updateTimeClockEvent` accepts `source` in patch type | `types/index.ts:238` — `source` union includes `auto_placeholder`; patch API includes `source` | ✅ VERIFIED |
| Placeholder source replaced with `manual_edit` on save | `timeclock.tsx:555` — `source: 'manual_edit'` | ✅ VERIFIED |

---

## 4. No Duplicate Events — VERIFIED

| Guard | Code Evidence | Status |
|-------|--------------|--------|
| Idempotency via phase check | `autoStamp.ts:105-114` — events re-read each loop; `completed`/`anomaly` skipped | ✅ VERIFIED |
| Only `addTimeClockEvent` called (never update/delete) | `autoStamp.ts:118,126,137` — all calls are `addTimeClockEvent` | ✅ VERIFIED |
| Test A4: completed → 0 new events | `timeclock.test.ts:597-618` | ✅ VERIFIED |
| Test A8: multi-day correct count (4 events, no duplicates) | `timeclock.test.ts:690-706` | ✅ VERIFIED |
| Events re-read per loop iteration | `autoStamp.ts:105` — `getTimeClockEvents` called inside for-loop | ✅ VERIFIED |

---

## 5. No Regression in Anomaly/Manual Logic — VERIFIED

| Guard | Evidence | Status |
|-------|----------|--------|
| Anomaly phases never touched | `autoStamp.ts:111` — `stampState.phase === 'anomaly'` → `continue` | ✅ VERIFIED |
| `deriveTimeClockStampState` unchanged | G1–G6 tests still pass (15/15 in timeclock suite) | ✅ VERIFIED |
| Manual stamps never overwritten | `addTimeClockEvent` is append-only; never mutates existing events | ✅ VERIFIED |
| Test A5: anomaly → 0 new events | `timeclock.test.ts:621-643` | ✅ VERIFIED |
| `detectStampPrompt` unaffected | `index.tsx:213` — called before autoStamp, no dependency | ✅ VERIFIED |
| Kommen/Gehen popup still triggers | No changes to popup detection logic (`detectStampPrompt`, popup UI) | ✅ VERIFIED |

---

## 6. Edge Cases — Assessed

| Edge Case | Handling | Status |
|-----------|----------|--------|
| **Overnight shift (N/S)** | `autoStamp.ts:91-93` — endAt += 24h when `endAt <= startAt`; Test A3 covers N-shift cutoff | ✅ VERIFIED |
| **Missed both stamps** | `awaiting_check_in` → 2 events at nominal start+end; Test A6 | ✅ VERIFIED |
| **Missed only check_out** | `awaiting_check_out` → 1 event at nominal end; Test A7 | ✅ VERIFIED |
| **Repeated app launches** | Idempotent: after first run phase = `completed`, subsequent runs skip; Test A4 | ✅ VERIFIED |
| **No shift plan for day** | `getShiftForDate` returns null → `isRegularShiftCode(null)` = false → skip; Test A1 | ✅ VERIFIED |
| **Non-regular code (R, X)** | Filtered by `isRegularShiftCode`; Test A2 | ✅ VERIFIED |
| **Cutoff not yet reached** | `now <= cutoff` → skip; Test A3 | ✅ VERIFIED |
| **7-day lookback boundary** | `AUTOSTAMP_LOOKBACK_DAYS = 7`; constant smoke test confirms | ✅ VERIFIED |

---

## 7. Technical Checks — PASS

| Command | Result |
|---------|--------|
| `npm run typecheck` | ✅ Exit 0 — tsc clean |
| `npm test` | ✅ 173/173 PASS |
| Previous tests (shift engine, timeclock G1–G15, strategy, avatar, member sync, realtime, ghost) | ✅ 163/163 PASS (no regressions) |
| New autoStamp tests (A1–A8 + 2 constants) | ✅ 10/10 PASS |

### New Test Coverage Summary

| Test | Scenario | Expected | Result |
|------|----------|----------|--------|
| Constant | `AUTOSTAMP_LOOKBACK_DAYS` === 7 | PASS | ✅ |
| Constant | `AUTOSTAMP_EXTRA_GRACE_HOURS` === 2 | PASS | ✅ |
| A1 | No shift plan | 0 events | ✅ |
| A2 | Non-regular code (R) | 0 events | ✅ |
| A3 | N-shift cutoff not reached | 0 events | ✅ |
| A4 | Phase completed | 0 new (idempotent) | ✅ |
| A5 | Phase anomaly | 0 new (no interference) | ✅ |
| A6 | Phase awaiting_check_in | 2 placeholder events | ✅ |
| A7 | Phase awaiting_check_out | 1 placeholder event | ✅ |
| A8 | 2 missed days | 4 placeholder events | ✅ |

---

## 8. Data Model Change — Backward Compatible

| Change | Impact | Status |
|--------|--------|--------|
| `TimeClockEvent.source` union extended with `'auto_placeholder'` (`types/index.ts:238`) | Additive; existing events unaffected | ✅ VERIFIED |
| New file `lib/autoStamp.ts` | No imports in existing modules (only `index.tsx`, `timeclock.tsx`) | ✅ VERIFIED |

---

## 9. Files Changed — Complete Inventory

| File | Change | Lines Touched |
|------|--------|---------------|
| `types/index.ts` | `'auto_placeholder'` added to `source` union | 1 |
| `lib/autoStamp.ts` | **NEW** — `autoStampMissedShifts`, constants, helpers | 150 |
| `app/index.tsx` | Import, state, autoStamp call, banner JSX + styles | ~40 |
| `app/(services)/timeclock.tsx` | Import, autoStamp call in loadData, `(Platzhalter)` badge + style | ~10 |
| `lib/__tests__/timeclock.test.ts` | 10 new tests in `autoStampMissedShifts` suite | ~200 |

---

## 10. Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Wrong shift code → placeholder for wrong shift | LOW | Uses `getShiftForDate` (same as popup detection); only regular codes |
| Night shift endAt miscalculation | LOW | `endAt += 24h` when `endAt <= startAt`; tested in A3 |
| Double-stamp on rapid focus cycles | NEGLIGIBLE | Phase checked before every write; `completed` → skip |
| autoStamp blocks loadData | LOW | Best-effort `try/catch` in both callers |
| Placeholder timestamps in UTC vs local | ACCEPTED | `toISOString()` of local Date — same approach as `manual_service` |
| Banner not visible after second focus | LOW | By design: once events exist, `autoStampMissedShifts` returns 0; events visible in timeclock list |

**Risk Verdict:** **acceptable for now** — purely local operation, best-effort, idempotent.

---

## Verification Summary

| Aspect | Status |
|--------|--------|
| Kommen/Gehen visibility (banner + badge) | ✅ VERIFIED |
| Auto-placeholder generation after cutoff | ✅ VERIFIED |
| Placeholder editability via Bearbeiten | ✅ VERIFIED |
| No duplicate events | ✅ VERIFIED |
| No regression in anomaly/manual logic | ✅ VERIFIED |
| Overnight shift handling | ✅ VERIFIED |
| Repeated app launch idempotency | ✅ VERIFIED |
| TypeScript clean | ✅ VERIFIED |
| Tests pass | ✅ 173/173 |
| Security risk | ✅ ACCEPTABLE — local-only, no auth impact |

---

**PASS** — All re-gate requirements satisfied. No blockers.

**Date/Time:** 2026-04-07 11:55
**Scope completed:** Timeclock auto-placeholder stamping QA review
**Open items:** None
**READY_FOR_READ_LATEST: YES**
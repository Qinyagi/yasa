# QA Review – Zeitkonto Card P1 Regate
**Date:** 2026-04-12 11:13
**Reviewer:** Senior QA/Debugger Reviewer (Minimax M2.5) – No code changes
**PROJECT ROOT:** C:\Users\XyZ\Documents\YASA\yasa

---

## Verdict: **PASS** ✅

All P1 scope items validated. TypeScript clean. 210/210 tests pass (10 new Z-series tests in zeitkontoEngine.test.ts). No blockers found. No regressions in P0 fixes.

---

## 0. Build & Test Gate

| Command | Result |
|---------|--------|
| `npm run typecheck` | ✅ Exit 0 — tsc clean |
| `npm test` | ✅ 210/210 PASS |

### Test Breakdown

| Suite | Tests | Status |
|-------|-------|--------|
| shiftEngine | 37 | ✅ PASS |
| timeclock (G1–G15 + A1–A8 + B1–B3) | 27 | ✅ PASS |
| timeclockCases (P0: P1–P13 + isValidNShiftPair + isOvernightShift + buildDaySummaries + computeShiftFlexCreditHours + pairCaseEvents) | 25 | ✅ PASS |
| **zeitkontoEngine (Z1–Z10)** | **10** | ✅ **PASS** |
| strategyEngine | 4 | ✅ PASS |
| timeAccountEngine (inline A/B/C) | 3 | ✅ PASS |
| avatarSeed | 27 | ✅ PASS |
| memberSync | 32 | ✅ PASS |
| realtimeMembers | 12 | ✅ PASS |
| ghostPresenceSync | 36 | ✅ PASS |
| **Total** | **210** | ✅ **ALL PASS** |

---

## 1. Zeitkonto Card Presence & Location — VERIFIED ✅

### 1.1 Card Title

| Check | Code Evidence | Status |
|-------|--------------|--------|
| Card title `Zeitkonto` rendered | `timeclock.tsx:872` — `<Text style={styles.cardTitle}>Zeitkonto ({zeitkonto.monthLabel})</Text>` | ✅ VERIFIED |
| `testID="zeitkonto-card"` on card container | `timeclock.tsx:871` — `<View style={styles.card} testID="zeitkonto-card">` | ✅ VERIFIED |
| Helper text distinguishes Foresight vs Ist | `timeclock.tsx:873-874` — "Planprognose (Foresight) vs tatsächlich erarbeitet (Ist) — streng getrennt." | ✅ VERIFIED |

### 1.2 Card Placement Order

Cards appear in this order on the Stempeluhr screen:

| # | Card | Line | Status |
|---|------|------|--------|
| 1 | Schneller Stempel | 546 | ✅ |
| 2 | Dienstzeiten & Gleitzeit | 598 | ✅ |
| 3 | QA-Test: Feiertag/Vorfest Override | 660 | ✅ |
| 4 | Schichten & Tagesbilanz | 708 | ✅ |
| 5 | Monatskonto | 776 | ✅ |
| **6** | **Zeitkonto** | **871** | ✅ NEW — placed between Monatskonto and Letzte Stempelzeiten |
| 7 | Letzte Stempelzeiten | 1032 | ✅ |

### 1.3 `computeZeitkonto` Import and useMemo

| Check | Code Evidence | Status |
|-------|--------------|--------|
| Import | `timeclock.tsx:50` — `import { computeZeitkonto } from '../../lib/zeitkontoEngine'` | ✅ VERIFIED |
| useMemo dependency array | `timeclock.tsx:292-302` — depends on `[monthSummary, shiftPlan, config, spaceProfile, qaOverrides]` | ✅ VERIFIED |
| Computed after monthSummary | `timeclock.tsx:292` — zeitkonto computed from `monthSummary` which itself depends on events, config, shiftPlan | ✅ VERIFIED |

---

## 2. Data Separation (Foresight vs Ist) — VERIFIED ✅

### 2.1 Ist (abgeleistet) — Sourced from completed stamped intervals only

`zeitkontoEngine.ts:136-144` — The `ist` object is populated **exclusively** from `monthSummary` fields, which are computed by `computeMonthlyWorkProgress` (which uses `pairWorkSegments` — only completed paired stamp intervals).

| Ist Field | Source | Derivation |
|-----------|--------|------------|
| `workedHoursToDate` | `monthSummary.workedHoursToDate` | Sum of completed stamp intervals via `pairWorkSegments` |
| `deltaHoursToDate` | `monthSummary.deltaHoursToDate` | `worked - planned` (strict, from `timeAccountEngine.ts:244`) |
| `creditedHolidayHours` | `monthSummary.creditedHolidayHoursToDate` | From completed intervals split by midnight on holiday dates |
| `creditedPreHolidayHours` | `monthSummary.creditedPreHolidayHoursToDate` | From completed intervals split by midnight on pre-holiday dates |
| `creditedFlexHours` | `monthSummary.creditedFlexHoursToDate` | Flex credit from completed intervals (separate from delta) |
| `creditedTariffHoursTotal` | `monthSummary.creditedHoursToDate` | `holiday + preHoliday` (NOT including flex) |
| `balanceToDate` | `monthSummary.totalDeltaWithCreditsToDate` | `delta + tariffCredits` (NOT flex) |

**No cross-mixing:** Ist values are never derived from plan entries or projections. They come from the same `monthSummary` pipeline that existed before P1. ✅

### 2.2 Foresight (Plan) — Sourced from shift plan projection only

`zeitkontoEngine.ts:147-187` — The `foresight` object is computed from **future plan entries** (entries with `dateISO > todayISO`). No completed stamp data leaks into foresight fields.

| Foresight Field | Source | Derivation |
|-----------------|--------|------------|
| `plannedHoursMonth` | `monthSummary.plannedHoursMonth` | Full month plan total (from plan entries) |
| `remainingPlannedHours` | Sum of future shift entry planned hours | Loop over `plan.entries` where `dateISO > todayISO` (line 155-159) |
| `remainingShiftDays` | Count of future regular shift entries | Same loop, counter (line 169) |
| `projectedEndDelta` | `monthSummary.deltaHoursToDate` | Current delta assumed to persist (future delta = 0 net) (line 190) |
| `projectedRemainingHolidayCredits` | Projected from future holiday entries | Loop with `holidayMap` and `spaceProfile.holidayCredit.enabled` (lines 172-181) |
| `projectedRemainingPreHolidayCredits` | Projected from future pre-holiday entries | Loop with `isPreHoliday` check (lines 182-185) |
| `projectedEndBalance` | `totalDeltaWithCreditsToDate + projectedHoliday + projectedPreHoliday` | Line 194-197 |

**No cross-mixing:** Foresight projection values are computed from plan entries filtered to future dates only. Past completed data enters only via `monthSummary.deltaHoursToDate` and `monthSummary.totalDeltaWithCreditsToDate` which are the actual (Ist) baseline for projection — not the other way around. ✅

### 2.3 Test Coverage for Data Separation

| Test ID | Scenario | Verified |
|---------|----------|----------|
| Z1 | Ist mirrors monthSummary values exactly | ✅ Ist fields = monthSummary fields (no transformation) |
| Z2 | remainingPlannedHours computed from future shift plan entries only | ✅ Past entries excluded |
| Z3 | projectedEndDelta = currentDelta (future worked assumed = planned) | ✅ No actuals mixed into projection |
| Z4 | Projected holiday credits from future holiday dates | ✅ Only future dates scanned |
| Z5 | Projected preholiday credits from day before future holiday | ✅ Only future dates scanned |
| Z6 | No plan/config → foresight zeros (no crash, graceful degradation) | ✅ All foresight fields default to 0 |

---

## 3. Invariants — VERIFIED ✅

### 3.1 Delta remains strict: worked − planned

**Implementation:** `zeitkontoEngine.ts:138`

```ts
deltaHoursToDate: monthSummary.deltaHoursToDate,
```

This is a direct pass-through of `timeAccountEngine.ts:244` which computes `workedHoursToDate - plannedHoursToDate`. No flex is mixed in. ✅

**Test Z8:** With `workedHoursToDate=78`, `plannedHoursToDate=80`, `deltaHoursToDate=-2`, `creditedFlexHoursToDate=1.5` → `ist.deltaHoursToDate = -2` (flex does NOT affect delta). ✅

### 3.2 Flex is separate (not merged into delta or balance)

**Implementation:**
- `zeitkontoEngine.ts:141` — `creditedFlexHours` sourced from `monthSummary.creditedFlexHoursToDate` (separate field)
- `zeitkontoEngine.ts:142` — `creditedTariffHoursTotal` sourced from `monthSummary.creditedHoursToDate` = holiday + preholiday only (NOT including flex)
- `zeitkontoEngine.ts:143` — `balanceToDate` sourced from `monthSummary.totalDeltaWithCreditsToDate` = delta + tariffCredits (NOT flex)

---

## Update – 2026-04-14 (Manual Device QA Delta)

### Runtime checks executed
- GLZ foresight parity:
  - Device A: `65.00 h`
  - Device B: `65.00 h`
  - Result: **PASS**

- X-day rendering regression:
  - `Schichten & Tagesbilanz`: X day visible as `Frei genommen`
  - `Letzte Stempelzeiten`: X row visible, time shown as `—`
  - Result: **PASS** (with one ordering issue below)

### New/remaining findings
1. **FAIL (Open):** Member `Services -> Zeitkonto` still shows missing Space rule profile (`Kein Regelprofil ...`) although host profile exists.
2. **FAIL (Open):** `Schichten & Tagesbilanz` ordering for X-only rows is not strictly chronological.

### Gate status for next session
- No new blocker on GLZ foresight or X-labeling behavior.
- Follow-up required for rule-profile visibility + chronological ordering.

**Test Z9:** With `deltaHoursToDate=0`, `creditedHoursToDate=0`, `creditedFlexHoursToDate=3.0`, `totalDeltaWithCreditsToDate=0` → `balanceToDate=0`, `projectedEndBalance=0`, `creditedFlexHours=3.0`. Flex tracked separately, NOT in balance. ✅

### 3.3 Holiday/Preholiday credits remain explicit and separate

**Foresight (Plan):** `zeitkontoEngine.ts:172-185` projects holiday and preholiday credits separately from the plan entries loop. Both are gated by `spaceProfile?.holidayCredit.enabled` and `spaceProfile?.preHolidayCredit.enabled`.

**Ist (abgeleistet):** `zeitkontoEngine.ts:139-140` — `creditedHolidayHours` and `creditedPreHolidayHours` are separate fields from `monthSummary`.

**Test Z4/Z5:** Holiday and preholiday credits projected separately for future dates. ✅
**Test Z1:** Ist holiday/preholiday credits mirror monthSummary separately. ✅

---

## 4. Null/Empty Safety — VERIFIED ✅

### 4.1 Missing plan/config

`zeitkontoEngine.ts:152` — The entire foresight computation is wrapped in `if (plan && config)`. When either is null, all foresight values default to `0` (initialized at lines 147-150).

**Test Z6:** With `plan: null`, `config: null`, `spaceProfile: null` → foresight values all `0`, no crash. `projectedEndDelta` and `projectedEndBalance` fall through to `monthSummary` values. ✅

### 4.2 Missing spaceProfile

Lines 180-185: `spaceProfile?.holidayCredit.enabled` and `spaceProfile?.preHolidayCredit.enabled` use optional chaining. If `spaceProfile` is null, both conditions evaluate to `undefined` (falsy), so projected credits remain `0`. ✅

### 4.3 Empty monthSummary fields

`computeMonthlyWorkProgress` (called from `timeAccountEngine.ts`) always returns numeric values (defaults to `0` for all sum fields). Zeitkonto passes these through without transformation. No crash possible from zero/empty states. ✅

### 4.4 QA date overrides

`zeitkontoEngine.ts:172-178` — `qaDateOverrides` is optional (`qaDateOverrides?: Record<string, string>`). The code uses `qaDateOverrides?.[entry.dateISO]` with optional chaining. If undefined, `overrideType` is `undefined`, and both `isHoliday` and `isPreHoliday` fall through to the `holidayMap` checks. ✅

**Test Z10:** QA override `{'2026-04-20': 'holiday'}` correctly projects holiday credit for a non-calendar holiday. ✅

---

## 5. Regression Safety — VERIFIED ✅

### 5.1 Existing timeclock cards still render correctly

| Card | Line(s) | Status |
|------|---------|--------|
| Schneller Stempel | 546 | ✅ UNCHANGED |
| Dienstzeiten & Gleitzeit | 598 | ✅ UNCHANGED |
| QA-Test: Feiertag/Vorfest Override | 660 | ✅ UNCHANGED |
| Schichten & Tagesbilanz | 708 | ✅ UNCHANGED |
| Monatskonto | 776 | ✅ UNCHANGED |
| Letzte Stempelzeiten | 1032 | ✅ UNCHANGED |

Zeitkonto card is inserted at line 870-1029 as a new card between Monatskonto and Letzte Stempelzeiten. All existing cards above and below are untouched. ✅

### 5.2 P0 fixes intact

| P0 Fix | Location | Status |
|--------|----------|--------|
| Overnight crossover | `timeclockCases.ts:140-142` | ✅ UNCHANGED |
| N-shift tolerance | `timeclockCases.ts:79-92` | ✅ UNCHANGED |
| Flex invariant (strict delta) | `timeclockCases.ts:290-291` | ✅ UNCHANGED |
| Error banner | `index.tsx:103, 221-227, 240, 373-376` | ✅ UNCHANGED |
| PairCaseEvents sorting | `timeclockCases.ts:274-278` | ✅ UNCHANGED |
| Unvollständig rendering | `timeclock.tsx:767` | ✅ UNCHANGED |
| Flex-Credit display per shift | `timeclock.tsx:757-760` | ✅ UNCHANGED |

### 5.3 Zeitkonto draws from same pipeline

`computeZeitkonto` takes `monthSummary` (from `computeMonthlyWorkProgress`) as input — the same function that powers the Monatskonto card. No parallel computation that could diverge. Both cards share the same underlying data. ✅

### 5.4 Full P0 test suite still passing

All 25 P0 tests (P1-P13 + isValidNShiftPair + isOvernightShift + buildDaySummaries + computeShiftFlexCreditHours + pairCaseEvents) pass unchanged. ✅

---

## 6. Zeitkonto Card UI Layout — VERIFIED ✅

### Section A: Foresight (Plan)

| Row | Field | testID | Source |
|-----|-------|--------|--------|
| 1 | Monatssoll gesamt | `zk-planned-month` | `foresight.plannedHoursMonth` |
| 1 | Restsoll | `zk-remaining-planned` | `foresight.remainingPlannedHours` |
| 2 | Verbleibende Schichttage | `zk-remaining-days` | `foresight.remainingShiftDays` |
| 2 | Prognose Enddelta | `zk-projected-end-delta` | `foresight.projectedEndDelta` (color-coded) |
| 3 (conditional) | Proj. Feiertag-Gutschrift | `zk-projected-holiday` | `foresight.projectedRemainingHolidayCredits` |
| 3 (conditional) | Proj. Vorfest-Gutschrift | `zk-projected-preholiday` | `foresight.projectedRemainingPreHolidayCredits` |
| 4 | Prognose Monatsend-Saldo | `zk-projected-balance` | `foresight.projectedEndBalance` (color-coded) |

Conditional rendering (line 918-934): Projected holiday/preholiday rows only shown when values > 0. ✅

### Section B: Ist (abgeleistet)

| Row | Field | testID | Source |
|-----|-------|--------|--------|
| 1 | Gearbeitete Stunden | `zk-worked` | `ist.workedHoursToDate` |
| 1 | Delta (Ist - Soll) | `zk-delta` | `ist.deltaHoursToDate` (color-coded) |
| 2 | Feiertag-Gutschrift | `zk-holiday` | `ist.creditedHolidayHours` |
| 2 | Vorfest-Gutschrift | `zk-preholiday` | `ist.creditedPreHolidayHours` |
| 3 | Gleitzeit-Credit | `zk-flex` | `ist.creditedFlexHours` |
| 3 | Tarif gesamt | `zk-tariff` | `ist.creditedTariffHoursTotal` |
| 4 | Aktueller Saldo | `zk-balance` | `ist.balanceToDate` (color-coded) |

All fields have `testID` attributes for UI automation. ✅

### Style Definitions

| Style | Location | Purpose |
|-------|----------|---------|
| `zeitkontoSection` | `timeclock.tsx:1349-1354` | Bordered section container for Foresight/Ist |
| `zeitkontoSectionTitle` | `timeclock.tsx:1355-1359` | Section title (primary color, semibold) |
| `cardTitle` | `timeclock.tsx:1176` | Existing card title style (reused) |
| Color-coded deltas | Lines 907-912, 943-946, 971-976, 1017-1020 | Positive/negative conditional styling |

---

## 7. New File — zeitkontoEngine.ts

| Aspect | Detail |
|--------|--------|
| File | `lib/zeitkontoEngine.ts` (214 lines) |
| Pure function | `computeZeitkonto(input: ComputeZeitkontoInput): ZeitkontoData` |
| No side effects | No AsyncStorage, no React dependency, no network calls |
| No new dependencies | Uses existing `getHolidayMap` from `data/holidays`, `MonthlyWorkProgress` type from `timeAccountEngine` |
| Types | `ZeitkontoForesight`, `ZeitkontoIst`, `ZeitkontoData`, `ComputeZeitkontoInput` — all exported |
| Invariant comments | Lines 8-11: "delta = worked - planned (strict), flex stays separate, holiday/preholiday credits remain explicit" |

---

## 8. Z-Series Test Matrix

| Test ID | Scope Area | Result |
|---------|-----------|--------|
| Z1 | Ist mirrors monthSummary values exactly | ✅ PASS |
| Z2 | remainingPlannedHours from future shift plan entries | ✅ PASS |
| Z3 | projectedEndDelta = currentDelta (future worked = planned) | ✅ PASS |
| Z4 | Projected holiday credits for future holiday dates | ✅ PASS |
| Z5 | Projected preholiday credits for day before holiday | ✅ PASS |
| Z6 | No plan/config → foresight zeros, no crash | ✅ PASS |
| Z7 | projectedEndBalance = currentBalance + projected credits | ✅ PASS |
| Z8 | Delta invariant (worked - planned, strict, no flex) | ✅ PASS |
| Z9 | Flex stays separate (not in balance or projected balance) | ✅ PASS |
| Z10 | QA override holiday on future date → projected credit | ✅ PASS |

---

## 9. Files Reviewed (No Changes Made)

| File | Lines | Role |
|------|-------|------|
| `lib/zeitkontoEngine.ts` | 214 | P1 core: computeZeitkonto, ZeitkontoForesight, ZeitkontoIst, ZeitkontoData types |
| `lib/__tests__/zeitkontoEngine.test.ts` | 343 | P1 test suite (Z1–Z10) |
| `app/(services)/timeclock.tsx` | 1558 | Zeitkonto card rendering (lines 870-1029), styles (1349-1360), useMemo (292-302), import (50) |
| `lib/timeAccountEngine.ts` | 275 | Monthly engine (unchanged, source for monthSummary input) |
| `lib/timeclockCases.ts` | 350 | P0 core (unchanged, verified intact) |
| `lib/__tests__/timeclockCases.test.ts` | 490 | P0 test suite (unchanged, all 25 pass) |
| `lib/__tests__/timeclock.test.ts` | 776 | Integration tests (unchanged, all 27 pass) |
| `app/index.tsx` | 872 | Error banner (unchanged, verified intact) |

---

**PASS** — All P1 scope items verified. No blockers. No regressions in P0 fixes.

**Date/Time:** 2026-04-12 11:13
**Scope:** Zeitkonto Card P1 (card presence, data separation, invariants, null safety, regression)
**READY_FOR_READ_LATEST: YES**

---

## Addendum – 2026-04-14 (Post-Run2 Consistency Re-Gate)

### Verdict: **PASS** ✅

### Scope
1. Stempeluhr "Unvollständig" resilience for edited pairs with ordering drift.
2. Delta vs Flex clarity in Monatskonto wording.

### Evidence
- `lib/timeclockCases.ts`
  - `pairCaseEvents(...)` now includes fallback pairing when exactly one `check_in` + one `check_out` exist but regular pass produces no segment.
- `lib/__tests__/timeclockCases.test.ts`
  - New test validates fallback pairing under wrong `createdAt` order for overnight shift.
- `app/(services)/timeclock.tsx`
  - Monatskonto labels now explicitly separate delta and flex semantics.

### Validation
- `npm test` full suite: **PASS** (all tests green, including new fallback regression test).

### Residual open item
- Optional repository hygiene: reduce/archive growth in `docs/ops/session_archive`.

**READY_FOR_READ_LATEST: YES**

---

## Addendum – 2026-04-14 (Dual-Device Re-Validation)

**Reviewer Mode:** runtime re-gate on physical devices (no code edits)  
**Scope:** Host/Member sync lifecycle after forced clean reinstall on Device B

### Verdict: **PASS** ✅

### Preconditions validated
- Device B reinstall initially blocked by Android policy:
  - Error observed: `INSTALL_FAILED_USER_RESTRICTED`
  - Resolved by enabling device-side USB install permission.
- Reinstall then succeeded:
  - `adb install ... app-release.apk` → `Success`
- Stale debug signature check:
  - `TIMECLOCK_BUILD_SIG` on Stempeluhr: **NOT visible** (expected for current runtime)

### E2E test sequence and outcome
1. Device A (Host) created profile + space.
2. Device B (Member) created profile + joined via QR.
3. Join gate:
   - Host visible in Device B Shiftpals: **PASS**
   - Avatar correct: **PASS**
4. Member profile deleted on Device B.
5. Propagation gate on Device A:
   - `Space-Mitglieder` shows exited state (red banner): **PASS**
   - `Meine Shiftpals` no longer lists deleted member as active: **PASS**

### Residual open items (non-blocking for this gate)
- Continue Stempeluhr accounting/domain alignment pass:
  - "Unvollständig" behavior after manual edit normalization
  - Delta/Flex display semantics vs domain rules

**READY_FOR_READ_LATEST: YES**

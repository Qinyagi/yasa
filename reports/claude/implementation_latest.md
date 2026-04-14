# Implementation Latest – P1 Zeitkonto Card
**Date:** 2026-04-12
**Status:** COMPLETE — `tsc` exit 0, `npm test` 210/210 PASS

---

## Scope

New **Zeitkonto** card in `app/(services)/timeclock.tsx`, strictly separating:
- **Foresight (Plan)** — shift-plan projection for remaining month
- **Ist (abgeleistet)** — earned from completed stamp intervals only

No mixing of forecast and actual. P0 invariants preserved.

---

## New Module: `lib/zeitkontoEngine.ts`

Pure function `computeZeitkonto(input) → ZeitkontoData` with:

| Section | Field | Source | Category |
|---|---|---|---|
| Foresight | `plannedHoursMonth` | Shift plan full month | **Plan** |
| Foresight | `remainingPlannedHours` | Future plan entries | **Plan** |
| Foresight | `remainingShiftDays` | Count of future entries | **Plan** |
| Foresight | `projectedEndDelta` | Current delta (assumes future = planned) | **Plan** |
| Foresight | `projectedRemainingHolidayCredits` | Future holidays × shift hours | **Plan** |
| Foresight | `projectedRemainingPreHolidayCredits` | Future preholidays × shift hours | **Plan** |
| Foresight | `projectedEndBalance` | Current + projected credits | **Plan** |
| Ist | `workedHoursToDate` | Stamp intervals | **Actual** |
| Ist | `deltaHoursToDate` | worked − planned (strict) | **Actual** |
| Ist | `creditedHolidayHours` | Holiday stamp credits | **Actual** |
| Ist | `creditedPreHolidayHours` | Preholiday stamp credits | **Actual** |
| Ist | `creditedFlexHours` | Paid flex (separate signal) | **Actual** |
| Ist | `creditedTariffHoursTotal` | Holiday + preholiday | **Actual** |
| Ist | `balanceToDate` | delta + tariff credits (NOT flex) | **Actual** |

---

## Card Location

Between **Monatskonto** and **Letzte Stempelzeiten** in timeclock.tsx.

| Element | File:Line | testID |
|---|---|---|
| Card container | `timeclock.tsx:871` | `zeitkonto-card` |
| Foresight section | `timeclock.tsx:878-954` | `zk-planned-month`, `zk-remaining-planned`, `zk-remaining-days`, `zk-projected-end-delta`, `zk-projected-balance` |
| Ist section | `timeclock.tsx:956-1027` | `zk-worked`, `zk-delta`, `zk-holiday`, `zk-preholiday`, `zk-flex`, `zk-tariff`, `zk-balance` |
| Import + memo | `timeclock.tsx:50`, `:292-302` | — |

---

## P0 Invariants

- **delta = worked − planned (strict)** — Z8 test: `deltaHoursToDate = -2`, flex = 1.5, NOT mixed
- **flex separate** — Z9 test: `balanceToDate = 0` when only flex exists (3.0), not included
- **credits explicit** — Holiday/preholiday shown as separate rows in both sections

---

## Tests: `lib/__tests__/zeitkontoEngine.test.ts` (10 PASS)

Z1 Ist mirrors monthSummary | Z2 remainingPlannedHours | Z3 projectedEndDelta |
Z4 projected holiday | Z5 projected preholiday | Z6 null safety |
Z7 projectedEndBalance | Z8 delta strict | Z9 flex separate | Z10 QA override

**Full suite: 210/210 PASS** (37+27+25+10+4+27+32+12+36)

---

## Files Changed

| File | Type |
|---|---|
| `lib/zeitkontoEngine.ts` | NEW — pure module |
| `lib/__tests__/zeitkontoEngine.test.ts` | NEW — 10 tests |
| `app/(services)/timeclock.tsx` | MODIFIED — import, useMemo, card JSX, 2 styles |
| `package.json` | MODIFIED — added test to script |

No changes to storage, timeAccountEngine, timeclockCases, autoStamp, routing.

---

Previous: `archive/implementation_2026-04-11_timeclock_p0_consistency_fix.md`
Archive: `archive/implementation_2026-04-12_zeitkonto_card_p1.md`

READY_FOR_READ_LATEST: YES

---

## Update – 2026-04-14 (Run2 Device Verification)

### Runtime/Install Reality (Android local)
- Expo Go remains out of flow for this phase.
- Active validation path is local Android release APK via ADB:
  - `android\app\build\outputs\apk\release\app-release.apk`
  - Device B required explicit `Install via USB` allowance.
- Key runtime mismatch marker from old builds (`TIMECLOCK_BUILD_SIG`) is now **not visible** on Device B after successful reinstall.

### Manual E2E Run2 (Host/Member)
- Setup:
  - Device A = Host (new profile + space created)
  - Device B = Member (new profile + QR join)
- Join checks:
  - Host visible on Device B Shiftpals: **PASS**
  - Avatar correct on Device B: **PASS**
- Delete propagation checks:
  - Member profile deleted on Device B
  - Device A `Space-Mitglieder`: member shown as exited with red banner: **PASS**
  - Device A `Meine Shiftpals`: deleted member no longer shown as active: **PASS**

### Implementation status after Run2
- Current sync lifecycle for join/delete is validated on physical dual-device run.
- No additional code change applied in this checkpoint block; this is runtime verification hardening.

### Next queued engineering tasks
1. Optional hygiene: prune/compact oversized `docs/ops/session_archive` growth strategy.

READY_FOR_READ_LATEST: YES

---

## Update – 2026-04-14 (Task 1 + Task 2 done)

### Task 1: Stempeluhr consistency ("Unvollständig" after edits) — DONE
- File: `lib/timeclockCases.ts`
- Change: Added fallback pairing in `pairCaseEvents(...)`:
  - If exactly one `check_in` and one `check_out` exist but no segment is formed due to ordering/legacy metadata, a direct pair attempt is performed.
  - Overnight wrap remains respected (`+24h` when needed).
- Effect: prevents false `Unvollständig` for valid edited pairs.

### Task 1 test extension — DONE
- File: `lib/__tests__/timeclockCases.test.ts`
- Added regression test:
  - `Fallback pairing: exactly one check_in + one check_out with wrong createdAt order still pairs (overnight)`

### Task 2: Delta vs Flex wording/summaries — DONE
- File: `app/(services)/timeclock.tsx`
- Monatskonto labels clarified:
  - `Delta bisher (Ist - Soll, ohne Gleitzeit)`
  - `Gleitzeit-Credit (separat, nicht im Delta)`
  - `Gesamtdelta inkl. Tarif (ohne Gleitzeit)`
  - Added helper line: `Gleitzeit wird separat geführt und nicht in Delta/Saldo eingemischt.`

### Verification
- `npm test` → PASS (full suite green).

READY_FOR_READ_LATEST: YES

# YASA Pre-Live QA Gate Review (Minimax)
**Date:** 2026-04-01
**Reviewer:** Senior QA Gate (Minimax M2.5)
**Build:** 1.0.0 · tsc exit 0 · Tests 56/56 PASS
**PROJECT ROOT verified:** C:\Users\XyZ\Documents\YASA\yasa ✓

---

## Executive Summary

This independent QA gate review validates, refutes, and extends findings from the Claude codebase review (2026-03-25).

**Verdict: FAIL**

Two BLOCKER issues remain unresolved. The Supabase credentials are still committed in plaintext in `app.json` (lines 36-38) and will ship in every production build — this has NOT been remediated since the Claude review. The weak invite token using `Math.random()` at `app/(space)/create.tsx:19` also remains. Both must be fixed before any release.

**Test Coverage:** 56/56 tests pass, but critical gaps exist: `timeAccountEngine.test.ts` is NOT in the npm test script (package.json:10), meaning these tests never run in CI.

**Residual Risk (Post-Fix):** HIGH
- B-001 and B-002 are release-killers
- The credential leak alone violates basic security hygiene

---

## Validation Matrix (Claude Finding → Minimax Verdict)

| ID | Severity | Claude Status | Minimax Verdict | Evidence |
|----|----------|--------------|-----------------|----------|
| B-001 | BLOCKER | — | **CONFIRMED** | `app.json:36-38` - plaintext URL and anonKey present |
| B-002 | BLOCKER | — | **CONFIRMED** | `app/(space)/create.tsx:19` - Math.random() token gen |
| H-001 | HIGH | — | **CONFIRMED** | `app/(admin)/index.tsx:120-141` - missing STORAGE_KEYS |
| H-002 | HIGH | — | **CONFIRMED** | `app/(admin)/index.tsx:65-68` - bypass on !available |
| H-003 | HIGH | — | **CONFIRMED** | `lib/storage.ts:1462-1472` - unprotected writes |
| H-004 | HIGH | — | **CONFIRMED** | `lib/storage.ts:115-153` - no runSerializedWrite |
| M-001 | MEDIUM | — | **CONFIRMED** | `lib/storage.ts:516-526` - local Date arithmetic |
| M-002 | MEDIUM | — | **CONFIRMED** | `lib/storage.ts:1083` - DST-sensitive +24h |
| M-003 | MEDIUM | — | **CONFIRMED** | `lib/storage.ts:591-601` - stale read (inherent) |
| M-004 | MEDIUM | — | **REJECTED** | No actual bug, re-classified to LOW by Claude |
| M-005 | MEDIUM | — | **CONFIRMED** | storage.ts:175-192,1743-1755 - unprotected RMW |
| M-006 | MEDIUM | — | **PARTIAL** | Unverified RN runtime risk |
| M-007 | MEDIUM | — | **CONFIRMED** | `lib/storage.ts:575-585` - saveShiftPlan unprotected |
| M-008 | MEDIUM | — | **REJECTED** | Logic is consistent, reclassify to informational |
| L-001 | LOW | — | **CONFIRMED** | Duplicated formatGerman() across files |
| L-002 | LOW | — | **CONFIRMED** | `app/(shift)/setup.tsx:51-54` - local getDay() |
| L-003 | LOW | — | **CONFIRMED** | TIMECLOCK_TEST_PROMPT no __DEV__ gate |
| L-004 | LOW | — | **CONFIRMED** | app.json:16-18 - no bundleIdentifier |
| L-005 | LOW | — | **CONFIRMED** | app.json - no NSCameraUsageDescription |
| L-006 | LOW | — | **CONFIRMED** | app.json - no NSFaceIDUsageDescription |
| L-007 | LOW | — | **CONFIRMED** | storage.ts is 2094 lines |
| L-008 | LOW | — | **CONFIRMED** | write-during-read in getOpenShortShiftVacationReminders |
| L-009 | LOW | — | **PARTIAL** | Not fully read, pattern likely |
| L-010 | LOW | — | **CONFIRMED** | No future-date check in createSwapRequest |

---

## New Findings (Not in Claude Report)

| ID | Severity | Finding | Evidence | Risk |
|----|----------|---------|----------|------|
| N-001 | HIGH | `timeAccountEngine.test.ts` NOT in npm test script | `package.json:10` - only runs 3 test files | Tests silently never run |

**N-001 Detail:** The file `lib/__tests__/timeAccountEngine.test.ts` exists but the npm test script on line 10 only includes:
- `shiftEngine.test.ts`
- `timeclock.test.ts`
- `strategyEngine.test.ts`

`timeAccountEngine.test.ts` is excluded from CI/test runs, meaning any regression in time account logic goes undetected.

---

## Test Coverage Adequacy Assessment

**Critical User Journeys Covered:**
- ✓ Shift engine UTC math (37 tests)
- ✓ Timeclock state machine (15 tests)
- ✓ Strategy engine vacation logic (4 tests)

**Critical User Journeys NOT Covered:**
- ✗ **Profile delete completeness** — H-001 untested
- ✗ **Biometric auth bypass** — H-002 untested (would need mock)
- ✗ **acceptSwapRequest atomicity** — H-003 untested
- ✗ **updateProfileOnce race** — H-004 untested
- ✗ **generateShiftEntries DST** — M-001 untested
- ✗ **snooze DST edge case** — M-002 untested
- ✗ **Time account engine** — N-001 tests excluded from CI

**Coverage Score:** 56 tests pass but critical paths untested. Score: 6/10

---

## Release Gate Verdict

### FAIL

**Blockers (Pre-Release):**
1. **B-001** - Supabase credentials in app.json (MUST FIX)
2. **B-002** - Weak invite token (MUST FIX)

**Conditions for Pass:**
- [ ] B-001 fixed: credentials removed from app.json, rotated in Supabase
- [ ] B-002 fixed: CSPRNG token generation
- [ ] H-001 fixed: all STORAGE_KEYS in profile delete
- [ ] H-002 fixed: device PIN fallback when biometrics unavailable
- [ ] L-004/L-005/L-006 fixed: iOS release config present

**Current Status:** All conditions FAILED - no fixes applied.

---

## Top 10 Remediation Actions (Ordered by Risk-Reduction-per-Effort)

| # | ID | Fix Description | Effort | Risk Reduction | Owner |
|---|-----|---------------|--------|----------------|-------|
| 1 | B-001 | Remove credentials from app.json lines 36-38. Rotate anon key in Supabase dashboard. | LOW | BLOCKER | Claude |
| 2 | B-001 | Use EAS Secrets for CI: `eas secret:create` | MEDIUM | BLOCKER | Codex |
| 3 | B-002 | Replace Math.random() with crypto.getRandomValues() in create.tsx:19 | LOW | BLOCKER | Claude |
| 4 | H-001 | Add missing STORAGE_KEYS to admin/index.tsx:126 multiRemove | LOW | HIGH | Claude |
| 5 | H-002 | Change admin/index.tsx:65-68 to require device PIN | MEDIUM | HIGH | Claude |
| 6 | L-004/5/6 | Add iOS bundleIdentifier, NSCameraUsageDescription, NSFaceIDUsageDescription to app.json | LOW | MEDIUM | Claude |
| 7 | H-003 | Wrap acceptSwapRequest writes in runSerializedWrite | MEDIUM | HIGH | Codex |
| 8 | H-004 | Wrap updateProfileOnce spaces write in runSerializedWrite | MEDIUM | HIGH | Codex |
| 9 | M-001 | Replace local Date with UTC in generateShiftEntries | MEDIUM | MEDIUM | Codex |
| 10 | M-002 | Replace Date.now()+24h with setDate(t.getDate()+1) | LOW | MEDIUM | Codex |

---

## Minimal Safe Release Scope

**CAN ship now:**
- Shift engine (37 passing tests)
- Timeclock functionality (15 passing tests)
- Strategy engine (4 passing tests)

**CANNOT ship until fixed:**
- Space creation with QR (B-002)
- Admin profile deletion (H-001, H-002)
- Swap request acceptance (H-003)
- Profile updates (H-004)
- Any build targeting iOS (L-004, L-005, L-006)

---

## Deferred Items (Safe to Postpone)

These do not block release but should be addressed in 7-day hardening:

- M-001: generateShiftEntries DST fix (affects non-EU users only)
- M-002: snooze DST fix (edge case - only during DST spring-forward)
- M-005/M-007: wrap RMW operations in runSerializedWrite
- L-002: weekdayShort UTC fix
- L-007: storage.ts split (maintainability, not release-critical)

---

## Confidence & Residual Risk

| Factor | Score | Notes |
|--------|-------|-------|
| Build cleanliness | 10/10 | tsc exit 0 |
| Test coverage | 6/10 | Critical paths untested |
| Security (pre-fix) | 0/10 | Credentials leaked |
| Security (post-fix) | 7/10 | After B-001/B-002 fixed |
| iOS release readiness | 3/10 | Missing permissions |

**Residual Risk After All Fixes:** MEDIUM

- Race conditions (H-003, H-004) still possible but less likely
- DST edge cases remain (M-001, M-002) but affect small user population
- storage.ts monolithic but functional

---

## Appendix: Evidence File Index

| File | Lines | Finding Validated |
|------|-------|----------------|
| app.json | 36-38 | B-001 |
| app/(space)/create.tsx | 19 | B-002 |
| app/(admin)/index.tsx | 65-68 | H-002 |
| app/(admin)/index.tsx | 120-141 | H-001 |
| lib/storage.ts | 25-51 | STORAGE_KEYS def |
| lib/storage.ts | 115-153 | H-004 |
| lib/storage.ts | 516-526 | M-001 |
| lib/storage.ts | 1083 | M-002 |
| lib/storage.ts | 1462-1472 | H-003 |
| lib/storage.ts | 175-192 | M-005 |
| lib/storage.ts | 1743-1755 | M-005 |
| lib/storage.ts | 575-585 | M-007 |
| package.json | 10 | N-001 |

(End of file)
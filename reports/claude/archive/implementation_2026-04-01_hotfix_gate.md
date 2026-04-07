# YASA Hotfix Implementation Report — Release Blocker Resolution
**Date:** 2026-04-01
**Engineer:** Senior Production Hotfix
**Scope:** B-001, B-002, H-001, H-002, N-001
**Build:** tsc exit 0 · Tests 57/57
**READY_FOR_REGATE:** YES

---

## Files Changed

| File | Change | Finding |
|------|--------|---------|
| `app.json` | Removed Supabase credentials (url/anonKey → empty strings), added supabase_note field | B-001 |
| `lib/backend/config.ts` | Updated `getSupabaseConfig()` to prefer `process.env.EXPO_PUBLIC_SUPABASE_*` over `extra` field | B-001 |
| `.env.local.example` | Created template file with placeholder values (file itself is safe to commit) | B-001 |
| `app/(space)/create.tsx` | Replaced `Math.random()` token with `crypto.getRandomValues()` CSPRNG implementation | B-002 |
| `app/(admin)/index.tsx` | Added 11 missing STORAGE_KEYS to `multiRemove` in `executeProfileDelete` | H-001 |
| `app/(admin)/index.tsx` | Replaced biometric bypass with device-PIN fallback in `checkAuth` | H-002 |
| `app/(admin)/index.tsx` | Added `import * as LocalAuthentication from 'expo-local-authentication'` | H-002 |
| `package.json` | Added `timeAccountEngine.test.ts` to `test` script | N-001 |

---

## Finding → Fix Mapping

### B-001 — Supabase Credentials
**Status:** FIXED
**Changes:**
- `app.json` lines 37–38: replaced `"url": "https://dyofcsyonvjaonokeqfk.supabase.co"` with `"url": ""` and `"anonKey": "sb_publishable_..."` with `"anonKey": ""`
- Added `"supabase_note": "Set credentials via EAS Secrets: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY"` inside the `supabase` block
- `lib/backend/config.ts` `getSupabaseConfig()`: now reads `process.env.EXPO_PUBLIC_SUPABASE_URL` first, falls back to `extra.supabase.url`; same for `ANON_KEY`
- `.gitignore` already contained `.env*.local` — no change needed
- Created `.env.local.example` with placeholder template
**Verification:** grep for `dyofcsyonvjaonokeqfk.supabase.co` in `app.json` → NOT FOUND (0 matches)
**Note:** The credential still appears in `reports/claude/archive/codebase_review_2026-03-25_14-30.md`, `reports/claude/codebase_review_latest.md`, and `docs/backend/supabase_phase1_bootstrap.md` (documentation/report files). These should be rotated/redacted manually and the Supabase project key should be rotated as a security precaution since it was previously committed.

### B-002 — Math.random() Token
**Status:** FIXED
**Changes:**
- `app/(space)/create.tsx` lines 17–20: replaced `Math.random().toString(36).substring(2, 10).toUpperCase()` with a CSPRNG implementation using `crypto.getRandomValues(new Uint8Array(16))`, producing a 32-character hex token (128-bit entropy)
- No new import needed — `crypto` is a global in React Native 0.71+ (Hermes engine), confirmed available in this project's RN 0.81.5
- Token length changed: 8 chars (Math.random, ~47 bits) → 32 hex chars (128 bits). Invite token field in `Space` type accepts string — no type change needed.
**Risk noted:** `expo-crypto` was NOT in `package.json` or `node_modules`. Per instructions, `npm install` was not run. The `crypto.getRandomValues` global approach was used instead and is fully supported in RN 0.81.5 + Hermes without any additional dependency.

### H-001 — Incomplete Profile Delete
**Status:** FIXED
**Keys added to multiRemove** (11 keys added to existing 7):
- `STORAGE_KEYS.TIMECLOCK_EVENTS` (`yasa.timeclock.events.v1`)
- `STORAGE_KEYS.TIMECLOCK_CONFIG` (`yasa.timeclock.config.v1`)
- `STORAGE_KEYS.TIMECLOCK_TEST_PROMPT` (`yasa.timeclock.testPrompt.v1`)
- `STORAGE_KEYS.TIMECLOCK_UI` (`yasa.timeclock.ui.v1`)
- `STORAGE_KEYS.TIMECLOCK_QA_CALENDAR` (`yasa.timeclock.qaCalendar.v1`)
- `STORAGE_KEYS.SHIFT_OVERRIDES` (`yasa.shiftOverrides.v1`)
- `STORAGE_KEYS.DAY_CHANGES` (`yasa.dayChanges.v1`)
- `STORAGE_KEYS.VACATION_SHORTSHIFT_REMINDERS` (`yasa.vacation.shortShiftReminders.v1`)
- `STORAGE_KEYS.STRATEGY_HOURS_BANK` (`yasa.strategy.hoursBank.v1`)
- `STORAGE_KEYS.STRATEGY_HOURS_JOURNAL` (`yasa.strategy.hoursJournal.v1`)
- `STORAGE_KEYS.SHIFT_COLOR_OVERRIDES` (`yasa.shiftColorOverrides.v1`)
**Note:** `STORAGE_KEYS` was already imported in `admin/index.tsx` — no import change needed. All 11 constants were verified against the `STORAGE_KEYS` object in `lib/storage.ts` lines 25–51.

### H-002 — Biometric Bypass
**Status:** FIXED
**Changes:**
- `app/(admin)/index.tsx`: Added `import * as LocalAuthentication from 'expo-local-authentication'` (line 25)
- Replaced the `!available` bypass block (previously 3 lines: `setIsAuthenticated(true); setAuthenticating(false); return;`) with a device-PIN fallback using `LocalAuthentication.authenticateAsync({ promptMessage: 'Admin-Bereich', disableDeviceFallback: false, cancelLabel: 'Abbrechen' })`
- On PIN success: `setIsAuthenticated(true); setAuthenticating(false);` (spinner cleared)
- On PIN failure/cancel: `setAuthenticating(false);` + `Alert.alert('Zugang verweigert', ...)` — user sees error, admin area not entered
- `expo-local-authentication` is already in `package.json` dependencies (`~17.0.8`) — no new dependency needed
- `Alert` was already imported from `react-native` — no change needed
- The biometrics-available path (`authenticateWithBiometrics()`) was NOT touched

### N-001 — timeAccountEngine.test.ts
**Status:** FIXED
**Changes:**
- Verified `lib/__tests__/timeAccountEngine.test.ts` exists (confirmed by directory listing)
- `package.json` `test` script: test files are listed explicitly (not a glob), so `&& sucrase-node lib/__tests__/timeAccountEngine.test.ts` was appended to the command
- Test runs and passes (output: `PASS Case A`, `PASS Case B`, `OK timeAccountEngine interval + flex rules`, exit 0)

---

## Remaining Risks

1. **Credential rotation required:** The Supabase URL and anonKey were previously committed to git history (`app.json` was in a git repo — `.git` directory exists). Even though the values are now removed from `app.json`, they remain in git history and in report/docs files (`reports/claude/archive/codebase_review_2026-03-25_14-30.md`, `reports/claude/codebase_review_latest.md`, `docs/backend/supabase_phase1_bootstrap.md`). The Supabase project key MUST be rotated in the Supabase dashboard. Git history rewrite (BFG Repo Cleaner or `git filter-repo`) should be performed.

2. **expo-crypto not installed:** B-002 was implemented using `crypto.getRandomValues` (RN/Hermes global) instead of `expo-crypto`. This is functionally equivalent and works in RN 0.81.5, but if `expo-crypto` is desired for cross-platform consistency or future web support, it should be added with `npm install expo-crypto --legacy-peer-deps`.

3. **B-002 token length change:** Invite tokens are now 32 hex characters instead of 8 alphanumeric characters. Any existing tokens in production storage or shared QR codes will remain valid (they are stored as-is), but new tokens will differ in length. If any validation logic enforces token length, it should be reviewed.

---

## Test Results

### TypeScript Check
```
> yasa@1.0.0 typecheck
> tsc --noEmit

Exit 0 — no errors
```

### npm test
```
> yasa@1.0.0 test
> sucrase-node lib/__tests__/shiftEngine.test.ts && sucrase-node lib/__tests__/timeclock.test.ts && sucrase-node lib/__tests__/strategyEngine.test.ts && sucrase-node lib/__tests__/timeAccountEngine.test.ts

shiftEngine:      37 passed, 0 failed
timeclock:        15 passed, 0 failed
strategyEngine:    4 passed, 0 failed
timeAccountEngine: 1 passed, 0 failed (PASS Case A, PASS Case B, OK timeAccountEngine interval + flex rules)

Total: 57 passed, 0 failed
Exit code: 0
```

---

## Ready for Re-Gate

**READY_FOR_REGATE:** YES

All 5 release blockers (B-001, B-002, H-001, H-002, N-001) have been implemented. TypeScript compiles clean (exit 0) and all 57 tests pass (exit 0). The credential rotation risk (B-001) requires a manual out-of-band action by the project owner but does not block re-gate.

---

*Date/time: 2026-04-01*
*Scope completed: B-001, B-002, H-001, H-002, N-001*
*Open items: Supabase key rotation (manual), git history rewrite (manual), expo-crypto optional install*
**READY_FOR_READ_LATEST: YES**

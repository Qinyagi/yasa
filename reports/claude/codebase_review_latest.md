# YASA Pre-Live Full Codebase Review
**Date:** 2026-03-25
**Reviewer:** Senior Code Review Gate (Claude Sonnet 4.6)
**Build:** 1.0.0 · tsc exit 0 · Tests 56/56 PASS (37 shiftEngine + 15 timeclock + 4 strategyEngine)
**PROJECT ROOT verified:** C:\Users\XyZ\Documents\YASA\yasa ✓

---

## Executive Summary

YASA is a React Native/Expo offline-first shift-companion app with a solid core engine (UTC-stable date math, serialized write queues, correct swap write-ordering). The test suite is green, TypeScript compiles cleanly, and critical hotfixes from previous iterations are confirmed in place.

However, two issues are categorically release-blocking. First, a real Supabase URL and anon key are committed in plaintext inside `app.json`, which is version-controlled and will be bundled into every production binary — this is a credential leak. Second, the invite token for every Space is generated with `Math.random().toString(36).substring(2,10)`, which provides only ~46 bits of effective entropy; because the token is embedded unencrypted in every QR code payload, an attacker who observes a single QR can instantly rejoin that space indefinitely and the token is never rotated. Beyond these two blockers, there are four HIGH-severity issues spanning race conditions in multi-key transactions, profile deletion that leaves timeclock and shift-override data on device, and an admin bypass when biometrics are not enrolled. Maintainability is a concern (storage.ts at 2094 lines) but not release-blocking.

---

## Release Verdict: NO-GO

Primary reason: Supabase credentials are committed in plaintext in `app.json` and will ship in every production build. This must be resolved before any release artifact is created.

---

## Findings

---

### BLOCKER

#### B-001 — Real Supabase credentials committed in app.json

**File:** `app.json` lines 36–39

**Problem:** The `extra.supabase.url` (`https://dyofcsyonvjaonokeqfk.supabase.co`) and `extra.supabase.anonKey` (`sb_publishable_4_nIGMLllVi53M69HPcThw_onj2L15b`) are hardcoded in `app.json` in plaintext. This file is version-controlled. Every production APK/IPA built from this config will bundle these credentials. The anon key grants unauthenticated read/write access to the Supabase project within its RLS rules, and depending on those rules, could allow bulk reads of all `shift_plans` and `space_members` rows. Any user who reverse-engineers the binary or has repository access can extract these credentials.

**Trigger:** Any `git clone` of the repository or any production build created from this config.

**User/business impact:** Credential exposure; potential unauthorized read access to all synchronized user data; Supabase project abuse (bandwidth, write quotas).

**Fix:** Remove credentials from `app.json`. Use EAS Secrets (`eas secret:create`) for CI/production builds and a `.env` file (gitignored) for local development. In `config.ts`, read from `process.env.EXPO_PUBLIC_SUPABASE_URL` and `process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY`. Rotate the current anon key immediately because it is already committed.

---

#### B-002 — Weak, unrotatable invite token (Math.random, 8 chars, never expires)

**File:** `app/(space)/create.tsx` line 19
```
return Math.random().toString(36).substring(2, 10).toUpperCase();
```

**Problem:** `Math.random()` is not a CSPRNG. The resulting token is 8 alphanumeric characters (base-36 after uppercase = ~36^8 ≈ 2.8T combinations, but `Math.random()` entropy is capped at 53 bits, so real entropy ≈ 46 bits maximum). More critically: (1) the token never expires — once issued at space creation it is valid forever; (2) it is embedded in the QR payload in plaintext (`&token=TOKEN`); (3) there is no mechanism to regenerate or revoke it. Anyone who photographs or screenshots the QR, or who intercepts the URL, retains permanent join capability. The `importSpaceFromInvite` path on the joining device also stores the raw token in local storage, so it persists on the joiner's device in cleartext.

**Trigger:** Once a QR code is shown, photographed, or shared by any means.

**User/business impact:** Unauthorized space membership; space owner has no revocation path; team privacy violated if QR is leaked.

**Fix:** Use `crypto.getRandomValues` (available via `expo-crypto` or `react-native-get-random-values`) to generate 128-bit tokens. Add a token rotation function to `storage.ts` callable by the space owner from the manage screen. Display a "Rotate invite link" button in `(space)/manage.tsx`. Consider adding an expiry timestamp to the QR payload.

---

### HIGH

#### H-001 — Profile delete leaves timeclock events, shift overrides, day-changes, and strategy data on device

**File:** `app/(admin)/index.tsx` lines 121–141

**Problem:** `executeProfileDelete()` removes PROFILE, SPACES, CURRENT_SPACE_ID, SHIFTS, GHOSTS, VACATION, SWAPS, TIME_ACCOUNT_SPACE_RULES, TIME_ACCOUNT_USER, TIME_ACCOUNT_UI via `multiRemove`. It does NOT remove: `TIMECLOCK_EVENTS`, `TIMECLOCK_CONFIG`, `TIMECLOCK_TEST_PROMPT`, `TIMECLOCK_UI`, `TIMECLOCK_QA_CALENDAR`, `SHIFT_OVERRIDES`, `DAY_CHANGES`, `VACATION_SHORTSHIFT_REMINDERS`, `STRATEGY_HOURS_BANK`, `STRATEGY_HOURS_JOURNAL`, `SHIFT_COLOR_OVERRIDES`.

If a user deletes their profile and creates a new one, the new profile gets a new UUID and will not see old data. However: if the same physical person uses the same device and reuses the same avatar/name derivation (which `generateUUID` prevents), the data is only unreachable, not removed. On a shared device or a device passed to another user, orphaned timeclock events, strategy hours, and shift override history remain in AsyncStorage indefinitely. This is a DSGVO erasure deficiency: when a user exercises their right to erasure, these keys are not cleared.

**Trigger:** Any profile deletion via the admin screen.

**User/business impact:** Incomplete data erasure (DSGVO compliance); persistent orphaned data occupying storage on shared/resold devices.

**Fix:** Add all missing keys to the `multiRemove` call:
```
STORAGE_KEYS.TIMECLOCK_EVENTS,
STORAGE_KEYS.TIMECLOCK_CONFIG,
STORAGE_KEYS.TIMECLOCK_TEST_PROMPT,
STORAGE_KEYS.TIMECLOCK_UI,
STORAGE_KEYS.TIMECLOCK_QA_CALENDAR,
STORAGE_KEYS.SHIFT_OVERRIDES,
STORAGE_KEYS.DAY_CHANGES,
STORAGE_KEYS.VACATION_SHORTSHIFT_REMINDERS,
STORAGE_KEYS.STRATEGY_HOURS_BANK,
STORAGE_KEYS.STRATEGY_HOURS_JOURNAL,
STORAGE_KEYS.SHIFT_COLOR_OVERRIDES,
```

---

#### H-002 — Admin screen accessible without authentication when biometrics are not enrolled

**File:** `app/(admin)/index.tsx` lines 57–74 (`checkAuth` function)

**Problem:**
```typescript
if (!available) {
  setIsAuthenticated(true);  // ← immediate grant, no fallback auth
  setAuthenticating(false);
  return;
}
```
When `isBiometricAvailable()` returns false (hardware absent or no biometric enrolled), authentication is automatically bypassed and `isAuthenticated` is set to `true`. The admin screen then exposes: all spaces with QR access, profile deletion, co-admin management, space rules configuration, and a debug section. Any person with physical access to a device where the owner has no biometric enrolled (e.g., all simulators, many entry-level devices) gets full admin access without any authentication challenge.

**Trigger:** Device without biometric hardware or without any biometric enrollment. This includes all development simulators.

**User/business impact:** Unauthorized access to destructive operations (profile delete, space delete) and sensitive data (invite QR codes).

**Fix:** When biometrics are unavailable, challenge the user with a device PIN/password using `LocalAuthentication.authenticateAsync({ disableDeviceFallback: false })`. If no device lock is set, show a warning that admin functions cannot be secured and require the user to set a device lock before proceeding. Do not silently grant authentication on failure.

---

#### H-003 — Multi-key atomic writes: acceptSwapRequest writes two separate storage keys without rollback

**File:** `lib/storage.ts` lines 1462–1472

**Problem:** `acceptSwapRequest` writes in two separate async steps:
1. `setAllSwaps(swaps)` — marks swap as `accepted` (uses the raw, unserialized `setAllSwaps`)
2. `AsyncStorage.setItem(KEYS.SHIFTS, ...)` — swaps the shift entries

`setAllSwaps` itself calls `AsyncStorage.setItem(KEYS.SWAPS, ...)` directly (line 1312) without using `runSerializedWrite`. If another concurrent write to `KEYS.SHIFTS` (e.g., `saveShiftPlan` in `today.tsx` pulling from backend) races between step 1 and step 2, the swap status becomes `accepted` but the shift entries are not swapped, creating a permanently inconsistent state with no recovery path other than manual admin intervention. The `KEYS.SHIFTS` write in step 2 (line 1472) also bypasses the serialized write queue, meaning it can overwrite a concurrent `saveShiftPlan` write silently.

**Trigger:** User A accepts a swap on the swap screen while user B simultaneously has `today.tsx` open and triggers a backend pull/save of shift plans.

**User/business impact:** Silent data corruption: swap shows as accepted but shifts are not swapped; no error surfaced to user.

**Fix:** Wrap the entire swap accept operation in a single `runSerializedWrite(KEYS.SHIFTS, ...)` block. For `KEYS.SWAPS`, either use `runSerializedWrite` or accept that the status flip and shift swap cannot be made truly atomic in AsyncStorage (document this as a known limitation with a compensating read on next screen open). At minimum, wrap the step-2 shift write in its own `runSerializedWrite(KEYS.SHIFTS, ...)` to prevent silent overwrites from concurrent `saveShiftPlan` calls.

---

#### H-004 — updateProfileOnce race condition between profile and spaces writes

**File:** `lib/storage.ts` lines 115–153

**Problem:** `updateProfileOnce` performs:
1. `AsyncStorage.setItem(KEYS.PROFILE, ...)` — writes updated profile (line 138)
2. `getSpaces()` — reads spaces (line 140)
3. `setSpaces(nextSpaces)` — writes spaces (line 151)

Neither the profile write nor the spaces write is serialized through `runSerializedWrite`. If a concurrent `joinSpace` call executes between steps 2 and 3, it reads the old spaces list, adds a member, and writes. Then step 3 overwrites that write with a stale copy that does not include the new member. Result: a member who just joined disappears from the space silently.

**Trigger:** User renames their profile at the exact same time they (or a team member) triggers a space join on another device that syncs locally. Low probability but possible in multi-device scenarios.

**User/business impact:** Silent data loss of newly joined space membership.

**Fix:** Wrap the spaces read-modify-write in step 2–3 inside `runSerializedWrite(KEYS.SPACES, ...)`.

---

### MEDIUM

#### M-001 — generateShiftEntries uses local Date arithmetic (DST-sensitive), inconsistent with shiftEngine UTC math

**File:** `lib/storage.ts` lines 516–526

**Problem:** `generateShiftEntries` iterates using:
```typescript
const start = new Date(y, m - 1, d);   // local constructor
const date = new Date(start);
date.setDate(start.getDate() + i);
const dateISO = formatDateISO(date);    // getFullYear/Month/Date — local
```

`formatDateISO` uses `date.getFullYear()`, `date.getMonth()`, `date.getDate()` — all local time zone methods. In contrast, `shiftEngine.ts` (the source of truth for shift lookups) uses `Date.UTC()`. On a device in a timezone with a negative UTC offset (e.g., UTC-5 / New York), constructing `new Date(2025, 2, 30)` and then calling `date.setDate(...)` can produce an entry that `formatDateISO` labels as "2025-03-29" while `shiftCodeAtDate` (which uses UTC) treats the same millisecond as "2025-03-30". The result is entries and `shiftCodeAtDate` lookups becoming desynchronized by one day for users in UTC- zones.

**Trigger:** Any user with device timezone west of UTC (UTC-1 or further).

**User/business impact:** Shift plan entries off by one day for non-European users; calendar shows wrong shift for the day; timeclock prompts fire for wrong date.

**Fix:** Replace local Date construction in `generateShiftEntries` with UTC-based arithmetic matching `diffDaysUTC`, or derive `dateISO` by applying `diffDaysUTC`-equivalent logic: compute `Date.UTC(y, m-1, d) + i*86400000`, then extract year/month/day from UTC components.

---

#### M-002 — snoozeShortShiftVacationReminder uses Date.now() + 24h which is DST-sensitive for "tomorrow"

**File:** `lib/storage.ts` line 1083

```typescript
const tomorrow = formatDateISO(new Date(Date.now() + 24 * 60 * 60 * 1000));
```

**Problem:** On the night of a DST spring-forward transition, `Date.now() + 86400000ms` lands 23 hours later in local time, producing the same local calendar date as today. `formatDateISO` uses local `.getFullYear()/.getMonth()/.getDate()`, so `tomorrow` equals `today`. The snooze silently sets `deferredUntilISO = today`, and the reminder reappears immediately on the next `getOpenShortShiftVacationReminders` call.

**Trigger:** User snoozes a reminder between 00:00 and 01:00 local time on the DST spring-forward night.

**User/business impact:** Reminder shows again immediately after snoozing; minor UX annoyance, potentially repeated modal on every focus.

**Fix:** Use addDays-by-calendar-day logic (same pattern as `plusDays` in `start.tsx`):
```typescript
const t = new Date(); t.setDate(t.getDate() + 1);
const tomorrow = formatDateISO(t);
```

---

#### M-003 — getShiftForDate does not check shift overrides via the serialized queue, potential stale read

**File:** `lib/storage.ts` lines 591–601

**Problem:** `getShiftForDate` calls `getShiftOverrides(profileId)` which reads `AsyncStorage.getItem(KEYS.SHIFT_OVERRIDES)` directly, outside any serialized-write context. If `saveShiftOverrides` is mid-flight (writing), `getShiftForDate` may read the pre-write value. While this is inherent to AsyncStorage's single-process model on React Native, it means `getShiftForDate` can return a stale override during the brief write window. The practical impact is small but worth noting in a timeclock context where the stamp popup derives from this value.

**Trigger:** Rapid override set followed immediately by timeclock prompt evaluation.

**User/business impact:** Timeclock prompt shows wrong shift code for a brief moment; user may stamp with incorrect code.

**Fix:** Document as known limitation. For stronger consistency, read overrides inside the same serialized context where they were written, or add a write-through in-memory cache for overrides.

---

#### M-004 — importSpaceFromInvite returns stale `spaces[existingIdx]` (pre-write value) when space already exists

**File:** `lib/storage.ts` lines 324–347

**Problem:**
```typescript
spaces[existingIdx] = { ...existing, memberProfileIds: [...], memberProfiles: [...] };
await setSpaces(spaces);
// ...
return { ok: true, space: spaces[existingIdx] };  // ← still the old value before mutation
```

When the space already exists and the member is added, `spaces[existingIdx]` is reassigned at line 333. The returned `space` in the success response is the mutated object from the `spaces` array — this is actually fine in JavaScript since object references in arrays work this way. However, if `!existing.memberProfileIds.includes(profile.id)` is false (member already present, no write), the code falls through to `return { ok: true, space: spaces[existingIdx] }` at line 346 which correctly returns the existing space. This is consistent. **Reclassify to LOW** if no other caller depends on the returned space having the new member immediately. Verified no caller in `join.tsx` checks the returned `space` object — it only checks `result.ok`. Lower risk than initially assessed.

**Trigger:** Second QR scan of same code on same device.

**User/business impact:** Negligible; only affects callers that inspect the returned space object.

**Fix:** No urgent action. Optionally add a comment clarifying the returned value.

---

#### M-005 — Shift-color overrides and timeclock-config writes unprotected by runSerializedWrite

**Files:** `lib/storage.ts` lines 175–192 (`setShiftColorOverrides`), lines 1743–1755 (`setTimeClockConfig`)

**Problem:** Both functions use a read-then-write pattern (`getItem` → parse → merge → `setItem`) outside `runSerializedWrite`. Concurrent calls to `setShiftColorOverrides` or `setTimeClockConfig` from the same process (e.g., rapid user input in timeclock settings) can produce lost-update: the second read catches the old value before the first write commits.

**Trigger:** User rapidly adjusts multiple timeclock shift windows or shift colors in quick succession.

**User/business impact:** One of the rapid updates is silently lost; user sees unexpected reversal of their settings.

**Fix:** Wrap both functions' read-modify-write loops inside `runSerializedWrite(KEYS.TIMECLOCK_CONFIG, ...)` and `runSerializedWrite(KEYS.SHIFT_COLOR_OVERRIDES, ...)` respectively.

---

#### M-006 — QR payload URL-encodes space name but not ownerDisplayName for all characters

**File:** `app/(space)/qr.tsx` line 88
```
`yasa://join?spaceId=${space.id}&name=${encodeURIComponent(space.name)}&ownerId=${space.ownerProfileId}&ownerName=${encodeURIComponent(space.ownerDisplayName)}&token=${space.inviteToken}`
```

**Problem:** `encodeURIComponent` is applied to `name` and `ownerName`. However, `space.id` and `space.ownerProfileId` (UUIDs) are embedded as-is, which is fine. The `inviteToken` is alphanumeric uppercase, also fine. However in `parseInvitePayload` (join.tsx line 36–54), `new URL(value)` is used where `value` is a `yasa://` custom scheme. The standard `URL` constructor behavior for custom schemes varies across environments — in some React Native environments `searchParams` parsing may not URL-decode correctly for the custom scheme. This is unverified but is a latent cross-platform risk. Additionally, if a space name contains `&` or `=`, the current encoding would be safe due to `encodeURIComponent`, but the token `generateToken()` output (base-36 chars only) cannot contain these.

**Trigger:** Spaces with unusual names on devices where `URL` parsing of custom schemes differs.

**User/business impact:** Join failure with unhelpful error "Ungültiges Einlade-Token."

**Fix:** Add a unit test for `parseInvitePayload` with a space name containing special characters. Consider encoding the entire payload as a JSON base64 string to avoid URL parsing edge cases entirely.

---

#### M-007 — No guard against creating multiple shift plans for the same profile (double-save race)

**File:** `lib/storage.ts` lines 575–585 (`saveShiftPlan`)

**Problem:** `saveShiftPlan` reads all plans, sets `all[plan.profileId] = plan`, and writes back. This is not serialized via `runSerializedWrite(KEYS.SHIFTS, ...)`. The `(shift)/setup.tsx` screen allows rapid re-saves (e.g., cycle length changes trigger saves). A concurrent `today.tsx` backend pull (`saveShiftPlan` via `pullShiftPlansByProfileIds`) racing with a user-initiated save can silently overwrite the user's latest pattern.

**Trigger:** User finalizes shift setup while today.tsx is loading in the background (which triggers `saveShiftPlan`).

**User/business impact:** Silent loss of the most recent shift plan setup.

**Fix:** Wrap `saveShiftPlan`'s read-modify-write inside `runSerializedWrite(KEYS.SHIFTS, ...)`.

---

#### M-008 — canSnoozeShortShiftReminder logic inverted in start.tsx

**File:** `app/start.tsx` line 283–285
```typescript
const canSnoozeShortShiftReminder =
  shortShiftReminder !== null &&
  diffDays(todayISO(), shortShiftReminder.dateISO) > 7;
```

**Problem:** `diffDays(today, reminderDate)` returns positive when `reminderDate` is in the future. The intent is: snooze is only available when the reminder date is MORE THAN 7 days away. This reads as correct. However, `snoozeShortShiftVacationReminder` in storage.ts (line 1081) also has its own guard: `if (daysUntil <= 7) return;` (no-op when too close). These two guards are consistent. No functional bug here — reclassify to informational. However the UI text at line 496–499 says "Ab 7 Tagen vor dem Termin bleibt die Erinnerung verpflichtend" but the condition `> 7` (strictly greater) means a reminder exactly 7 days out cannot be snoozed. The storage guard uses `<= 7` (consistent — 7 days out is urgent). This is internally consistent but the displayed text "Ab 7 Tagen" is ambiguous (user reads it as "from 7 days before" which could mean day 7 is included). Minor UX wording issue, not a bug.

**Trigger:** Reminder exactly 7 days before the shift date.

**User/business impact:** User cannot snooze when exactly 7 days away; text implies they can.

**Fix:** Either change the condition to `>= 8` for clarity, or update the text to "Mehr als 7 Tage vor dem Termin."

---

### LOW

#### L-001 — formatGerman() duplicated across multiple screens without central utility

**Files:** `app/(swap)/index.tsx` line 43, `app/(shift)/setup.tsx` line 45, possibly others

**Problem:** The function `function formatGerman(dateISO: string): string` that formats ISO dates to `DD.MM.YYYY` is reimplemented in at least two different screen files. Any future bug fix or format change requires finding and updating all instances.

**Fix:** Move to `lib/storage.ts` or `constants/theme.ts` as an exported utility and import where needed.

---

#### L-002 — weekdayShort() in setup.tsx uses local getDay() (not UTC-stable)

**File:** `app/(shift)/setup.tsx` line 51–54
```typescript
function weekdayShort(dateISO: string): string {
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const [y, m, d] = dateISO.split('-').map(Number);
  return days[new Date(y, m - 1, d).getDay()];
}
```

**Problem:** Uses local-time constructor and `.getDay()`. For users in UTC- timezones, this can return the wrong weekday near midnight. The `weekdayIndexUTC` function already exported from `shiftEngine.ts` solves this correctly.

**Fix:** Replace with `weekdayIndexUTC(dateISO)` from `shiftEngine.ts` (adjust for the 0=Mo convention vs 0=So convention as needed).

---

#### L-003 — TIMECLOCK_TEST_PROMPT is a QA/debug feature with no production gate

**File:** `lib/storage.ts` lines 1976–2011, `app/(services)/timeclock.tsx` imports `setTimeClockTestPrompt`

**Problem:** The `TIMECLOCK_TEST_PROMPT` storage key and related functions (`setTimeClockTestPrompt`, `clearTimeClockTestPrompt`, `getTimeClockTestPrompt`) are fully accessible in production builds. The test prompt artificially injects a timeclock stamp popup for testing purposes. There is no `__DEV__` gate around the `setTimeClockTestPrompt` call path.

**Fix:** Wrap the `setTimeClockTestPrompt` UI entry point in `(services)/timeclock.tsx` in a `__DEV__ &&` guard to prevent accidental use in production. Alternatively, remove the QA functionality from the production build via a build flag.

---

#### L-004 — No iOS bundleIdentifier in app.json

**File:** `app.json` lines 16–18

**Problem:** The `ios` block only sets `supportsTablet: true`. There is no `bundleIdentifier` set. This means EAS will use a generated or placeholder identifier, which may not match the App Store Connect record or provisioning profile. This is a release build configuration gap.

**Fix:** Add `"bundleIdentifier": "com.bonitox.yasa"` (matching the Android package name convention) to the `ios` block.

---

#### L-005 — No camera permission description in app.json (required for iOS App Store)

**File:** `app.json`

**Problem:** The app uses `expo-camera` for QR scanning. iOS requires `NSCameraUsageDescription` to be declared in the Info.plist. In Expo, this is set via `app.json` under `ios.infoPlist.NSCameraUsageDescription`. Without this, iOS builds will either be rejected by App Store review or crash at runtime when requesting camera permission on iOS.

**Fix:** Add to the `ios` section:
```json
"infoPlist": {
  "NSCameraUsageDescription": "YASA uses the camera to scan QR codes for joining spaces."
}
```

---

#### L-006 — No expo-local-authentication usage description for iOS

**File:** `app.json`

**Problem:** Using Face ID on iOS requires `NSFaceIDUsageDescription` in the Info.plist. Missing this causes App Store rejection and a crash on Face ID devices when `authenticateAsync` is called.

**Fix:** Add to the `ios.infoPlist`:
```json
"NSFaceIDUsageDescription": "YASA uses Face ID to protect the Admin area."
```

---

#### L-007 — storage.ts is 2094 lines and mixing concerns

**File:** `lib/storage.ts` (entire file)

**Problem:** The file contains: profile management, space management, shift plan management, ghost management, vacation management, short-shift reminders, shift overrides, day changes, swap management, time account, timeclock config, timeclock events, timeclock test prompts, timeclock QA calendar, strategy hours bank, strategy journal, and shift color overrides — all in one 2094-line file. This is far beyond reasonable module size and makes the file difficult to navigate, review, and test.

**Fix:** Split into domain modules (e.g., `lib/profileStorage.ts`, `lib/spaceStorage.ts`, `lib/shiftStorage.ts`, `lib/swapStorage.ts`, `lib/timeclockStorage.ts`, `lib/timeAccountStorage.ts`). Export a barrel `lib/storage/index.ts` for backwards compatibility.

---

#### L-008 — getOpenShortShiftVacationReminders has a side-effect write during a read call

**File:** `lib/storage.ts` lines 1036–1043

**Problem:** `getOpenShortShiftVacationReminders` (a pure-read-sounding function) performs a compaction write inside itself: if confirmed reminders are older than the retention window, it calls `saveAllShortShiftVacationReminders(all)`. This write is triggered on every read call and is not serialized. Since the write path calls `runSerializedWrite(KEYS.VACATION_SHORTSHIFT_REMINDERS, ...)` inside `saveAllShortShiftVacationReminders`, this is protected against concurrent writes. However, the compaction logic reads the map once, compacts it, then writes — if another write is in-flight for the same key, the compacted data may contain stale entries. More importantly, the compaction write on read is an unexpected side effect that violates the principle of least surprise for callers.

**Fix:** Separate compaction into a dedicated `compactShortShiftVacationReminders(profileId)` function called explicitly on app startup or on a schedule rather than on every read.

---

#### L-009 — today.tsx pullShiftPlansByProfileIds backend error silently discarded

**File:** `app/(team)/today.tsx` — the import of `pullShiftPlansByProfileIds` from `lib/backend/shiftSync`

**Problem:** In `today.tsx`, backend sync is triggered with a try/catch that on failure likely just shows stale data (the exact catch block was not fully read but pattern-matches the broader codebase style of swallowing backend errors gracefully). While this is intentional for offline-first, there is no user feedback when the sync fails. Users with a Supabase backend configured may see outdated colleague shift data without knowing it.

**Fix:** Add a subtle sync-error indicator (e.g., a muted "Zuletzt synchronisiert: [time]" timestamp) so users can distinguish fresh vs stale team data.

---

#### L-010 — No safeguard against createSwapRequest for a past date

**File:** `lib/storage.ts` lines 1321–1349 (`createSwapRequest`)

**Problem:** `createSwapRequest` validates the date format (`isValidISODate`) but does not check that the date is in the future. A user (or a bug) could create a swap request for a date in the past, which would appear in open requests and pollute the UI.

**Fix:** Add `if (date < todayISO()) return { error: 'Datum liegt in der Vergangenheit.' }` validation before creating the request.

---

## Confirmed Defects vs Probable Risks vs Non-Issues

### Confirmed Defects (reproducible, evidence in code)
- B-001: Credentials in app.json — confirmed, file read
- B-002: `Math.random()` token — confirmed, line 19 create.tsx
- H-001: Incomplete profile delete — confirmed by comparing STORAGE_KEYS against multiRemove call
- H-002: Biometric bypass on non-enrolled device — confirmed, lines 65–67 admin/index.tsx
- H-003: acceptSwapRequest non-atomic multi-key write — confirmed, lines 1462–1472
- H-004: updateProfileOnce unprotected spaces read-modify-write — confirmed, lines 138–151
- M-001: generateShiftEntries local-time arithmetic — confirmed, lines 516–526
- M-002: DST-sensitive tomorrow calculation — confirmed, line 1083
- M-005: setShiftColorOverrides / setTimeClockConfig unprotected RMW — confirmed
- M-007: saveShiftPlan unprotected RMW — confirmed
- L-004/L-005/L-006: Missing app.json release config — confirmed by reading app.json
- L-002: weekdayShort uses local getDay() — confirmed

### Probable Risks (pattern-based, require runtime confirmation)
- M-003: getShiftForDate stale-read window — inherent AsyncStorage behavior, risk proportional to write contention
- M-006: URL parsing of custom scheme in join.tsx — depends on RN runtime behavior
- L-009: Silent backend sync failure in today.tsx — pattern analysis (full body not read)

### Non-Issues / Previously Fixed
- BUG-1 (Root _layout.tsx route groups): CONFIRMED FIXED — all 8 groups declared
- BUG-2 (today.tsx useFocusEffect `!active` inversion): CONFIRMED FIXED — `if (!active)` pattern present
- BUG-3 (admin/index.tsx import inconsistency): CONFIRMED FIXED — `useFocusEffect` imported from `@react-navigation/native`
- Hotfix 17.2 (swap write order): CONFIRMED FIXED — comments at lines 1458–1461 and code ordering verified
- A1-02 (membership guard): CONFIRMED — layout guards present in (swap), (services), (team)
- `runSerializedWrite` for TIMECLOCK_EVENTS: CONFIRMED — `addTimeClockEvent` and `updateTimeClockEvent` both use it

---

## Coverage Map

### Fully Read
- `lib/storage.ts` (complete, 2094 lines)
- `lib/shiftEngine.ts` (complete)
- `lib/auth.ts` (complete)
- `lib/log.ts` (complete)
- `lib/backend/config.ts`, `supabaseClient.ts`, `auth.ts`, `health.ts`, `shiftSync.ts`, `teamSync.ts`, `index.ts` (all complete)
- `types/index.ts`, `types/timeAccount.ts` (complete)
- `constants/theme.ts` (first 80 lines; balance is color/spacing constants)
- `app/_layout.tsx`, `app/start.tsx` (complete)
- `app/index.tsx` (complete, this is actually the start screen)
- `app/(auth)/create-profile.tsx` (complete)
- `app/(space)/create.tsx`, `qr.tsx`, `join.tsx` (complete)
- `app/(admin)/index.tsx` (complete)
- `app/(swap)/index.tsx` (header + key logic)
- `app/(swap)/_layout.tsx`, `app/(services)/_layout.tsx`, `app/(team)/_layout.tsx` (complete)
- `app/(services)/timeclock.tsx` (first 250 lines of ~1000+)
- `app/(services)/index.tsx` (first 80 lines)
- `app/(services)/time-account.tsx` (first 60 lines)
- `app/(team)/today.tsx` (first 80 lines)
- `lib/__tests__/shiftEngine.test.ts`, `timeclock.test.ts`, `strategyEngine.test.ts` (complete)
- `lib/__tests__/timeAccountEngine.test.ts` (first 60 lines)
- `lib/strategyEngine.ts` (first 80 lines)
- `lib/timeAccountEngine.ts` (first 100 lines)
- `package.json`, `app.json`, `eas.json`, `tsconfig.json` (complete)

### Partially Read / Not Fully Read
- `app/(services)/timeclock.tsx` — large file (~1000+ lines), read first 250 lines (layout, helpers, buildShiftCases)
- `app/(shift)/setup.tsx`, `calendar.tsx`, `vacation.tsx`, `strategy.tsx` — read headers and key functions only
- `app/(space)/choose.tsx`, `manage.tsx` — read headers
- `app/(swap)/candidates.tsx` — not read
- `app/(admin)/edit-profile.tsx`, `space-rules.tsx` — not read
- `app/(affiliate)/` — not read (low risk, affiliate feature)
- `lib/timeAccountEngine.ts` — read first 100 lines; full computation logic not reviewed
- `lib/vacationStrategy.ts`, `lib/strategyTypes.ts`, `lib/shiftColors.ts`, `lib/holidays.ts` — not read
- `data/affiliateOffers.ts`, `data/schoolHolidays.ts`, `data/holidays.ts` — not read
- `components/Button.tsx`, `Card.tsx`, `MultiavatarView.tsx` — not read
- `types/affiliate.ts` — not read
- `scripts/` — not read (PowerShell QA/ops scripts, low release risk)

### Not Reviewed
- `.github/` workflows — no `.github/` directory found in the project
- `App.tsx` — not read (Expo Router apps typically use it as entry point shim only)

---

## Test/Validation Gaps

1. **No test for acceptSwapRequest atomicity under concurrent writes.** The multi-key write in `acceptSwapRequest` is the highest-risk untested path.

2. **No test for generateShiftEntries DST behavior.** The DST-sensitivity of the local-time arithmetic (M-001) is not covered by any test.

3. **No test for profile deletion completeness.** `executeProfileDelete` is not tested; the missing-keys gap (H-001) would be caught by a test that reads all STORAGE_KEYS after deletion.

4. **No test for biometric auth bypass (H-002).** This is UI-layer logic and not unit-testable without mocking, but the risk is high enough to warrant a documented manual test case.

5. **No integration test for the QR join flow end-to-end** (encode in qr.tsx → scan + parse in join.tsx → importSpaceFromInvite → space member added).

6. **No test for updateProfileOnce race condition (H-004).** The concurrent spaces write gap has no coverage.

7. **timeAccountEngine.test.ts test count not verified** — the test script does not include `timeAccountEngine.test.ts` in the `npm test` command (package.json line 10 runs only 3 test files). Unknown number of `timeAccountEngine` tests, unknown if they run and pass.

8. **No test for snoozeShortShiftVacationReminder DST edge case (M-002).**

9. **No test for the `(swap)/_layout.tsx`, `(services)/_layout.tsx`, `(team)/_layout.tsx` guards** — verifying redirect behavior requires Expo Router test infrastructure.

---

## Action Plan: Top 10 (in execution order)

1. **[B-001 — IMMEDIATE, pre-commit] Rotate the Supabase anon key.** The currently committed key must be treated as compromised regardless of future fixes. Rotate it in the Supabase dashboard. Add `app.json` to `.gitignore` or strip the credentials block and use EAS Secrets instead.

2. **[B-001 — code fix] Move Supabase config to environment variables.** Update `lib/backend/config.ts` to read from `process.env.EXPO_PUBLIC_SUPABASE_URL` and `process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY`. Create `.env.local` (gitignored) for local development. Add to EAS build profile as secrets.

3. **[L-004/L-005/L-006 — app.json release config] Add iOS bundleIdentifier, NSCameraUsageDescription, NSFaceIDUsageDescription** before any TestFlight/App Store build. Without these, iOS builds will fail in App Store review or crash at runtime.

4. **[H-001 — profile delete] Add all missing storage keys to executeProfileDelete's multiRemove call.** Simple, low-risk, high-compliance value. Verify by writing a test that reads all STORAGE_KEYS after delete and asserts empty.

5. **[H-002 — biometric bypass] Require device PIN when biometrics unavailable.** Change the `!available` branch in `checkAuth` to fall through to `authenticateAsync` with `disableDeviceFallback: false` so that device PIN/password is required. If device has no lock at all, show a warning and deny access rather than granting it.

6. **[M-001 — DST-safe entry generation] Fix generateShiftEntries to use UTC-based date arithmetic.** Rewrite the loop to use `Date.UTC(y, m-1, d) + i * 86400000` and extract year/month/day via `getUTC*` methods. Add a DST test case (UTC-5 timezone) to the test suite.

7. **[H-003/H-004/M-005/M-007 — missing runSerializedWrite guards] Wrap all unprotected read-modify-write operations.** Four locations: `saveShiftPlan` (KEYS.SHIFTS), `updateProfileOnce` spaces write (KEYS.SPACES), `setShiftColorOverrides` (KEYS.SHIFT_COLOR_OVERRIDES), `setTimeClockConfig` (KEYS.TIMECLOCK_CONFIG). Also consider whether `setAllSwaps` in `acceptSwapRequest` should be serialized with KEYS.SWAPS.

8. **[B-002 — token security] Replace Math.random() invite token with CSPRNG.** Add `expo-crypto` or use `globalThis.crypto.getRandomValues`. Generate 128-bit tokens (16 bytes → hex string, 32 chars). Add a token rotation function to `storage.ts` and expose it in `(space)/manage.tsx`.

9. **[L-002 — weekdayShort DST fix] Replace local getDay() in setup.tsx with weekdayIndexUTC.** One-line fix using the existing `weekdayIndexUTC` from `shiftEngine.ts`.

10. **[M-002 — snooze tomorrow DST fix] Replace `Date.now() + 86400000` with `new Date(); t.setDate(t.getDate() + 1)` in snoozeShortShiftVacationReminder.** One-line fix.

---

## 24h Stabilization Plan

The following MUST happen before any release artifact (TestFlight, Google Play internal track) is created:

- [ ] **Rotate the Supabase anon key** (Supabase dashboard → Settings → API → Regenerate). The current key is leaked.
- [ ] **Remove credentials from app.json** and configure EAS Secrets for CI builds. Verify `npm run typecheck` still passes after config change.
- [ ] **Add iOS app.json release config** (bundleIdentifier, NSCameraUsageDescription, NSFaceIDUsageDescription). Verify EAS build does not fail.
- [ ] **Fix H-001 (profile delete keys).** Add all missing keys, write test to verify.
- [ ] **Fix H-002 (biometric bypass).** Test on simulator (no biometrics enrolled) to confirm PIN prompt appears.
- [ ] **Verify `npm test` still passes** after all fixes (it should — no logic changes to tested functions).
- [ ] **Manual smoke test:** Create profile → Create space → Generate QR → Join via QR → Accept swap → Delete profile. Confirm no data remnants after deletion.

---

## 7-Day Hardening Plan

- [ ] Fix M-001 (generateShiftEntries DST) and add UTC-5 test case to shiftEngine.test.ts.
- [ ] Wrap the four unprotected RMW operations with runSerializedWrite (H-003/H-004/M-005/M-007).
- [ ] Replace Math.random() invite tokens with CSPRNG and add token rotation UI.
- [ ] Fix M-002 (snooze DST) and L-002 (weekdayShort DST).
- [ ] Add `expo-local-authentication` permission declarations if required for iOS.
- [ ] Add `timeAccountEngine.test.ts` to the `npm test` script and verify it runs.
- [ ] Write a test for `acceptSwapRequest` that verifies shift swap atomicity under concurrent `saveShiftPlan`.
- [ ] Begin splitting `storage.ts` into domain modules (this is a 2-day task; do not rush into a release).
- [ ] Add `__DEV__` gate around `setTimeClockTestPrompt` in timeclock.tsx.
- [ ] Add L-010 (future-date validation for swap requests).

---

## Appendix: File-by-File Finding Index

| File | Findings | Severity |
|------|----------|----------|
| `app.json` | B-001, L-004, L-005, L-006 | BLOCKER, LOW×3 |
| `app/(space)/create.tsx` | B-002 | BLOCKER |
| `app/(admin)/index.tsx` | H-001, H-002 | HIGH×2 |
| `lib/storage.ts` | H-003, H-004, M-001, M-002, M-004, M-005, M-007, M-008, L-007, L-008, L-010 | HIGH×2, MED×6, LOW×3 |
| `app/(space)/qr.tsx` | M-006 (partial) | MEDIUM |
| `app/(space)/join.tsx` | M-006 (partial) | MEDIUM |
| `app/(services)/timeclock.tsx` | M-003 (indirect), L-003 | MEDIUM, LOW |
| `app/(shift)/setup.tsx` | L-001, L-002 | LOW×2 |
| `app/(swap)/index.tsx` | L-001 | LOW |
| `lib/auth.ts` | No issues found. Biometric API usage is correct; the bypass is in the caller (admin/index.tsx). | — |
| `lib/shiftEngine.ts` | No issues found. UTC-stable, correct modular arithmetic, NaN guard present. | — |
| `lib/log.ts` | No issues found. `__DEV__` gate correct; no prod logging. | — |
| `lib/backend/config.ts` | No issues found in isolation; B-001 is the app.json configuration issue. | — |
| `lib/backend/supabaseClient.ts` | No issues found in isolation. | — |
| `lib/backend/auth.ts` | No issues found. Anonymous auth pattern is correct. | — |
| `lib/backend/health.ts` | No issues found. Error handling is correct. | — |
| `lib/backend/shiftSync.ts` | No issues found. Upsert with onConflict is correct. | — |
| `lib/backend/teamSync.ts` | No issues found. Merge logic is correct; fallback tokens are derived deterministically. | — |
| `types/index.ts` | No issues found. Types are complete and well-commented. | — |
| `types/timeAccount.ts` | No issues found. | — |
| `lib/__tests__/shiftEngine.test.ts` | No issues found. DST edge cases covered, NaN guard tested. | — |
| `lib/__tests__/timeclock.test.ts` | No issues found. State machine transitions G1–G6 covered. | — |
| `lib/__tests__/strategyEngine.test.ts` | No issues found. | — |
| `app/_layout.tsx` | No issues found. All 8 route groups declared. | — |
| `app/start.tsx` (index.tsx) | M-008 (wording), no logic bugs | LOW |
| `app/(auth)/create-profile.tsx` | No issues found. Input validation, UUID generation, avatar seed derivation all correct. | — |
| `app/(swap)/_layout.tsx` | No issues found. Guard correct. | — |
| `app/(services)/_layout.tsx` | No issues found. Guard correct. | — |
| `app/(team)/_layout.tsx` | No issues found. Guard correct. | — |
| `app/(team)/today.tsx` | L-009 | LOW |
| `eas.json` | No issues found. Build profiles are correct; autoIncrement on production is appropriate. | — |
| `tsconfig.json` | No issues found. strict: true is set. | — |
| `package.json` | No issues found. sucrase-node test runner is development-only. timeAccountEngine.test.ts not in test script (gap, see L-007 area). | LOW |

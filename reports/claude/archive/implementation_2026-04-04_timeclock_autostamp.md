# Timeclock Auto-Placeholder Stamping
**Date:** 2026-04-04
**Status:** COMPLETE — tsc exit 0, 183 tests PASS (10 new)

---

## Problem Statement

Users who forget to stamp Kommen/Gehen for a past shift had no automatic fallback.
The timeclock service screen showed an empty or incomplete event list. There was also
no feedback on the home screen (`index.tsx`) that stamps were missing.

Requirements addressed:
1. Auto-create placeholder events when a shift's cutoff window has elapsed.
2. Placeholders editable via existing "Bearbeiten" flow — no new UI needed.
3. Informational banner on `index.tsx` pointing to timeclock service screen.
4. `(Platzhalter)` badge on auto-generated events in `timeclock.tsx` event list.
5. No duplicate auto-events. No overwrite of existing manual stamps.
6. Preserve anomaly handling — anomalous shifts must not receive new events.

---

## Architecture

### New module: `lib/autoStamp.ts`

```typescript
export const AUTOSTAMP_LOOKBACK_DAYS = 7;
export const AUTOSTAMP_EXTRA_GRACE_HOURS = 2;

export async function autoStampMissedShifts(
  profileId: string,
  options?: { nowOverride?: Date }
): Promise<number>
```

Algorithm (per day in lookback window, daysBack = 1..7):
```
1. dateISO = formatDateISO(now - daysBack)
2. shiftCode = getShiftForDate(profileId, dateISO)
   → not regular (F/S/N/KS/KN/T)? skip
3. cutoff = endAt + postShiftGraceMinutes + AUTOSTAMP_EXTRA_GRACE_HOURS
   → now <= cutoff? skip (user still has time)
4. events = getTimeClockEvents(profileId) filtered for dateISO+shiftCode
   phase = deriveTimeClockStampState(events)
   → completed? skip (idempotent)
   → anomaly? skip (do not touch)
5. awaiting_check_in → addTimeClockEvent(check_in, source='auto_placeholder')
                       addTimeClockEvent(check_out, source='auto_placeholder')
   awaiting_check_out → addTimeClockEvent(check_out, source='auto_placeholder')
6. return total created count
```

### Cutoff Calculation

```
cutoff = toDateFromISOAndTime(dateISO, settings.endTime)
       + settings.postShiftGraceMinutes (minutes → ms)
       + AUTOSTAMP_EXTRA_GRACE_HOURS (hours → ms)

Night shift (endTime < startTime): endAt adjusted +24h before cutoff calc.
```

Default cutoffs:
| Shift | End | Grace | Extra | Cutoff |
|-------|-----|-------|-------|--------|
| F | 14:00 | 15 min | 2 h | 16:15 |
| S | 22:00 | 15 min | 2 h | 00:15+1d |
| N | 06:00+1d | 30 min | 2 h | 08:30+1d |
| KS | 22:00 | 15 min | 2 h | 00:15+1d |
| KN | 06:00 | 30 min | 2 h | 08:30 |
| T | 16:00 | 15 min | 2 h | 18:15 |

---

## Data Model Change

### `types/index.ts`

```typescript
// Before
source: 'manual_popup' | 'manual_service' | 'manual_edit' | 'manual_test_popup';

// After
source: 'manual_popup' | 'manual_service' | 'manual_edit' | 'manual_test_popup' | 'auto_placeholder';
```

Backward compat:
- Existing stored events never have `source: 'auto_placeholder'`
- `updateTimeClockEvent` patch already includes `source` field
- `compactTimeClockEvents` key includes eventType+timestamp, not source — dedup unaffected

---

## Files Changed

### `lib/autoStamp.ts` (NEW)

Key exports:
- `AUTOSTAMP_LOOKBACK_DAYS = 7` — exported constant, used in tests
- `AUTOSTAMP_EXTRA_GRACE_HOURS = 2` — exported constant, used in tests
- `autoStampMissedShifts(profileId, options?)` — main function

Internal helpers (not exported):
- `isRegularShiftCode(code)` — type guard
- `parseHHMM(input)` — pure HH:MM → minutes
- `toDateFromISOAndTime(dateISO, hhmm)` — local-time Date
- `weekdayLabelDE(dateISO)` — German weekday string

### `app/index.tsx`

Import added:
```typescript
import { autoStampMissedShifts } from '../lib/autoStamp';
```

State added:
```typescript
const [missedStampCount, setMissedStampCount] = useState(0);
```

In `loadCurrentContext` (after `detectStampPrompt`, before shortShiftReminders):
```typescript
let newPlaceholders = 0;
try {
  newPlaceholders = await autoStampMissedShifts(p.id);
} catch { /* best-effort */ }
setMissedStampCount(newPlaceholders);
```

Banner JSX (after swapBanner, before hints):
```jsx
{missedStampCount > 0 && (
  <TouchableOpacity
    style={styles.missedStampBanner}
    onPress={() => router.push('/(services)/timeclock')}
    activeOpacity={0.7}
  >
    <Text style={styles.missedStampBannerText}>
      ⏱️ {missedStampCount === 1
        ? '1 Stempelzeit wurde als Platzhalter erfasst'
        : `${missedStampCount} Stempelzeiten wurden als Platzhalter erfasst`}
    </Text>
    <Text style={styles.missedStampBannerLink}>Überprüfen →</Text>
  </TouchableOpacity>
)}
```

Styles added: `missedStampBanner`, `missedStampBannerText`, `missedStampBannerLink`.

### `app/(services)/timeclock.tsx`

Import added:
```typescript
import { autoStampMissedShifts } from '../../lib/autoStamp';
```

In `loadData` (before `getTimeClockConfigOrDefault`, ensures events read after stamps):
```typescript
try { await autoStampMissedShifts(p.id); } catch { /* best-effort */ }
```

Event list — `(Platzhalter)` badge:
```jsx
<View style={styles.eventTypeRow}>
  <Text style={styles.eventType}>{e.eventType === 'check_in' ? 'Kommen' : 'Gehen'}</Text>
  {e.source === 'auto_placeholder' && (
    <Text style={styles.autoPlaceholderBadge}>(Platzhalter)</Text>
  )}
</View>
```

Styles added: `eventTypeRow`, `autoPlaceholderBadge`.

### `lib/__tests__/timeclock.test.ts`

Import added:
```typescript
import { autoStampMissedShifts, AUTOSTAMP_LOOKBACK_DAYS, AUTOSTAMP_EXTRA_GRACE_HOURS } from '../autoStamp';
```

New suite `autoStampMissedShifts` — 10 tests:

| Test | Scenario | Expected |
|------|----------|----------|
| Constant | AUTOSTAMP_LOOKBACK_DAYS === 7 | PASS |
| Constant | AUTOSTAMP_EXTRA_GRACE_HOURS === 2 | PASS |
| A1 | No shift plan for any date | 0 events |
| A2 | Non-regular shift code (R) | 0 events |
| A3 | N-shift cutoff not reached (07:00 < 08:30) | 0 events |
| A4 | Phase completed (manual check_in+check_out present) | 0 new events, idempotent |
| A5 | Phase anomaly (double check_in) | 0 new events |
| A6 | Phase awaiting_check_in (no events) | 2 events, source=auto_placeholder |
| A7 | Phase awaiting_check_out (check_in present) | 1 event check_out, source=auto_placeholder |
| A8 | 2 days both missed | 4 events total (2 per day) |

Test fixture setup: `nowOverride = new Date(2026, 3, 4, 18, 0, 0)` (F-cutoff = 16:15 on April 3, triggered).
A3 uses `nowOverride = new Date(2026, 3, 4, 7, 0, 0)` (N-cutoff = 08:30, not yet triggered).

---

## Test Results

```
autoStampMissedShifts suite:
  ✓ AUTOSTAMP_LOOKBACK_DAYS ist 7
  ✓ AUTOSTAMP_EXTRA_GRACE_HOURS ist 2
  ✓ A1: Kein Schichtplan → 0 Platzhalter
  ✓ A2: Nicht-regulärer Schichtcode (R) → 0 Platzhalter
  ✓ A3: Cutoff noch nicht erreicht (N-Schicht) → 0 Platzhalter
  ✓ A4: Phase completed → 0 neue Events (idempotent)
  ✓ A5: Phase anomaly → 0 neue Events (kein Eingriff)
  ✓ A6: awaiting_check_in → 2 Platzhalter (Kommen + Gehen)
  ✓ A7: awaiting_check_out → 1 Platzhalter (nur Gehen)
  ✓ A8: Zwei vergessene Tage → 4 Platzhalter

Total: 183 tests PASS (10 new), 0 failed
tsc --noEmit: exit 0
```

---

## Regression Safety

| Guard | Status |
|-------|--------|
| Existing manual stamp events | ✅ Unchanged — autoStamp only adds, never mutates |
| `deriveTimeClockStampState` logic | ✅ Unchanged — reused as idempotency guard |
| Anomaly handling | ✅ autoStamp skips anomalous phases — no interference |
| Ghost presence / ghost sync | ✅ Unrelated code path |
| Swap / team sync | ✅ Unrelated |
| TypeScript strict mode | ✅ tsc exit 0 |
| All 173 pre-existing tests | ✅ All PASS |

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| autoStamp creates events for wrong shift | LOW | Uses `getShiftForDate` (same as popup detection) |
| Night shift endAt calculation off | LOW | Tested in A3; endAt += 24h when endAt <= startAt |
| Double-stamp on rapid focus cycles | NEGLIGIBLE | Idempotency via phase check before any write |
| autoStamp blocks loadData | LOW | Best-effort try/catch in both callers |
| Placeholder timestamps in UTC vs local | ACCEPTED | toISOString() of local Date — same as manual_service |

---

## Related Files
- `lib/storage.ts` — `addTimeClockEvent`, `getTimeClockEvents`, `deriveTimeClockStampState`, `getShiftForDate`, `getTimeClockConfigOrDefault`, `formatDateISO` — all reused, unchanged
- `types/index.ts` — `TimeClockEvent.source` union extended
- Previous fix: `archive/implementation_2026-04-04_ghost_presence_propagation.md`

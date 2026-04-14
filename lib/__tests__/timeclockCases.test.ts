/**
 * Tests für lib/timeclockCases.ts (Pure Logic – kein AsyncStorage nötig)
 *
 * Ausführen: cd yasa && npx sucrase-node lib/__tests__/timeclockCases.test.ts
 *
 * Abgedeckte Szenarien (P0 2026-04-11 Timeclock Consistency Fix):
 *   P1. buildShiftCases – Editierter N-Shift-Pair (22:00 D → 06:00 D) → completed (workedHours=8)
 *   P2. buildShiftCases – N-Shift mit Early-Checkout (22:00 D → 04:00 D) → completed (workedHours=6)
 *   P3. buildShiftCases – N-Shift mit Auto-Placeholder (21:45 D → 06:00 D+1) → completed (workedHours=8.25)
 *   P4. buildShiftCases – F-Shift normal (06:00 → 14:00) → completed (workedHours=8)
 *   P5. buildShiftCases – Open N check_in ohne check_out → Unvollständig
 *   P6. isValidNShiftPair – Normalfenster akzeptiert
 *   P7. isValidNShiftPair – Early-Checkout 04:00 akzeptiert
 *   P8. isValidNShiftPair – check_in zu früh (20:00) abgelehnt
 *   P9. isValidNShiftPair – check_out zu spät (07:00) abgelehnt
 *   P10. isOvernightShift – N und KN sind overnight; F/S/T nicht
 *   P11. buildDaySummaries – deltaHours korrekt pro Tag aggregiert (NICHT mit Flex gemischt)
 *   P12. computeShiftFlexCreditHours – Flex-Credit separat, NICHT in Delta
 *   P13. buildShiftCases – Edited F-Shift Pair via manual_edit → completed
 */

(global as Record<string, unknown>).__DEV__ = false;

import {
  buildShiftCases,
  buildDaySummaries,
  isValidNShiftPair,
  isOvernightShift,
  computeShiftFlexCreditHours,
  pairCaseEvents,
} from '../timeclockCases';
import type { TimeClockEvent, UserTimeClockConfig, RegularShiftCode } from '../../types';

// ─── Minimales Test-Framework ───────────────────────────────────────────────

let passed = 0;
let failed = 0;

function describe(suiteName: string, fn: () => void): void {
  process.stdout.write(`\n  ${suiteName}\n`);
  fn();
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    process.stdout.write(`    ✓ ${name}\n`);
    passed++;
  } catch (e) {
    process.stdout.write(`    ✗ ${name}\n`);
    process.stdout.write(`      → ${e instanceof Error ? e.message : String(e)}\n`);
    failed++;
  }
}

function eq<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(
      msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function near(actual: number, expected: number, tolerance: number, msg?: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(msg ?? `Expected ~${expected} (±${tolerance}), got ${actual}`);
  }
}

// ─── Hilfsfunktionen ────────────────────────────────────────────────────────

const defaultConfig: UserTimeClockConfig = {
  profileId: 'p1',
  shiftSettings: {
    F: { startTime: '06:00', endTime: '14:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
    S: { startTime: '14:00', endTime: '22:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
    N: { startTime: '22:00', endTime: '06:00', paidFlexMinutes: 15, postShiftGraceMinutes: 30 },
    KS: { startTime: '16:00', endTime: '22:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
    KN: { startTime: '00:00', endTime: '06:00', paidFlexMinutes: 15, postShiftGraceMinutes: 30 },
    T: { startTime: '08:00', endTime: '16:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
  },
  updatedAt: '2026-04-10T00:00:00.000Z',
};

function localISO(y: number, m: number, d: number, hh: number, mm: number): string {
  // Lokale Zeit → ISO (respektiert lokale Timezone wie toTimestampISO in der UI).
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

function makeEvent(
  id: string,
  dateISO: string,
  shiftCode: RegularShiftCode,
  eventType: TimeClockEvent['eventType'],
  timestampISO: string,
  source: TimeClockEvent['source'] = 'manual_service',
  createdAt?: string
): TimeClockEvent {
  return {
    id,
    profileId: 'p1',
    dateISO,
    weekdayLabel: 'Freitag',
    shiftCode,
    eventType,
    timestampISO,
    source,
    createdAt: createdAt ?? timestampISO,
  };
}

// ─── P1: Editierter N-Shift-Pair (beide auf Tag D) ──────────────────────────

describe('buildShiftCases – P0 Consistency Fix', () => {
  test('P1: Edited N pair (22:00 D, 06:00 D) → completed (workedHours=8, deltaHours=0)', () => {
    // Auto-Placeholder hat ursprünglich check_out auf D+1 06:00 gespeichert.
    // Nach User-Edit via "Bearbeiten" → dateISO bleibt D, neue Zeit 06:00 → Timestamp 06:00 D.
    // createdAt wird in updateTimeClockEvent NICHT geändert (Originalreihenfolge bleibt).
    const events: TimeClockEvent[] = [
      makeEvent(
        'e1',
        '2026-04-10',
        'N',
        'check_in',
        localISO(2026, 4, 10, 22, 0),
        'auto_placeholder',
        '2026-04-11T08:00:00.000Z' // autoStamp ran day after
      ),
      makeEvent(
        'e2',
        '2026-04-10',
        'N',
        'check_out',
        localISO(2026, 4, 10, 6, 0), // ← P0 BUG: time resolves to D, not D+1
        'manual_edit',
        '2026-04-11T08:00:01.000Z'
      ),
    ];
    const cases = buildShiftCases(events, defaultConfig);
    eq(cases.length, 1, 'Erwartet 1 ShiftCase');
    const c = cases[0];
    eq(c.segmentCount, 1, 'Erwartet 1 gepaarten Abschnitt (kein Unvollständig)');
    near(c.workedHours ?? -1, 8, 0.01, 'workedHours soll 8h sein (22→06 +24h overnight)');
    near(c.plannedHours, 8, 0.01, 'plannedHours für N ist 8h');
    near(c.deltaHours ?? -999, 0, 0.01, 'deltaHours soll 0 sein (worked==planned)');
  });

  test('P2: Edited N pair with EARLY checkout (22:00 D → 04:00 D) → completed (workedHours=6)', () => {
    // User verlässt Schicht früher und editiert check_out zu 04:00.
    // Erwartet: segmentCount=1, workedHours=6 (22→04 +24h), deltaHours=-2.
    const events: TimeClockEvent[] = [
      makeEvent(
        'e1',
        '2026-04-10',
        'N',
        'check_in',
        localISO(2026, 4, 10, 22, 0),
        'manual_service',
        '2026-04-10T20:00:00.000Z'
      ),
      makeEvent(
        'e2',
        '2026-04-10',
        'N',
        'check_out',
        localISO(2026, 4, 10, 4, 0), // ← early checkout, time on day D
        'manual_edit',
        '2026-04-10T20:00:01.000Z'
      ),
    ];
    const cases = buildShiftCases(events, defaultConfig);
    eq(cases.length, 1);
    const c = cases[0];
    eq(c.segmentCount, 1, 'Early checkout muss gepaart werden (kein Unvollständig)');
    near(c.workedHours ?? -1, 6, 0.01, 'workedHours 6h (22→04 +24h)');
    near(c.deltaHours ?? -999, -2, 0.01, 'deltaHours -2 (6 worked - 8 planned)');
  });

  test('P3: Auto-Placeholder N pair (21:45 D, 06:00 D+1) → completed (workedHours≈8.25)', () => {
    // Normal auto-placeholder: endAt.toISOString() liegt auf D+1.
    const events: TimeClockEvent[] = [
      makeEvent(
        'e1',
        '2026-04-10',
        'N',
        'check_in',
        localISO(2026, 4, 10, 21, 45),
        'auto_placeholder'
      ),
      makeEvent(
        'e2',
        '2026-04-10',
        'N',
        'check_out',
        localISO(2026, 4, 11, 6, 0), // D+1
        'auto_placeholder',
        localISO(2026, 4, 10, 21, 45, )
      ),
    ];
    const cases = buildShiftCases(events, defaultConfig);
    eq(cases.length, 1);
    const c = cases[0];
    eq(c.segmentCount, 1);
    near(c.workedHours ?? -1, 8.25, 0.02, 'workedHours ≈ 8.25h (21:45 → 06:00)');
  });

  test('P4: F-Shift normal (06:00 → 14:00) → completed (workedHours=8)', () => {
    const events: TimeClockEvent[] = [
      makeEvent('e1', '2026-04-10', 'F', 'check_in', localISO(2026, 4, 10, 6, 0)),
      makeEvent('e2', '2026-04-10', 'F', 'check_out', localISO(2026, 4, 10, 14, 0)),
    ];
    const cases = buildShiftCases(events, defaultConfig);
    eq(cases.length, 1);
    const c = cases[0];
    eq(c.segmentCount, 1);
    near(c.workedHours ?? -1, 8, 0.01);
    near(c.deltaHours ?? -999, 0, 0.01);
  });

  test('P5: Open N check_in ohne check_out → Unvollständig (workedHours=null)', () => {
    const events: TimeClockEvent[] = [
      makeEvent('e1', '2026-04-10', 'N', 'check_in', localISO(2026, 4, 10, 22, 0)),
    ];
    const cases = buildShiftCases(events, defaultConfig);
    eq(cases.length, 1);
    const c = cases[0];
    eq(c.segmentCount, 0);
    eq(c.workedHours, null);
    eq(c.deltaHours, null);
    eq(c.hasOpenCheckIn, true);
  });

  test('P13: Edited F-Shift Pair via manual_edit → completed', () => {
    // User korrigiert check_in auf 06:15, check_out auf 14:00.
    const events: TimeClockEvent[] = [
      makeEvent(
        'e1',
        '2026-04-10',
        'F',
        'check_in',
        localISO(2026, 4, 10, 6, 15),
        'manual_edit',
        '2026-04-10T07:00:00.000Z'
      ),
      makeEvent(
        'e2',
        '2026-04-10',
        'F',
        'check_out',
        localISO(2026, 4, 10, 14, 0),
        'manual_edit',
        '2026-04-10T07:00:01.000Z'
      ),
    ];
    const cases = buildShiftCases(events, defaultConfig);
    eq(cases.length, 1);
    const c = cases[0];
    eq(c.segmentCount, 1);
    near(c.workedHours ?? -1, 7.75, 0.01, '06:15 → 14:00 = 7h 45min');
    near(c.deltaHours ?? -999, -0.25, 0.01, 'deltaHours -0.25 (7.75 worked - 8 planned)');
  });
});

// ─── isValidNShiftPair ─────────────────────────────────────────────────────

describe('isValidNShiftPair – N-Shift Toleranzfenster', () => {
  test('P6: Normalfenster check_in 22:00 + check_out 06:00 → valid', () => {
    eq(
      isValidNShiftPair(
        localISO(2026, 4, 10, 22, 0),
        localISO(2026, 4, 11, 6, 0)
      ),
      true
    );
  });

  test('P6b: Normalfenster check_in 21:30 + check_out 06:30 → valid', () => {
    eq(
      isValidNShiftPair(
        localISO(2026, 4, 10, 21, 30),
        localISO(2026, 4, 11, 6, 30)
      ),
      true
    );
  });

  test('P7: Early-Checkout check_in 22:00 + check_out 04:00 → valid (Sonderfall)', () => {
    eq(
      isValidNShiftPair(
        localISO(2026, 4, 10, 22, 0),
        localISO(2026, 4, 11, 4, 0)
      ),
      true
    );
  });

  test('P7b: Early-Checkout check_in 21:45 + check_out 05:00 → valid', () => {
    eq(
      isValidNShiftPair(
        localISO(2026, 4, 10, 21, 45),
        localISO(2026, 4, 11, 5, 0)
      ),
      true
    );
  });

  test('P8: check_in 20:00 (zu früh) → NOT valid', () => {
    eq(
      isValidNShiftPair(
        localISO(2026, 4, 10, 20, 0),
        localISO(2026, 4, 11, 6, 0)
      ),
      false
    );
  });

  test('P9: check_out 07:00 (zu spät) → NOT valid', () => {
    eq(
      isValidNShiftPair(
        localISO(2026, 4, 10, 22, 0),
        localISO(2026, 4, 11, 7, 0)
      ),
      false
    );
  });

  test('P9b: check_out 03:30 (zu früh, außerhalb Early-Fenster) → NOT valid', () => {
    eq(
      isValidNShiftPair(
        localISO(2026, 4, 10, 22, 0),
        localISO(2026, 4, 11, 3, 30)
      ),
      false
    );
  });
});

// ─── isOvernightShift ──────────────────────────────────────────────────────

describe('isOvernightShift', () => {
  test('P10: N ist overnight (22:00 → 06:00)', () => {
    eq(isOvernightShift(defaultConfig, 'N'), true);
  });

  test('P10b: F, S, KS, KN, T sind NICHT overnight (end > start innerhalb eines Tages)', () => {
    // KN = 00:00 → 06:00 → Start=0, End=360 → NICHT overnight (alles am selben Tag)
    eq(isOvernightShift(defaultConfig, 'F'), false);
    eq(isOvernightShift(defaultConfig, 'S'), false);
    eq(isOvernightShift(defaultConfig, 'KS'), false);
    eq(isOvernightShift(defaultConfig, 'KN'), false);
    eq(isOvernightShift(defaultConfig, 'T'), false);
  });

  test('P10c: null config → false', () => {
    eq(isOvernightShift(null, 'N'), false);
  });

  test('P10d: Custom overnight KN (20:00 → 02:00) → true', () => {
    const cfgKN: UserTimeClockConfig = {
      ...defaultConfig,
      shiftSettings: {
        ...defaultConfig.shiftSettings,
        KN: { startTime: '20:00', endTime: '02:00', paidFlexMinutes: 15, postShiftGraceMinutes: 30 },
      },
    };
    eq(isOvernightShift(cfgKN, 'KN'), true);
  });
});

// ─── buildDaySummaries ─────────────────────────────────────────────────────

describe('buildDaySummaries – Delta-Aggregation (nicht Flex)', () => {
  test('P11: deltaHours pro Tag korrekt summiert; Flex separat', () => {
    // 2 Shifts am 2026-04-10: F (8h, delta 0) + S (7.5h, delta -0.5)
    // Erwartete Tagessumme: worked=15.5, delta=-0.5
    const events: TimeClockEvent[] = [
      makeEvent('e1', '2026-04-10', 'F', 'check_in', localISO(2026, 4, 10, 6, 0)),
      makeEvent('e2', '2026-04-10', 'F', 'check_out', localISO(2026, 4, 10, 14, 0)),
      makeEvent('e3', '2026-04-10', 'S', 'check_in', localISO(2026, 4, 10, 14, 30)),
      makeEvent('e4', '2026-04-10', 'S', 'check_out', localISO(2026, 4, 10, 22, 0)),
    ];
    const cases = buildShiftCases(events, defaultConfig);
    eq(cases.length, 2);
    const days = buildDaySummaries(cases);
    eq(days.length, 1);
    const day = days[0];
    near(day.workedHours, 15.5, 0.01, 'F 8h + S 7.5h = 15.5h worked');
    near(day.deltaHours, -0.5, 0.01, 'Delta: 0 + (-0.5) = -0.5, NICHT durch Flex beeinflusst');
    eq(day.completedShiftCount, 2);
  });
});

// ─── computeShiftFlexCreditHours ───────────────────────────────────────────

describe('computeShiftFlexCreditHours – Paid Flex Credit (separat von Delta)', () => {
  test('P12: Früher Check-in 05:45 + pünktliches Gehen → Flex-Credit 15min (0.25h)', () => {
    const flex = computeShiftFlexCreditHours(
      '2026-04-10',
      'F',
      localISO(2026, 4, 10, 5, 45),
      localISO(2026, 4, 10, 14, 0),
      defaultConfig
    );
    near(flex, 0.25, 0.01, '15 Minuten Flex-Credit (cap bei paidFlexMinutes=15)');
  });

  test('P12b: Normale Stempel (genau 06:00 → 14:00) → Flex-Credit 0', () => {
    const flex = computeShiftFlexCreditHours(
      '2026-04-10',
      'F',
      localISO(2026, 4, 10, 6, 0),
      localISO(2026, 4, 10, 14, 0),
      defaultConfig
    );
    near(flex, 0, 0.01);
  });

  test('P12c: N-Shift Edited (22:00 D → 06:00 D) → Flex-Credit 0 (exakt planned)', () => {
    // Overnight-Crossover muss auch hier +24h anwenden, sonst negative Differenz.
    const flex = computeShiftFlexCreditHours(
      '2026-04-10',
      'N',
      localISO(2026, 4, 10, 22, 0),
      localISO(2026, 4, 10, 6, 0), // day D, crossover expected
      defaultConfig
    );
    near(flex, 0, 0.01, 'N-Shift exakt planned (kein Flex-Credit)');
  });

  test('P12d: N-Shift mit 15min früher Checkin (21:45 D → 06:00 D+1) → Flex-Credit 0.25', () => {
    const flex = computeShiftFlexCreditHours(
      '2026-04-10',
      'N',
      localISO(2026, 4, 10, 21, 45),
      localISO(2026, 4, 11, 6, 0),
      defaultConfig
    );
    near(flex, 0.25, 0.01, '15min früh → 0.25h Flex-Credit');
  });

  test('P12e: Invariant – Flex-Credit-Wert beeinflusst deltaHours NICHT', () => {
    // Gleicher Pair wie P12 mit früherem Check-in: deltaHours muss dem
    // tatsächlichen worked-planned entsprechen, nicht plus/minus Flex.
    const events: TimeClockEvent[] = [
      makeEvent('e1', '2026-04-10', 'F', 'check_in', localISO(2026, 4, 10, 5, 45)),
      makeEvent('e2', '2026-04-10', 'F', 'check_out', localISO(2026, 4, 10, 14, 0)),
    ];
    const cases = buildShiftCases(events, defaultConfig);
    eq(cases.length, 1);
    const c = cases[0];
    near(c.workedHours ?? -1, 8.25, 0.01, 'worked 8.25h');
    // INVARIANTE: Delta = worked - planned = 8.25 - 8 = +0.25 (NICHT um Flex reduziert)
    near(c.deltaHours ?? -999, 0.25, 0.01, 'delta = worked - planned, strikt');
    // Flex-Credit ist SEPARAT tracked
    near(c.flexCreditHours ?? -1, 0.25, 0.01, 'flexCreditHours ist eigenständiges Feld');
  });
});

// ─── pairCaseEvents direkte Unit-Tests ─────────────────────────────────────

describe('pairCaseEvents – direkte Unit-Tests', () => {
  test('Overnight crossover: N check_out ≤ check_in → +24h', () => {
    const events: TimeClockEvent[] = [
      makeEvent('e1', '2026-04-10', 'N', 'check_in', localISO(2026, 4, 10, 22, 0)),
      makeEvent('e2', '2026-04-10', 'N', 'check_out', localISO(2026, 4, 10, 6, 0)),
    ];
    const r = pairCaseEvents(events, defaultConfig, 'N');
    eq(r.segmentCount, 1);
    near(r.workedMinutes, 480, 1, '8h = 480min');
  });

  test('Non-overnight (F) with check_out ≤ check_in → NO +24h (diff stays negative)', () => {
    // Dafür müsste der User versehentlich beide Events falsch herum haben.
    // F ist nicht overnight → kein Crossover-Wrap → Segment nicht gepaart.
    const events: TimeClockEvent[] = [
      makeEvent('e1', '2026-04-10', 'F', 'check_in', localISO(2026, 4, 10, 14, 0)),
      makeEvent('e2', '2026-04-10', 'F', 'check_out', localISO(2026, 4, 10, 6, 0)),
    ];
    const r = pairCaseEvents(events, defaultConfig, 'F');
    eq(r.segmentCount, 0, 'F-Shift darf NICHT crossover wrappen');
    eq(r.workedMinutes, 0);
  });

  test('Fallback pairing: exactly one check_in + one check_out with wrong createdAt order still pairs (overnight)', () => {
    // Legacy/edge-case: check_out wurde früher erstellt als check_in.
    // Ergebnis soll trotzdem ein valides Paar sein, statt "Unvollständig".
    const events: TimeClockEvent[] = [
      makeEvent(
        'e2',
        '2026-04-10',
        'N',
        'check_out',
        localISO(2026, 4, 10, 6, 0),
        'manual_edit',
        '2026-04-10T08:00:00.000Z'
      ),
      makeEvent(
        'e1',
        '2026-04-10',
        'N',
        'check_in',
        localISO(2026, 4, 10, 22, 0),
        'manual_edit',
        '2026-04-10T08:00:01.000Z'
      ),
    ];
    const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const r = pairCaseEvents(sorted, defaultConfig, 'N');
    eq(r.segmentCount, 1, 'Fallback soll ein Segment bilden');
    near(r.workedMinutes, 480, 1, '22:00 -> 06:00 (overnight) = 8h');
  });
});

// ─── Ergebnis ───────────────────────────────────────────────────────────────

process.stdout.write(
  `\n  Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen\n\n`
);
if (failed > 0) process.exit(1);

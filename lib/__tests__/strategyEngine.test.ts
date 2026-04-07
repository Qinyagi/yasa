import { buildVacationStrategies, resolveOriginalShiftCodeForDate } from '../strategyEngine';
import type { ShiftType, UserShiftPlan, UserTimeClockConfig } from '../../types';

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
    throw new Error(msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function ok(value: unknown, msg?: string): void {
  if (!value) throw new Error(msg ?? 'Expected truthy value');
}

function makePlan(entries: Array<{ dateISO: string; code: ShiftType }>): UserShiftPlan {
  return {
    profileId: 'p-strategy',
    startDateISO: '2026-04-01',
    pattern: [],
    cycleLengthDays: 0,
    generatedUntilISO: '2026-04-30',
    entries,
  };
}

function makeTimeClockConfig(): UserTimeClockConfig {
  return {
    profileId: 'p-strategy',
    updatedAt: new Date().toISOString(),
    shiftSettings: {
      F: { startTime: '06:00', endTime: '14:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
      S: { startTime: '14:00', endTime: '22:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
      N: { startTime: '22:00', endTime: '06:00', paidFlexMinutes: 15, postShiftGraceMinutes: 30 },
      KS: { startTime: '16:00', endTime: '22:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
      KN: { startTime: '00:00', endTime: '06:00', paidFlexMinutes: 15, postShiftGraceMinutes: 30 },
      T: { startTime: '08:00', endTime: '16:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
    },
  };
}

describe('resolveOriginalShiftCodeForDate', () => {
  test('nimmt entries-Wert wenn vorhanden', () => {
    const plan = makePlan([{ dateISO: '2026-04-02', code: 'KS' }]);
    const result = resolveOriginalShiftCodeForDate(plan, '2026-04-02');
    eq(result, 'KS');
  });

  test('fällt auf Pattern zurück wenn kein Entry vorhanden', () => {
    const plan: UserShiftPlan = {
      profileId: 'p-pattern',
      startDateISO: '2026-01-01',
      pattern: ['F', 'S', 'N', 'R'],
      cycleLengthDays: 4,
      generatedUntilISO: '2026-01-10',
      entries: [],
    };
    const result = resolveOriginalShiftCodeForDate(plan, '2026-01-03');
    eq(result, 'N');
  });
});

describe('buildVacationStrategies', () => {
  test('liefert vacation + hours Strategien fuer KS/KN Brueckentage', () => {
    const plan = makePlan([
      { dateISO: '2026-04-02', code: 'KS' }, // vor Karfreitag
      { dateISO: '2026-04-07', code: 'KS' }, // nach Osterwochenende
    ]);
    const strategies = buildVacationStrategies({
      shiftPlan: plan,
      vacationDays: [],
      overrides: {},
      timeClockConfig: makeTimeClockConfig(),
      now: new Date(2026, 3, 1), // 2026-04-01
    });

    const vacation = strategies.filter((s) => s.strategyType === 'vacation');
    const hours = strategies.filter((s) => s.strategyType === 'hours');
    ok(vacation.length > 0, 'Erwartet mindestens eine vacation-Strategie');
    ok(hours.length > 0, 'Erwartet mindestens eine hours-Strategie');

    const hourStrategy = hours.find((s) => s.urlaubstage.includes('2026-04-02'));
    ok(hourStrategy, 'Erwartet hours-Strategie fuer 2026-04-02');
    ok((hourStrategy?.requiredHours ?? 0) > 0, 'Erwartet requiredHours > 0');
  });

  test('beruecksichtigt Overrides und schlaegt bereits freie Tage nicht vor', () => {
    const plan = makePlan([{ dateISO: '2026-04-02', code: 'KS' }]);
    const strategies = buildVacationStrategies({
      shiftPlan: plan,
      vacationDays: [],
      overrides: { '2026-04-02': 'X' },
      timeClockConfig: makeTimeClockConfig(),
      now: new Date(2026, 3, 1),
    });

    const touchesBlockedDay = strategies.some((s) => s.urlaubstage.includes('2026-04-02'));
    eq(touchesBlockedDay, false, 'Tag mit Override X darf nicht in Vorschlaegen auftauchen');
  });
});

process.stdout.write(`\n  Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen\n\n`);
if (failed > 0) {
  process.exit(1);
}


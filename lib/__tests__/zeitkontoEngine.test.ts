/**
 * Tests für lib/zeitkontoEngine.ts (Pure Logic – kein AsyncStorage nötig)
 *
 * Ausführen: cd yasa && npx sucrase-node lib/__tests__/zeitkontoEngine.test.ts
 *
 * Szenarien:
 *   Z1. computeZeitkonto – Ist section mirrors monthSummary values correctly
 *   Z2. computeZeitkonto – Foresight remainingPlannedHours from shift plan
 *   Z3. computeZeitkonto – Foresight projectedEndDelta equals currentDelta
 *   Z4. computeZeitkonto – Foresight projected holiday credits for future dates
 *   Z5. computeZeitkonto – Foresight projected preholiday credits for future dates
 *   Z6. computeZeitkonto – No plan/config → foresight remains zero
 *   Z7. computeZeitkonto – projectedEndBalance includes current + projected credits
 *   Z8. computeZeitkonto – Delta = worked - planned (invariant from P0)
 *   Z9. computeZeitkonto – Flex is separate (not in balanceToDate or projectedEndBalance)
 */

(global as Record<string, unknown>).__DEV__ = false;

import { computeZeitkonto } from '../zeitkontoEngine';
import type { MonthlyWorkProgress } from '../timeAccountEngine';
import type { UserShiftPlan, UserTimeClockConfig, RegularShiftCode } from '../../types';
import type { SpaceRuleProfile } from '../../types/timeAccount';

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
    process.stdout.write(`    \u2713 ${name}\n`);
    passed++;
  } catch (e) {
    process.stdout.write(`    \u2717 ${name}\n`);
    process.stdout.write(`      \u2192 ${e instanceof Error ? e.message : String(e)}\n`);
    failed++;
  }
}

function eq<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function near(actual: number, expected: number, tolerance: number, msg?: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(msg ?? `Expected ~${expected} (\u00b1${tolerance}), got ${actual}`);
  }
}

// ─── Test Fixtures ─────────────────────────────────────────────────────────

function makeMonthSummary(overrides?: Partial<MonthlyWorkProgress>): MonthlyWorkProgress {
  return {
    monthLabel: 'April 2026',
    fromISO: '2026-04-01',
    toISO: '2026-04-30',
    plannedHoursMonth: 160,
    plannedHoursToDate: 80,
    workedHoursToDate: 78,
    deltaHoursToDate: -2,
    creditedHolidayHoursToDate: 8,
    creditedPreHolidayHoursToDate: 2,
    creditedWDaysToDate: 0,
    creditedHoursToDate: 10,
    creditedFlexHoursToDate: 1.5,
    totalDeltaWithCreditsToDate: 8, // -2 + 10
    explanation: [],
    ...overrides,
  };
}

function makeConfig(): UserTimeClockConfig {
  return {
    profileId: 'p1',
    shiftSettings: {
      F: { startTime: '06:00', endTime: '14:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
      S: { startTime: '14:00', endTime: '22:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
      N: { startTime: '22:00', endTime: '06:00', paidFlexMinutes: 15, postShiftGraceMinutes: 30 },
      KS: { startTime: '16:00', endTime: '22:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
      KN: { startTime: '00:00', endTime: '06:00', paidFlexMinutes: 15, postShiftGraceMinutes: 30 },
      T: { startTime: '08:00', endTime: '16:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
    },
    updatedAt: '2026-04-01T00:00:00.000Z',
  };
}

function makePlan(entries: Array<{ dateISO: string; code: string }>): UserShiftPlan {
  return {
    profileId: 'p1',
    startDateISO: '2026-04-01',
    pattern: [],
    cycleLengthDays: 28,
    generatedUntilISO: '2026-05-01',
    entries: entries.map((e) => ({ dateISO: e.dateISO, code: e.code as RegularShiftCode })),
  };
}

function makeSpaceProfile(overrides?: Partial<SpaceRuleProfile>): SpaceRuleProfile {
  return {
    spaceId: 's1',
    bundesland: 'NW',
    branche: 'pflege',
    ruleProfileName: 'default',
    sourceLabel: 'Test',
    codeRules: {},
    holidayCredit: { enabled: true, hoursPerHolidayShift: 8 },
    preHolidayCredit: { enabled: true, hoursPerOccurrence: 2 },
    schoolHolidaysEnabledByDefault: false,
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('computeZeitkonto – Ist section', () => {
  test('Z1: Ist mirrors monthSummary values exactly', () => {
    const ms = makeMonthSummary();
    const result = computeZeitkonto({
      monthSummary: ms,
      plan: null,
      config: null,
      spaceProfile: null,
      today: new Date(2026, 3, 12), // April 12
    });

    near(result.ist.workedHoursToDate, 78, 0.01, 'workedHoursToDate');
    near(result.ist.deltaHoursToDate, -2, 0.01, 'deltaHoursToDate');
    near(result.ist.creditedHolidayHours, 8, 0.01, 'creditedHolidayHours');
    near(result.ist.creditedPreHolidayHours, 2, 0.01, 'creditedPreHolidayHours');
    near(result.ist.creditedFlexHours, 1.5, 0.01, 'creditedFlexHours');
    near(result.ist.creditedTariffHoursTotal, 10, 0.01, 'creditedTariffHoursTotal');
    near(result.ist.balanceToDate, 8, 0.01, 'balanceToDate = delta + credits');
  });
});

describe('computeZeitkonto – Foresight (Plan)', () => {
  test('Z2: remainingPlannedHours computed from future shift plan entries', () => {
    const ms = makeMonthSummary({ plannedHoursMonth: 160, plannedHoursToDate: 80 });
    const plan = makePlan([
      // Past: already counted in plannedHoursToDate by monthSummary
      { dateISO: '2026-04-10', code: 'F' },
      { dateISO: '2026-04-11', code: 'F' },
      { dateISO: '2026-04-12', code: 'F' }, // today → NOT future
      // Future:
      { dateISO: '2026-04-13', code: 'F' }, // 8h
      { dateISO: '2026-04-14', code: 'S' }, // 8h
      { dateISO: '2026-04-15', code: 'N' }, // 8h
    ]);
    const result = computeZeitkonto({
      monthSummary: ms,
      plan,
      config: makeConfig(),
      spaceProfile: null,
      today: new Date(2026, 3, 12),
    });

    eq(result.foresight.remainingShiftDays, 3, '3 future shift days');
    near(result.foresight.remainingPlannedHours, 24, 0.01, '3 * 8h = 24h');
  });

  test('Z3: projectedEndDelta equals currentDelta (assumes worked=planned for future)', () => {
    const ms = makeMonthSummary({ deltaHoursToDate: -3.5 });
    const result = computeZeitkonto({
      monthSummary: ms,
      plan: makePlan([{ dateISO: '2026-04-20', code: 'F' }]),
      config: makeConfig(),
      spaceProfile: null,
      today: new Date(2026, 3, 12),
    });

    near(result.foresight.projectedEndDelta, -3.5, 0.01, 'Projected end delta = current delta');
  });

  test('Z4: Projected holiday credits for future holiday dates', () => {
    // 2026-05-01 is May Day (Tag der Arbeit) — a holiday in Germany.
    // Use a month summary for May 2026.
    const ms = makeMonthSummary({
      monthLabel: 'Mai 2026',
      fromISO: '2026-05-01',
      toISO: '2026-05-31',
      totalDeltaWithCreditsToDate: 0,
    });
    const plan = makePlan([
      { dateISO: '2026-05-01', code: 'F' }, // holiday
      { dateISO: '2026-05-02', code: 'F' }, // normal
    ]);
    const sp = makeSpaceProfile();
    const result = computeZeitkonto({
      monthSummary: ms,
      plan,
      config: makeConfig(),
      spaceProfile: sp,
      today: new Date(2026, 3, 30), // April 30, so all May dates are future
    });

    // May 1st is a holiday → 8h projected credit
    near(result.foresight.projectedRemainingHolidayCredits, 8, 0.01, 'Holiday credit for May 1');
    eq(result.foresight.remainingShiftDays, 2, '2 future shift days');
  });

  test('Z5: Projected preholiday credits for day before holiday', () => {
    // 2026-05-01 is a holiday. 2026-04-30 is preholiday.
    const ms = makeMonthSummary({
      fromISO: '2026-04-01',
      toISO: '2026-04-30',
      totalDeltaWithCreditsToDate: 0,
    });
    const plan = makePlan([
      { dateISO: '2026-04-30', code: 'N' }, // preholiday (day before May 1)
    ]);
    const sp = makeSpaceProfile();
    const result = computeZeitkonto({
      monthSummary: ms,
      plan,
      config: makeConfig(),
      spaceProfile: sp,
      today: new Date(2026, 3, 12),
    });

    near(result.foresight.projectedRemainingPreHolidayCredits, 8, 0.01, 'PreHoliday credit for April 30 (before May 1)');
  });

  test('Z6: No plan/config → foresight remains zero', () => {
    const ms = makeMonthSummary({ deltaHoursToDate: 5, totalDeltaWithCreditsToDate: 15 });
    const result = computeZeitkonto({
      monthSummary: ms,
      plan: null,
      config: null,
      spaceProfile: null,
      today: new Date(2026, 3, 12),
    });

    eq(result.foresight.remainingPlannedHours, 0);
    eq(result.foresight.remainingShiftDays, 0);
    near(result.foresight.projectedEndDelta, 5, 0.01);
    near(result.foresight.projectedEndBalance, 15, 0.01, 'Balance = current total delta with no additional credits');
  });

  test('Z7: projectedEndBalance = currentBalance + projected credits', () => {
    const ms = makeMonthSummary({
      fromISO: '2026-05-01',
      toISO: '2026-05-31',
      totalDeltaWithCreditsToDate: 4,
    });
    const plan = makePlan([
      { dateISO: '2026-05-01', code: 'F' }, // holiday → +8h projected
    ]);
    const sp = makeSpaceProfile();
    const result = computeZeitkonto({
      monthSummary: ms,
      plan,
      config: makeConfig(),
      spaceProfile: sp,
      today: new Date(2026, 3, 30),
    });

    // projectedEndBalance = 4 (current) + 8 (projected holiday) + 0 (projected preholiday)
    near(result.foresight.projectedEndBalance, 12, 0.01, 'Balance 4 + 8 projected holiday = 12');
  });
});

describe('computeZeitkonto – Invariants (P0 carryover)', () => {
  test('Z8: Ist delta = worked - planned (strict, no flex mixed in)', () => {
    // workedHoursToDate=78, plannedHoursToDate=80 → delta=-2
    // creditedFlexHoursToDate=1.5 should NOT affect delta
    const ms = makeMonthSummary({
      workedHoursToDate: 78,
      plannedHoursToDate: 80,
      deltaHoursToDate: -2, // 78-80
      creditedFlexHoursToDate: 1.5,
      totalDeltaWithCreditsToDate: 8, // -2 + 10 credits
    });
    const result = computeZeitkonto({
      monthSummary: ms,
      plan: null,
      config: null,
      spaceProfile: null,
    });

    near(result.ist.deltaHoursToDate, -2, 0.01, 'Delta is strict worked-planned');
    // flex is separate and does NOT change delta or balance formula
    near(result.ist.creditedFlexHours, 1.5, 0.01);
    // balanceToDate = delta + tariff credits (NOT + flex)
    near(result.ist.balanceToDate, 8, 0.01, 'Balance does not include flex');
  });

  test('Z9: Flex stays separate — not in balanceToDate or projectedEndBalance', () => {
    const ms = makeMonthSummary({
      deltaHoursToDate: 0,
      creditedHoursToDate: 0,
      creditedFlexHoursToDate: 3.0,
      totalDeltaWithCreditsToDate: 0, // 0 + 0 (flex is NOT here)
    });
    const result = computeZeitkonto({
      monthSummary: ms,
      plan: null,
      config: null,
      spaceProfile: null,
    });

    near(result.ist.balanceToDate, 0, 0.01, 'Flex is NOT in balance');
    near(result.foresight.projectedEndBalance, 0, 0.01, 'Flex is NOT in projected balance');
    near(result.ist.creditedFlexHours, 3.0, 0.01, 'Flex tracked separately');
  });
});

describe('computeZeitkonto – QA date overrides', () => {
  test('Z10: QA override holiday on future date → projected credit', () => {
    const ms = makeMonthSummary({
      fromISO: '2026-04-01',
      toISO: '2026-04-30',
      totalDeltaWithCreditsToDate: 0,
    });
    const plan = makePlan([{ dateISO: '2026-04-20', code: 'F' }]);
    const sp = makeSpaceProfile();
    const result = computeZeitkonto({
      monthSummary: ms,
      plan,
      config: makeConfig(),
      spaceProfile: sp,
      qaDateOverrides: { '2026-04-20': 'holiday' },
      today: new Date(2026, 3, 12),
    });

    near(result.foresight.projectedRemainingHolidayCredits, 8, 0.01, 'QA override → holiday credit');
  });
});

// ─── Ergebnis ───────────────────────────────────────────────────────────────

process.stdout.write(
  `\n  Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen\n\n`
);
if (failed > 0) process.exit(1);

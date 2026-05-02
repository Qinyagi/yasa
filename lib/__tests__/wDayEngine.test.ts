/**
 * Tests für lib/wDayEngine.ts
 */

(global as Record<string, unknown>).__DEV__ = false;

import { computeWDaysForRange } from '../wDayEngine';
import type { ShiftType, UserShiftPlan } from '../../types';

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

function makePlan(entries: Array<{ dateISO: string; code: ShiftType }>): UserShiftPlan {
  return {
    profileId: 'p1',
    startDateISO: '2026-01-01',
    pattern: [],
    cycleLengthDays: 28,
    generatedUntilISO: '2026-12-31',
    entries,
  };
}

describe('computeWDaysForRange', () => {
  test('W1: weekday holiday + R => +1 W-Tag', () => {
    const plan = makePlan([{ dateISO: '2026-05-01', code: 'R' }]);
    const result = computeWDaysForRange({
      plan,
      fromISO: '2026-05-01',
      toISO: '2026-05-31',
      wEnabled: true,
    });
    eq(result.totalWDays, 1);
    eq(result.dateISOs[0], '2026-05-01');
  });

  test('W2: weekday holiday + non-R => 0 W-Tage', () => {
    const plan = makePlan([{ dateISO: '2026-05-01', code: 'F' }]);
    const result = computeWDaysForRange({
      plan,
      fromISO: '2026-05-01',
      toISO: '2026-05-31',
      wEnabled: true,
    });
    eq(result.totalWDays, 0);
  });

  test('W3: weekend holiday + R => 0 W-Tage', () => {
    const plan = makePlan([{ dateISO: '2026-10-03', code: 'R' }]);
    const result = computeWDaysForRange({
      plan,
      fromISO: '2026-10-01',
      toISO: '2026-10-31',
      wEnabled: true,
    });
    eq(result.totalWDays, 0);
  });

  test('W4: QA override holiday on weekday + R => +1 W-Tag', () => {
    const plan = makePlan([{ dateISO: '2026-04-20', code: 'R' }]);
    const result = computeWDaysForRange({
      plan,
      fromISO: '2026-04-01',
      toISO: '2026-04-30',
      qaDateOverrides: { '2026-04-20': 'holiday' },
      wEnabled: true,
    });
    eq(result.totalWDays, 1);
    eq(result.dateISOs[0], '2026-04-20');
  });

  test('W5: QA override preholiday suppresses holiday => 0 W-Tage', () => {
    const plan = makePlan([{ dateISO: '2026-05-01', code: 'R' }]);
    const result = computeWDaysForRange({
      plan,
      fromISO: '2026-05-01',
      toISO: '2026-05-31',
      qaDateOverrides: { '2026-05-01': 'preholiday' },
      wEnabled: true,
    });
    eq(result.totalWDays, 0);
  });

  test('W6: disabled rule => 0 W-Tage', () => {
    const plan = makePlan([{ dateISO: '2026-05-01', code: 'R' }]);
    const result = computeWDaysForRange({
      plan,
      fromISO: '2026-05-01',
      toISO: '2026-05-31',
      wEnabled: false,
    });
    eq(result.totalWDays, 0);
  });
});

process.stdout.write(`\n  Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen\n\n`);
if (failed > 0) process.exit(1);

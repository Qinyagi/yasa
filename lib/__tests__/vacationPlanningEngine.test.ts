import {
  buildVacationPlanningConflicts,
  expandVacationPlanningDateRange,
  normalizeVacationPlanningWishDates,
} from '../vacationPlanningEngine';
import type { EmployerVacationGroup, VacationPlanningWish } from '../../types/vacationPlanning';

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

function includes<T>(actual: T[], expected: T, msg?: string): void {
  if (!actual.includes(expected)) {
    throw new Error(msg ?? `Expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}

function makeWish(
  id: string,
  profileId: string,
  startDateISO: string,
  endDateISO: string,
  status: VacationPlanningWish['status'] = 'submitted'
): VacationPlanningWish {
  return {
    id,
    spaceId: 'space-1',
    profileId,
    year: 2027,
    startDateISO,
    endDateISO,
    dateISOs: [],
    status,
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
  };
}

function makeGroup(id: string, memberProfileIds: string[], capacity = 1): EmployerVacationGroup {
  return {
    id,
    spaceId: 'space-1',
    year: 2027,
    name: `Urlaubsgruppe ${id}`,
    memberProfileIds,
    defaultCapacityPerDay: capacity,
    source: 'manual',
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
  };
}

describe('expandVacationPlanningDateRange', () => {
  test('expands inclusive ISO date ranges', () => {
    const result = expandVacationPlanningDateRange('2027-07-10', '2027-07-12');
    eq(result.length, 3);
    eq(result[0], '2027-07-10');
    eq(result[2], '2027-07-12');
  });
});

describe('normalizeVacationPlanningWishDates', () => {
  test('builds dateISOs from start and end date when empty', () => {
    const result = normalizeVacationPlanningWishDates(makeWish('w1', 'p1', '2027-08-01', '2027-08-03'));
    eq(result.dateISOs.length, 3);
    includes(result.dateISOs, '2027-08-02');
  });
});

describe('buildVacationPlanningConflicts', () => {
  test('detects overlap inside the same employer vacation group', () => {
    const conflicts = buildVacationPlanningConflicts({
      wishes: [
        makeWish('w1', 'p1', '2027-07-10', '2027-07-12'),
        makeWish('w2', 'p2', '2027-07-11', '2027-07-13'),
      ],
      groups: [makeGroup('g1', ['p1', 'p2'], 1)],
      spaceId: 'space-1',
      year: 2027,
    });

    eq(conflicts.length, 2);
    eq(conflicts[0].dateISO, '2027-07-11');
    eq(conflicts[0].capacity, 1);
    eq(conflicts[0].wishedCount, 2);
    includes(conflicts[0].profileIds, 'p1');
    includes(conflicts[0].profileIds, 'p2');
  });

  test('does not conflict wishes from different employer vacation groups', () => {
    const conflicts = buildVacationPlanningConflicts({
      wishes: [
        makeWish('w1', 'p1', '2027-07-10', '2027-07-12'),
        makeWish('w2', 'p2', '2027-07-10', '2027-07-12'),
      ],
      groups: [makeGroup('g1', ['p1'], 1), makeGroup('g2', ['p2'], 1)],
      spaceId: 'space-1',
      year: 2027,
    });

    eq(conflicts.length, 0);
  });

  test('ignores draft wishes', () => {
    const conflicts = buildVacationPlanningConflicts({
      wishes: [
        makeWish('w1', 'p1', '2027-07-10', '2027-07-12'),
        makeWish('w2', 'p2', '2027-07-10', '2027-07-12', 'draft'),
      ],
      groups: [makeGroup('g1', ['p1', 'p2'], 1)],
      spaceId: 'space-1',
      year: 2027,
    });

    eq(conflicts.length, 0);
  });

  test('uses date-specific capacity when configured', () => {
    const group = makeGroup('g1', ['p1', 'p2'], 1);
    group.capacityByDateISO = { '2027-07-11': 2 };
    const conflicts = buildVacationPlanningConflicts({
      wishes: [
        makeWish('w1', 'p1', '2027-07-10', '2027-07-12'),
        makeWish('w2', 'p2', '2027-07-11', '2027-07-13'),
      ],
      groups: [group],
      spaceId: 'space-1',
      year: 2027,
    });

    eq(conflicts.length, 1);
    eq(conflicts[0].dateISO, '2027-07-12');
  });
});

process.stdout.write(`\n  Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen\n\n`);
if (failed > 0) {
  process.exit(1);
}

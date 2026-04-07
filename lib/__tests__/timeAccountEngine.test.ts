import type { TimeClockEvent, UserShiftPlan, UserTimeClockConfig } from '../../types';
import type { SpaceRuleProfile } from '../../types/timeAccount';
import { computeMonthlyWorkProgress } from '../timeAccountEngine';

function assertNear(name: string, actual: number, expected: number, eps = 1e-6): void {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
}

function logPass(name: string): void {
  // eslint-disable-next-line no-console
  console.log(`PASS ${name}`);
}

const config: UserTimeClockConfig = {
  profileId: 'u1',
  updatedAt: '2026-03-24T00:00:00.000Z',
  shiftSettings: {
    F: { startTime: '06:00', endTime: '14:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
    S: { startTime: '14:00', endTime: '22:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
    N: { startTime: '22:00', endTime: '06:00', paidFlexMinutes: 15, postShiftGraceMinutes: 30 },
    KS: { startTime: '16:00', endTime: '22:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
    KN: { startTime: '00:00', endTime: '06:00', paidFlexMinutes: 15, postShiftGraceMinutes: 30 },
    T: { startTime: '08:00', endTime: '16:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
  },
};

const plan: UserShiftPlan = {
  profileId: 'u1',
  startDateISO: '2026-03-01',
  cycleLengthDays: 1,
  pattern: ['N'],
  generatedUntilISO: '2026-03-31',
  entries: [{ dateISO: '2026-03-24', code: 'N' }],
};

const spaceProfile: SpaceRuleProfile = {
  spaceId: 's1',
  bundesland: 'NW',
  branche: 'Gesundheit / Pflege',
  ruleProfileName: 'QA',
  sourceLabel: 'QA',
  codeRules: {},
  holidayCredit: { enabled: true, hoursPerHolidayShift: 7.7 },
  preHolidayCredit: { enabled: true, hoursPerOccurrence: 3.85 },
  schoolHolidaysEnabledByDefault: false,
  updatedAt: '2026-03-24T00:00:00.000Z',
};

function runCase(name: string, checkInISO: string, checkOutISO: string) {
  const events: TimeClockEvent[] = [
    {
      id: 'e1',
      profileId: 'u1',
      dateISO: '2026-03-24',
      weekdayLabel: 'Dienstag',
      shiftCode: 'N',
      eventType: 'check_in',
      timestampISO: checkInISO,
      source: 'manual_edit',
      createdAt: checkInISO,
    },
    {
      id: 'e2',
      profileId: 'u1',
      dateISO: '2026-03-24',
      weekdayLabel: 'Dienstag',
      shiftCode: 'N',
      eventType: 'check_out',
      timestampISO: checkOutISO,
      source: 'manual_edit',
      createdAt: checkOutISO,
    },
  ];

  const result = computeMonthlyWorkProgress({
    plan,
    config,
    events,
    spaceProfile,
    qaDateOverrides: {
      '2026-03-24': 'preholiday',
      '2026-03-25': 'holiday',
    },
    today: new Date('2026-03-25T12:00:00.000Z'),
  });

  // eslint-disable-next-line no-console
  console.log(name, {
    worked: result.workedHoursToDate,
    preholiday: result.creditedPreHolidayHoursToDate,
    holiday: result.creditedHolidayHoursToDate,
    flex: result.creditedFlexHoursToDate,
    totalWithCredits: result.totalDeltaWithCreditsToDate,
  });
  return result;
}

const caseA = runCase('A 21:45->06:00', '2026-03-24T20:45:00.000Z', '2026-03-25T05:00:00.000Z');
assertNear('A worked', caseA.workedHoursToDate, 8.25);
assertNear('A preholiday', caseA.creditedPreHolidayHoursToDate, 2.25);
assertNear('A holiday', caseA.creditedHolidayHoursToDate, 6.0);
assertNear('A flex', caseA.creditedFlexHoursToDate, 0.25);
logPass('Case A');

const caseB = runCase('B 21:55->06:10', '2026-03-24T20:55:00.000Z', '2026-03-25T05:10:00.000Z');
assertNear('B flex', caseB.creditedFlexHoursToDate, 0.25);
logPass('Case B');

const octoberPlan: UserShiftPlan = {
  profileId: 'u1',
  startDateISO: '2026-10-01',
  cycleLengthDays: 1,
  pattern: ['N'],
  generatedUntilISO: '2026-10-31',
  entries: [{ dateISO: '2026-10-02', code: 'N' }],
};

const caseC = computeMonthlyWorkProgress({
  plan: octoberPlan,
  config,
  events: [
    {
      id: 'c1',
      profileId: 'u1',
      dateISO: '2026-10-02',
      weekdayLabel: 'Freitag',
      shiftCode: 'N',
      eventType: 'check_in',
      timestampISO: '2026-10-02T19:45:00.000Z',
      source: 'manual_edit',
      createdAt: '2026-10-02T19:45:00.000Z',
    },
    {
      id: 'c2',
      profileId: 'u1',
      dateISO: '2026-10-02',
      weekdayLabel: 'Freitag',
      shiftCode: 'N',
      eventType: 'check_out',
      timestampISO: '2026-10-03T04:00:00.000Z',
      source: 'manual_edit',
      createdAt: '2026-10-03T04:00:00.000Z',
    },
  ],
  spaceProfile,
  today: new Date('2026-10-03T12:00:00.000Z'),
});
assertNear('C preholiday (day before holiday, no override)', caseC.creditedPreHolidayHoursToDate, 2.25);
assertNear('C holiday (holiday minutes after midnight, no override)', caseC.creditedHolidayHoursToDate, 6.0);
logPass('Case C');

// eslint-disable-next-line no-console
console.log('OK timeAccountEngine interval + flex rules');

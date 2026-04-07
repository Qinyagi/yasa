/**
 * Tests für deriveTimeClockStampState + getShiftForDate (Override-Pfad)
 *
 * Ausführen: cd yasa && npx sucrase-node lib/__tests__/timeclock.test.ts
 *
 * Abgedeckte Szenarien:
 *   G1. deriveTimeClockStampState – Leeres Array → awaiting_check_in
 *   G2. deriveTimeClockStampState – 1 check_in ohne check_out → awaiting_check_out
 *   G3. deriveTimeClockStampState – vollständiges Paar → completed
 *   G4. deriveTimeClockStampState – Anomalie: 2× check_in ohne check_out → anomaly
 *   G5. deriveTimeClockStampState – Anomalie: check_out ohne check_in → anomaly
 *   G6. deriveTimeClockStampState – mehrere Paare + offener check_in → anomaly
 *   G7. getShiftForDate – Override vorhanden → Override-Code zurück
 *   G8. getShiftForDate – kein Override, Plan vorhanden → Plan-Code zurück
 *   G9. getShiftForDate – Override 'X' (Frei) → 'X' zurück
 *   G10. getShiftForDate – kein Plan, kein Override → null
 */

// ─── Node-Globals für React Native ──────────────────────────────────────────
// storage.ts importiert log.ts, das __DEV__ als Global erwartet.
// In der Node-Test-Umgebung setzen wir es auf false (kein Logging).
(global as Record<string, unknown>).__DEV__ = false;

// ─── AsyncStorage-Mock für Node-Umgebung ────────────────────────────────────
// Muss VOR dem Import von storage.ts in den require-Cache eingetragen werden,
// damit storage.ts den Mock statt des echten Moduls erhält.

const path = require('path') as typeof import('path');

// Absoluter Pfad zum AsyncStorage CommonJS-Einstiegspunkt
const asyncStorageModulePath: string = path.resolve(
  __dirname,
  '../../node_modules/@react-native-async-storage/async-storage/lib/commonjs/index.js'
);

// In-Memory-Store für den Mock
const mockStore: Record<string, string> = {};

// __esModule: true damit sucrase's _interopRequireDefault die exports.default korrekt weitergibt
const asyncStorageMock = {
  __esModule: true,
  default: {
    getItem: async (key: string): Promise<string | null> => mockStore[key] ?? null,
    setItem: async (key: string, value: string): Promise<void> => {
      mockStore[key] = value;
    },
    removeItem: async (key: string): Promise<void> => {
      delete mockStore[key];
    },
  },
};

// AsyncStorage-Mock in den require-Cache eintragen
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
(require as any).cache[asyncStorageModulePath] = {
  id: asyncStorageModulePath,
  filename: asyncStorageModulePath,
  loaded: true,
  exports: asyncStorageMock,
  paths: [],
  children: [],
  parent: null,
  path: path.dirname(asyncStorageModulePath),
};

// Jetzt erst storage.ts importieren (verwendet den Mock aus dem Cache)
import {
  applyVacationStrategy,
  deriveTimeClockStampState,
  getDayChanges,
  getShiftForDate,
  getOpenShortShiftVacationReminders,
  getStrategyHoursBalance,
  getTimeClockEvents,
  STORAGE_KEYS,
} from '../storage';
// autoStamp.ts importiert intern aus storage.ts und nutzt ebenfalls den Mock.
import {
  autoStampMissedShifts,
  AUTOSTAMP_EXTRA_GRACE_HOURS,
} from '../autoStamp';
import type { VacationStrategy } from '../strategyTypes';
import type { TimeClockEvent, ShiftType } from '../../types';

// ─── Minimales Test-Framework (identischer Stil wie shiftEngine.test.ts) ──────

let passed = 0;
let failed = 0;

function describe(suiteName: string, fn: () => void): void {
  process.stdout.write(`\n  ${suiteName}\n`);
  fn();
}

// Async-Tests werden sequenziell (nicht parallel) ausgeführt,
// damit keine Race-Conditions beim Mock-Store auftreten.
// asyncChain ist das aktuelle Ende der sequenziellen Promise-Kette.
let asyncChain: Promise<void> = Promise.resolve();

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

function asyncTest(name: string, fn: () => Promise<void>): void {
  asyncChain = asyncChain.then(() =>
    fn().then(
      () => {
        process.stdout.write(`    ✓ ${name}\n`);
        passed++;
      },
      (e: unknown) => {
        process.stdout.write(`    ✗ ${name}\n`);
        process.stdout.write(`      → ${e instanceof Error ? e.message : String(e)}\n`);
        failed++;
      }
    )
  );
}

function eq<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(
      msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function isNull(actual: unknown, msg?: string): void {
  if (actual !== null) {
    throw new Error(msg ?? `Expected null, got ${JSON.stringify(actual)}`);
  }
}

// ─── Hilfsfunktion: minimales TimeClockEvent erstellen ─────────────────────

function makeEvent(
  id: string,
  eventType: TimeClockEvent['eventType'],
  timestampISO: string
): TimeClockEvent {
  return {
    id,
    profileId: 'test-profile',
    dateISO: '2026-03-25',
    weekdayLabel: 'Mittwoch',
    shiftCode: 'F',
    eventType,
    timestampISO,
    source: 'manual_service',
    createdAt: timestampISO,
  };
}

// ─── Gruppe 1: deriveTimeClockStampState ─────────────────────────────────────

describe('deriveTimeClockStampState', () => {
  test('G1: Leeres Array → awaiting_check_in', () => {
    const state = deriveTimeClockStampState([]);
    eq(state.phase, 'awaiting_check_in');
    eq(state.allowedEventType, 'check_in');
    eq(state.openCheckInTimestampISO, null);
    eq(state.checkInCount, 0);
    eq(state.checkOutCount, 0);
  });

  test('G2: 1 check_in ohne check_out → awaiting_check_out', () => {
    const events: TimeClockEvent[] = [
      makeEvent('e1', 'check_in', '2026-03-25T06:00:00.000Z'),
    ];
    const state = deriveTimeClockStampState(events);
    eq(state.phase, 'awaiting_check_out');
    eq(state.allowedEventType, 'check_out');
    eq(state.checkInCount, 1);
    eq(state.checkOutCount, 0);
  });

  test('G3: 1 check_in + 1 check_out (vollständiges Paar) → completed', () => {
    const events: TimeClockEvent[] = [
      makeEvent('e1', 'check_in', '2026-03-25T06:00:00.000Z'),
      makeEvent('e2', 'check_out', '2026-03-25T14:00:00.000Z'),
    ];
    const state = deriveTimeClockStampState(events);
    eq(state.phase, 'completed');
    eq(state.allowedEventType, null);
    eq(state.openCheckInTimestampISO, null);
    eq(state.checkInCount, 1);
    eq(state.checkOutCount, 1);
  });

  test('G4: Anomalie – 2× check_in ohne check_out → anomaly', () => {
    const events: TimeClockEvent[] = [
      makeEvent('e1', 'check_in', '2026-03-25T06:00:00.000Z'),
      makeEvent('e2', 'check_in', '2026-03-25T07:00:00.000Z'),
    ];
    const state = deriveTimeClockStampState(events);
    eq(state.phase, 'anomaly');
    eq(state.allowedEventType, null);
  });

  test('G5: Anomalie – check_out ohne vorherigen check_in → anomaly', () => {
    const events: TimeClockEvent[] = [
      makeEvent('e1', 'check_out', '2026-03-25T14:00:00.000Z'),
    ];
    const state = deriveTimeClockStampState(events);
    eq(state.phase, 'anomaly');
    eq(state.allowedEventType, null);
  });

  test('G6: Mehrere vollständige Paare + offener check_in → anomaly (completedPairs > 1)', () => {
    // 2 vollständige Paare: completedPairs = 2 > 1 → anomaly
    const events: TimeClockEvent[] = [
      makeEvent('e1', 'check_in',  '2026-03-25T06:00:00.000Z'),
      makeEvent('e2', 'check_out', '2026-03-25T14:00:00.000Z'),
      makeEvent('e3', 'check_in',  '2026-03-25T14:30:00.000Z'),
      makeEvent('e4', 'check_out', '2026-03-25T22:00:00.000Z'),
      makeEvent('e5', 'check_in',  '2026-03-25T22:10:00.000Z'),
    ];
    const state = deriveTimeClockStampState(events);
    eq(state.phase, 'anomaly');
    eq(state.allowedEventType, null);
  });
});

// ─── Gruppe 2: getShiftForDate – Override-Pfad ───────────────────────────────

describe('getShiftForDate – Override-Pfad', () => {
  // Hilfsfunktion: Override-Map in den Mock-Store schreiben
  function setupOverrides(
    profileId: string,
    overrides: Record<string, ShiftType | null>
  ): void {
    const map: Record<string, Record<string, ShiftType | null>> = {};
    map[profileId] = overrides;
    mockStore[STORAGE_KEYS.SHIFT_OVERRIDES] = JSON.stringify(map);
  }

  // Hilfsfunktion: Schichtplan in den Mock-Store schreiben
  function setupShiftPlan(
    profileId: string,
    entries: Array<{ dateISO: string; code: ShiftType }>
  ): void {
    const plan = {
      profileId,
      startDate: '2026-01-01',
      pattern: ['F'] as ShiftType[],
      entries,
      updatedAt: new Date().toISOString(),
    };
    const map: Record<string, object> = {};
    map[profileId] = plan;
    mockStore[STORAGE_KEYS.SHIFTS] = JSON.stringify(map);
  }

  // Mock-Store vollständig bereinigen (Test-Isolation)
  function clearMockStore(): void {
    Object.keys(mockStore).forEach((k) => {
      delete mockStore[k];
    });
  }

  asyncTest('G7: Override vorhanden für Datum → Override-Code zurück', async () => {
    clearMockStore();
    setupOverrides('p1', { '2026-03-25': 'N' });
    setupShiftPlan('p1', [{ dateISO: '2026-03-25', code: 'F' }]);
    const result = await getShiftForDate('p1', '2026-03-25');
    eq(result, 'N', `Erwartet 'N' (Override), bekam ${String(result)}`);
  });

  asyncTest('G8: Kein Override, Plan vorhanden → Plan-Code zurück', async () => {
    clearMockStore();
    // Leere Override-Map für dieses Profil (kein Eintrag für das Datum)
    setupOverrides('p2', {});
    setupShiftPlan('p2', [{ dateISO: '2026-03-25', code: 'S' }]);
    const result = await getShiftForDate('p2', '2026-03-25');
    eq(result, 'S', `Erwartet 'S' (Plan), bekam ${String(result)}`);
  });

  asyncTest("G9: Override 'X' (Frei) → 'X' zurück", async () => {
    clearMockStore();
    setupOverrides('p3', { '2026-03-25': 'X' });
    setupShiftPlan('p3', [{ dateISO: '2026-03-25', code: 'F' }]);
    const result = await getShiftForDate('p3', '2026-03-25');
    eq(result, 'X', `Erwartet 'X' (Override Frei), bekam ${String(result)}`);
  });

  asyncTest('G10: Kein Plan, kein Override → null', async () => {
    clearMockStore();
    // Leerer Store – weder Override noch Plan vorhanden
    const result = await getShiftForDate('p4', '2026-03-25');
    isNull(result);
  });
});

// ─── Gruppe 3: Reminder-Retention ────────────────────────────────────────────

describe('getOpenShortShiftVacationReminders – Retention', () => {
  function clearMockStore(): void {
    Object.keys(mockStore).forEach((k) => {
      delete mockStore[k];
    });
  }

  asyncTest('G11: alte bestätigte Reminder werden kompakt entfernt', async () => {
    clearMockStore();
    const profileId = 'p-retention';
    const raw = {
      [profileId]: [
        {
          id: 'old-confirmed',
          profileId,
          dateISO: '2024-01-10',
          shiftCode: 'KS',
          createdAt: '2024-01-01T00:00:00.000Z',
          confirmedAt: '2024-01-11T00:00:00.000Z',
          deferredUntilISO: null,
        },
        {
          id: 'open-future',
          profileId,
          dateISO: '2026-12-24',
          shiftCode: 'KN',
          createdAt: '2026-01-01T00:00:00.000Z',
          confirmedAt: null,
          deferredUntilISO: null,
        },
      ],
    };
    mockStore[STORAGE_KEYS.VACATION_SHORTSHIFT_REMINDERS] = JSON.stringify(raw);

    const open = await getOpenShortShiftVacationReminders(profileId);
    eq(open.length, 1);
    eq(open[0].id, 'open-future');

    const persisted = JSON.parse(mockStore[STORAGE_KEYS.VACATION_SHORTSHIFT_REMINDERS]) as Record<string, Array<{ id: string }>>;
    eq(persisted[profileId].length, 1, 'Erwartet kompakt gespeicherten Reminder-Bestand');
    eq(persisted[profileId][0].id, 'open-future');
  });
});

// ─── Gruppe 4: Day-Changes-Compaction ───────────────────────────────────────

describe('getDayChanges – Compaction', () => {
  function clearMockStore(): void {
    Object.keys(mockStore).forEach((k) => {
      delete mockStore[k];
    });
  }

  asyncTest('G12: redundante Day-Changes (current==original) werden entfernt', async () => {
    clearMockStore();
    const profileId = 'p-daychanges';
    const raw = {
      [profileId]: {
        '2026-04-01': {
          originalCode: 'F',
          currentCode: 'F',
          reason: 'override',
          updatedAt: '2026-04-01T08:00:00.000Z',
        },
        '2026-04-02': {
          originalCode: 'KS',
          currentCode: 'U',
          reason: 'vacation',
          updatedAt: '2026-04-01T09:00:00.000Z',
        },
      },
    };
    mockStore[STORAGE_KEYS.DAY_CHANGES] = JSON.stringify(raw);

    const changes = await getDayChanges(profileId);
    eq(Object.keys(changes).length, 1);
    eq(changes['2026-04-02']?.currentCode, 'U');

    const persisted = JSON.parse(mockStore[STORAGE_KEYS.DAY_CHANGES]) as Record<string, Record<string, { currentCode: string }>>;
    eq(Object.keys(persisted[profileId]).length, 1, 'Erwartet kompakt gespeicherte Day-Changes');
    eq(persisted[profileId]['2026-04-02']?.currentCode, 'U');
  });
});

// ─── Gruppe 5: Timeclock-Events-Compaction ─────────────────────────────────

describe('getTimeClockEvents – Compaction', () => {
  function clearMockStore(): void {
    Object.keys(mockStore).forEach((k) => {
      delete mockStore[k];
    });
  }

  asyncTest('G13: exakte Event-Duplikate werden entfernt', async () => {
    clearMockStore();
    const profileId = 'p-events';
    const duplicateEvent = {
      id: 'e1',
      profileId,
      dateISO: '2026-04-10',
      weekdayLabel: 'Freitag',
      shiftCode: 'F',
      eventType: 'check_in',
      timestampISO: '2026-04-10T06:00:00.000Z',
      source: 'manual_service',
      createdAt: '2026-04-10T06:00:00.000Z',
    };
    const raw = {
      [profileId]: [
        duplicateEvent,
        { ...duplicateEvent, id: 'e2', createdAt: '2026-04-10T06:01:00.000Z' },
        {
          id: 'e3',
          profileId,
          dateISO: '2026-04-10',
          weekdayLabel: 'Freitag',
          shiftCode: 'F',
          eventType: 'check_out',
          timestampISO: '2026-04-10T14:00:00.000Z',
          source: 'manual_service',
          createdAt: '2026-04-10T14:00:00.000Z',
        },
      ],
    };
    mockStore[STORAGE_KEYS.TIMECLOCK_EVENTS] = JSON.stringify(raw);

    const events = await getTimeClockEvents(profileId);
    eq(events.length, 2);

    const persisted = JSON.parse(mockStore[STORAGE_KEYS.TIMECLOCK_EVENTS]) as Record<string, Array<{ id: string }>>;
    eq(persisted[profileId].length, 2, 'Erwartet kompakt gespeicherte Event-Liste');
  });
});

// ─── Gruppe 6: Stundenbank-Apply ────────────────────────────────────────────

describe('applyVacationStrategy (hours) – Stundenbank', () => {
  function clearMockStore(): void {
    Object.keys(mockStore).forEach((k) => {
      delete mockStore[k];
    });
  }

  asyncTest('G14: hours-Apply bucht Stunden ab und setzt X-Overrides', async () => {
    clearMockStore();
    const profileId = 'p-hours-ok';
    mockStore[STORAGE_KEYS.STRATEGY_HOURS_BANK] = JSON.stringify({
      [profileId]: { availableHours: 8, updatedAt: '2026-04-01T00:00:00.000Z' },
    });
    mockStore[STORAGE_KEYS.SHIFTS] = JSON.stringify({
      [profileId]: {
        profileId,
        startDateISO: '2026-04-01',
        pattern: [],
        cycleLengthDays: 0,
        generatedUntilISO: '2026-04-30',
        entries: [{ dateISO: '2026-04-02', code: 'KS' }],
      },
    });

    const strategy: VacationStrategy = {
      urlaubstage: ['2026-04-02'],
      freieTage: 4,
      feiertag: { date: '2026-04-03', name: 'Karfreitag' },
      strategyType: 'hours',
      requiredHours: 6,
      requiresShortShiftRequest: true,
    };

    await applyVacationStrategy(profileId, strategy);
    const balance = await getStrategyHoursBalance(profileId);
    eq(balance, 2);
    const effectiveCode = await getShiftForDate(profileId, '2026-04-02');
    eq(effectiveCode, 'X');
  });

  asyncTest('G15: hours-Apply scheitert bei unzureichendem Stundenstand', async () => {
    clearMockStore();
    const profileId = 'p-hours-fail';
    mockStore[STORAGE_KEYS.STRATEGY_HOURS_BANK] = JSON.stringify({
      [profileId]: { availableHours: 2, updatedAt: '2026-04-01T00:00:00.000Z' },
    });
    mockStore[STORAGE_KEYS.SHIFTS] = JSON.stringify({
      [profileId]: {
        profileId,
        startDateISO: '2026-04-01',
        pattern: [],
        cycleLengthDays: 0,
        generatedUntilISO: '2026-04-30',
        entries: [{ dateISO: '2026-04-02', code: 'KS' }],
      },
    });

    const strategy: VacationStrategy = {
      urlaubstage: ['2026-04-02'],
      freieTage: 4,
      feiertag: { date: '2026-04-03', name: 'Karfreitag' },
      strategyType: 'hours',
      requiredHours: 6,
      requiresShortShiftRequest: true,
    };

    let thrown = false;
    try {
      await applyVacationStrategy(profileId, strategy);
    } catch {
      thrown = true;
    }
    eq(thrown, true, 'Erwartet Fehler bei unzureichendem Stundenstand');
    const balance = await getStrategyHoursBalance(profileId);
    eq(balance, 2);
    const effectiveCode = await getShiftForDate(profileId, '2026-04-02');
    eq(effectiveCode, 'KS');
  });
});

// ─── Gruppe 7: autoStampMissedShifts ────────────────────────────────────────

describe('autoStampMissedShifts', () => {
  // Konstanten-Smoke-Test (synchron, kein AsyncStorage nötig)
  test('AUTOSTAMP_EXTRA_GRACE_HOURS ist 2', () => {
    eq(AUTOSTAMP_EXTRA_GRACE_HOURS, 2);
  });

  // ── Hilfsfunktionen ────────────────────────────────────────────────────────

  function clearMockStore(): void {
    Object.keys(mockStore).forEach((k) => { delete mockStore[k]; });
  }

  /** Schreibt einen ShiftCode-Override für ein Datum direkt in den Mock-Store. */
  function setupShiftOverride(profileId: string, dateISO: string, code: ShiftType): void {
    const raw = mockStore[STORAGE_KEYS.SHIFT_OVERRIDES];
    const map: Record<string, Record<string, ShiftType | null>> = raw ? JSON.parse(raw) : {};
    if (!map[profileId]) map[profileId] = {};
    map[profileId][dateISO] = code;
    mockStore[STORAGE_KEYS.SHIFT_OVERRIDES] = JSON.stringify(map);
  }

  /** Schreibt Events direkt in den Mock-Store (Bypass von addTimeClockEvent). */
  function setupEvents(profileId: string, events: TimeClockEvent[]): void {
    const map: Record<string, TimeClockEvent[]> = {};
    map[profileId] = events;
    mockStore[STORAGE_KEYS.TIMECLOCK_EVENTS] = JSON.stringify(map);
  }

  /** Liest Events für ein Profil aus dem Mock-Store. */
  function readEvents(profileId: string): TimeClockEvent[] {
    const raw = mockStore[STORAGE_KEYS.TIMECLOCK_EVENTS];
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, TimeClockEvent[]>;
    return map[profileId] ?? [];
  }

  // nowOverride: 2026-04-04 18:00 (Ortszeit) → daysBack=1 → 2026-04-03
  // F-Schicht: endTime 14:00, postShiftGrace 15min, extra 2h → cutoff 16:15 am 03.04.
  // 18:00 > 16:15 → Cutoff überschritten → Auslöser.
  const now_18h = new Date(2026, 3, 4, 18, 0, 0); // April 4, 18:00 Ortszeit

  asyncTest('A1: Kein Schichtplan → 0 Platzhalter', async () => {
    clearMockStore();
    const count = await autoStampMissedShifts('p-a1', { nowOverride: now_18h });
    eq(count, 0, 'Erwartet 0 Platzhalter ohne Schichtplan');
    eq(readEvents('p-a1').length, 0, 'Kein Event erwartet');
  });

  asyncTest('A2: Nicht-regulärer Schichtcode (R) → 0 Platzhalter', async () => {
    clearMockStore();
    const profileId = 'p-a2';
    // 2026-04-03 hat Schicht R (Ruhe) → nicht in REGULAR_SHIFT_CODES → überspringen
    setupShiftOverride(profileId, '2026-04-03', 'R');
    const count = await autoStampMissedShifts(profileId, { nowOverride: now_18h });
    eq(count, 0, 'Erwartet 0 Platzhalter für nicht-reguläre Schicht');
    eq(readEvents(profileId).length, 0);
  });

  asyncTest('A3: Cutoff noch nicht erreicht (N-Schicht) → 0 Platzhalter', async () => {
    clearMockStore();
    const profileId = 'p-a3';
    // N-Schicht: startTime 22:00, endTime 06:00 (Folgetag), postShiftGrace 30min
    // Für 2026-04-03: endAt = 2026-04-04T06:00 (Ortszeit), cutoff = 08:30
    // nowOverride = April 4 at 07:00 (< 08:30) → Cutoff noch nicht erreicht
    setupShiftOverride(profileId, '2026-04-03', 'N');
    const now_07h = new Date(2026, 3, 4, 7, 0, 0); // April 4, 07:00 Ortszeit
    const count = await autoStampMissedShifts(profileId, { nowOverride: now_07h });
    eq(count, 0, 'Erwartet 0 Platzhalter wenn Cutoff noch nicht erreicht');
    eq(readEvents(profileId).length, 0);
  });

  asyncTest('A4: Phase completed → 0 neue Events (idempotent)', async () => {
    clearMockStore();
    const profileId = 'p-a4';
    // F-Schicht am 2026-04-03 bereits mit Kommen + Gehen
    setupShiftOverride(profileId, '2026-04-03', 'F');
    setupEvents(profileId, [
      {
        id: 'e1', profileId, dateISO: '2026-04-03', weekdayLabel: 'Donnerstag',
        shiftCode: 'F', eventType: 'check_in',
        timestampISO: new Date(2026, 3, 3, 6, 0, 0).toISOString(),
        source: 'manual_service', createdAt: new Date(2026, 3, 3, 6, 0, 0).toISOString(),
      },
      {
        id: 'e2', profileId, dateISO: '2026-04-03', weekdayLabel: 'Donnerstag',
        shiftCode: 'F', eventType: 'check_out',
        timestampISO: new Date(2026, 3, 3, 14, 0, 0).toISOString(),
        source: 'manual_service', createdAt: new Date(2026, 3, 3, 14, 0, 0).toISOString(),
      },
    ]);
    const count = await autoStampMissedShifts(profileId, { nowOverride: now_18h });
    eq(count, 0, 'Erwartet 0 neue Platzhalter bei completed');
    eq(readEvents(profileId).length, 2, 'Events-Anzahl soll unverändert bleiben');
  });

  asyncTest('A5: Phase anomaly → 0 neue Events (kein Eingriff)', async () => {
    clearMockStore();
    const profileId = 'p-a5';
    // F-Schicht am 2026-04-03 mit doppeltem Kommen → anomaly
    setupShiftOverride(profileId, '2026-04-03', 'F');
    setupEvents(profileId, [
      {
        id: 'e1', profileId, dateISO: '2026-04-03', weekdayLabel: 'Donnerstag',
        shiftCode: 'F', eventType: 'check_in',
        timestampISO: new Date(2026, 3, 3, 6, 0, 0).toISOString(),
        source: 'manual_service', createdAt: new Date(2026, 3, 3, 6, 0, 0).toISOString(),
      },
      {
        id: 'e2', profileId, dateISO: '2026-04-03', weekdayLabel: 'Donnerstag',
        shiftCode: 'F', eventType: 'check_in',
        timestampISO: new Date(2026, 3, 3, 7, 0, 0).toISOString(),
        source: 'manual_service', createdAt: new Date(2026, 3, 3, 7, 0, 0).toISOString(),
      },
    ]);
    const count = await autoStampMissedShifts(profileId, { nowOverride: now_18h });
    eq(count, 0, 'Erwartet 0 neue Events bei anomaly');
    eq(readEvents(profileId).length, 2, 'Events-Anzahl soll unverändert bleiben');
  });

  asyncTest('A6: awaiting_check_in → 2 Platzhalter (Kommen + Gehen)', async () => {
    clearMockStore();
    const profileId = 'p-a6';
    // F-Schicht am 2026-04-03, keine Events → awaiting_check_in
    setupShiftOverride(profileId, '2026-04-03', 'F');
    const count = await autoStampMissedShifts(profileId, { nowOverride: now_18h });
    eq(count, 2, 'Erwartet 2 neue Platzhalter (Kommen + Gehen)');
    const evts = readEvents(profileId);
    eq(evts.length, 2);
    const checkIn = evts.find((e) => e.eventType === 'check_in');
    const checkOut = evts.find((e) => e.eventType === 'check_out');
    if (!checkIn) throw new Error('check_in Event fehlt');
    if (!checkOut) throw new Error('check_out Event fehlt');
    eq(checkIn.source, 'auto_placeholder', 'source muss auto_placeholder sein');
    eq(checkOut.source, 'auto_placeholder', 'source muss auto_placeholder sein');
    eq(checkIn.dateISO, '2026-04-03');
    eq(checkOut.dateISO, '2026-04-03');
    eq(checkIn.shiftCode, 'F');
    eq(checkOut.shiftCode, 'F');
  });

  asyncTest('A7: awaiting_check_out → 1 Platzhalter (nur Gehen)', async () => {
    clearMockStore();
    const profileId = 'p-a7';
    // F-Schicht am 2026-04-03, nur check_in vorhanden → awaiting_check_out
    setupShiftOverride(profileId, '2026-04-03', 'F');
    setupEvents(profileId, [
      {
        id: 'e1', profileId, dateISO: '2026-04-03', weekdayLabel: 'Donnerstag',
        shiftCode: 'F', eventType: 'check_in',
        timestampISO: new Date(2026, 3, 3, 6, 5, 0).toISOString(),
        source: 'manual_service', createdAt: new Date(2026, 3, 3, 6, 5, 0).toISOString(),
      },
    ]);
    const count = await autoStampMissedShifts(profileId, { nowOverride: now_18h });
    eq(count, 1, 'Erwartet 1 neuen Platzhalter (nur Gehen)');
    const evts = readEvents(profileId);
    eq(evts.length, 2, 'Nach Auto-Stamp: 2 Events gesamt');
    const newEvent = evts.find((e) => e.source === 'auto_placeholder');
    if (!newEvent) throw new Error('auto_placeholder Event fehlt');
    eq(newEvent.eventType, 'check_out', 'Platzhalter muss check_out sein');
    eq(newEvent.dateISO, '2026-04-03');
    eq(newEvent.shiftCode, 'F');
  });

  asyncTest('A8: Zwei vergessene Tage → 4 Platzhalter', async () => {
    clearMockStore();
    const profileId = 'p-a8';
    // F-Schicht am 2026-04-03 und 2026-04-02, keine Events → je 2 Platzhalter
    setupShiftOverride(profileId, '2026-04-03', 'F');
    setupShiftOverride(profileId, '2026-04-02', 'F');
    const count = await autoStampMissedShifts(profileId, { nowOverride: now_18h });
    eq(count, 4, 'Erwartet 4 Platzhalter für zwei vergessene Tage');
    const evts = readEvents(profileId);
    eq(evts.length, 4);
    const placeholders = evts.filter((e) => e.source === 'auto_placeholder');
    eq(placeholders.length, 4, 'Alle Events sollen auto_placeholder sein');
    // Beide Daten vertreten
    const dates = new Set(placeholders.map((e) => e.dateISO));
    eq(dates.has('2026-04-03'), true, '2026-04-03 muss vorhanden sein');
    eq(dates.has('2026-04-02'), true, '2026-04-02 muss vorhanden sein');
  });

  // ── Monatsstart-Grenze (B-Tests) ────────────────────────────────────────────

  asyncTest('B1: Erster Tag des Monats → daysToCheck=0, kein Rückblick', async () => {
    clearMockStore();
    const profileId = 'p-b1';
    // F-Schicht am 31. März (Vormonat) – darf NICHT in den Vormonat zurückblicken
    setupShiftOverride(profileId, '2026-03-31', 'F');
    // nowOverride = 1. April 2026 (getDate()=1 → daysToCheck=0)
    const now_apr1 = new Date(2026, 3, 1, 18, 0, 0);
    const count = await autoStampMissedShifts(profileId, { nowOverride: now_apr1 });
    eq(count, 0, 'Erster Monatstag: kein Rückblick in Vormonat');
    eq(readEvents(profileId).length, 0);
  });

  asyncTest('B2: Monatsmitte → alle Tage seit Monatsanfang werden geprüft', async () => {
    clearMockStore();
    const profileId = 'p-b2';
    // F-Schicht am 01., 02. und 03. April, keine Events
    // nowOverride = 04. April 18:00 → daysToCheck=3 → April 1, 2, 3 werden geprüft
    setupShiftOverride(profileId, '2026-04-01', 'F');
    setupShiftOverride(profileId, '2026-04-02', 'F');
    setupShiftOverride(profileId, '2026-04-03', 'F');
    const count = await autoStampMissedShifts(profileId, { nowOverride: now_18h });
    eq(count, 6, 'Erwartet 6 Platzhalter für 3 Tage × 2 Events');
    const evts = readEvents(profileId);
    eq(evts.length, 6);
    const placeholders = evts.filter((e) => e.source === 'auto_placeholder');
    eq(placeholders.length, 6);
    const d = new Set(placeholders.map((e) => e.dateISO));
    eq(d.has('2026-04-01'), true, '01. April muss vorhanden sein');
    eq(d.has('2026-04-02'), true, '02. April muss vorhanden sein');
    eq(d.has('2026-04-03'), true, '03. April muss vorhanden sein');
  });

  asyncTest('B3: Member-Parität – veraltetes entries-Fenster, Fallback via shiftCodeAtDate', async () => {
    clearMockStore();
    const profileId = 'p-b3';
    // Simuliert ein Member-Profil: Plan seit 2026-01-01, Pattern ['F'] (eintägiger Zyklus),
    // aber entries enthält NUR den Starttag (generatedUntilISO veraltet).
    // getShiftForDate soll auf shiftCodeAtDate(startDateISO, pattern, dateISO) zurückfallen
    // und dennoch 'F' für April 3 liefern (diff=92, 92%1=0 → pattern[0]='F').
    const sparseShiftPlan = {
      profileId,
      startDateISO: '2026-01-01',
      anchorDateISO: '2026-01-01',
      pattern: ['F'],
      cycleLengthDays: 1,
      generatedUntilISO: '2026-01-07', // absichtlich veraltet – April 3 fehlt in entries
      entries: [{ dateISO: '2026-01-01', code: 'F' }],
    };
    mockStore[STORAGE_KEYS.SHIFTS] = JSON.stringify({ [profileId]: sparseShiftPlan });

    // nowOverride = 04. April 18:00 → prüft April 1-3
    const count = await autoStampMissedShifts(profileId, { nowOverride: now_18h });
    eq(count, 6, 'Member-Parität: Fallback-Pfad erzeugt 6 Platzhalter (3 Tage × 2)');
    const evts = readEvents(profileId);
    eq(evts.length, 6);
    const placeholders = evts.filter((e) => e.source === 'auto_placeholder');
    eq(placeholders.length, 6, 'Alle via shiftCodeAtDate-Fallback erzeugten Events sind auto_placeholder');
    eq(placeholders.every((e) => e.shiftCode === 'F'), true, 'shiftCode muss F sein');
  });
});

// ─── Ergebnis (nach allen async-Tests) ───────────────────────────────────────

asyncChain.then(() => {
  process.stdout.write(
    `\n  Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen\n\n`
  );
  if (failed > 0) {
    process.exit(1);
  }
});

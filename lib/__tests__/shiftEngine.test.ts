/**
 * Regression-Tests: shiftEngine.ts
 *
 * Ausführen: cd yasa && npx sucrase-node lib/__tests__/shiftEngine.test.ts
 *
 * Abgedeckte Domain-Invarianten:
 *   I1. Pattern[0] ≡ startDate (diffDays = 0 → Index 0)
 *   I2. patternIndex(d) = diffDays(start, d) % cycleLength
 *   I3. target < startDate → null (kein negativer Index)
 *   I4. diffDaysUTC ist DST-neutral (UTC-Berechnung, kein Lokalzeit-Versatz)
 *   I5. Monatswechsel (incl. Schaltjahr) korrekt
 *   I6. Jahreswechsel korrekt
 *   I7. detectSubPattern erkennt echte Teilmuster
 *   I8. weekdayIndexUTC: Mo=0, So=6
 */

import {
  diffDaysUTC,
  shiftCodeAtDate,
  detectSubPattern,
  weekdayIndexUTC,
} from '../shiftEngine';
import type { ShiftType } from '../../types';

// ─── Minimales Test-Framework ────────────────────────────────────────────────

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

function isNull(actual: unknown, msg?: string): void {
  if (actual !== null) {
    throw new Error(msg ?? `Expected null, got ${JSON.stringify(actual)}`);
  }
}

function deepEq<T>(actual: T, expected: T, msg?: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// ─── Test-Suiten ─────────────────────────────────────────────────────────────

describe('diffDaysUTC', () => {
  test('gleiches Datum → 0', () => {
    eq(diffDaysUTC('2025-01-15', '2025-01-15'), 0);
  });

  test('ein Tag später → 1', () => {
    eq(diffDaysUTC('2025-01-15', '2025-01-16'), 1);
  });

  test('ein Tag früher → -1', () => {
    eq(diffDaysUTC('2025-01-16', '2025-01-15'), -1);
  });

  test('Monatswechsel Januar→Februar (kein Schaltjahr)', () => {
    eq(diffDaysUTC('2025-01-31', '2025-02-01'), 1);
  });

  test('Monatswechsel über Schaltjahr (Feb 28 → Mar 1, 2024)', () => {
    // 2024 ist Schaltjahr: Feb hat 29 Tage
    eq(diffDaysUTC('2024-02-28', '2024-03-01'), 2);
  });

  test('Monatswechsel über normales Jahr (Feb 28 → Mar 1, 2025)', () => {
    // 2025 ist kein Schaltjahr: Feb hat 28 Tage
    eq(diffDaysUTC('2025-02-28', '2025-03-01'), 1);
  });

  test('Jahreswechsel Dez→Jan', () => {
    eq(diffDaysUTC('2024-12-31', '2025-01-01'), 1);
  });

  test('DST-neutral: MEZ→MESZ (Europa, Frühjahrswechsel 2025-03-29→30)', () => {
    // In Europa MEZ→MESZ: Clocks spring forward → 23-Stunden-Tag lokal.
    // UTC-Berechnung muss trotzdem 1 zurückgeben, nicht 0.
    eq(diffDaysUTC('2025-03-29', '2025-03-30'), 1);
  });

  test('DST-neutral: MESZ→MEZ (Europa, Herbstwechsel 2025-10-25→26)', () => {
    // In Europa MESZ→MEZ: Clocks fall back → 25-Stunden-Tag lokal.
    // UTC-Berechnung muss trotzdem 1 zurückgeben, nicht 2.
    eq(diffDaysUTC('2025-10-25', '2025-10-26'), 1);
  });

  test('USA DST spring (2025-03-08→09)', () => {
    eq(diffDaysUTC('2025-03-08', '2025-03-09'), 1);
  });

  test('28-Tage-Abstand', () => {
    eq(diffDaysUTC('2025-01-01', '2025-01-29'), 28);
  });

  test('365-Tage-Abstand (kein Schaltjahr)', () => {
    eq(diffDaysUTC('2025-01-01', '2026-01-01'), 365);
  });

  test('366-Tage-Abstand (Schaltjahr 2024)', () => {
    eq(diffDaysUTC('2024-01-01', '2025-01-01'), 366);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('shiftCodeAtDate — Domain-Invariante I1+I2+I3', () => {
  const P4: ShiftType[] = ['F', 'S', 'N', 'R'];    // 4-er Zyklus
  const P7: ShiftType[] = ['F','F','N','N','R','R','R']; // 7-er Zyklus
  const start = '2025-03-01';

  // I1: Pattern[0] ≡ startDate
  test('I1: target = start → pattern[0]', () => {
    eq(shiftCodeAtDate(start, P4, start), 'F');
  });

  test('I2: target = start+1 → pattern[1]', () => {
    eq(shiftCodeAtDate(start, P4, '2025-03-02'), 'S');
  });

  test('I2: target = start+3 → pattern[3]', () => {
    eq(shiftCodeAtDate(start, P4, '2025-03-04'), 'R');
  });

  test('I2: target = start+4 → pattern[0] (Zykluswrap)', () => {
    eq(shiftCodeAtDate(start, P4, '2025-03-05'), 'F');
  });

  test('I2: target = start+5 → pattern[1]', () => {
    eq(shiftCodeAtDate(start, P4, '2025-03-06'), 'S');
  });

  test('I2: target = start+7 (7er-Zyklus, wrap auf Index 0)', () => {
    eq(shiftCodeAtDate(start, P7, '2025-03-08'), 'F');
  });

  // I3: Datum VOR Startdatum
  test('I3: target < start → null', () => {
    isNull(shiftCodeAtDate(start, P4, '2025-02-28'));
  });

  test('I3: target weit vor start → null', () => {
    isNull(shiftCodeAtDate(start, P4, '2020-01-01'));
  });

  // Edge cases
  test('leeres Pattern → null', () => {
    isNull(shiftCodeAtDate(start, [], start));
  });

  test('1-er Pattern: immer pattern[0]', () => {
    const p: ShiftType[] = ['N'];
    eq(shiftCodeAtDate(start, p, start), 'N');
    eq(shiftCodeAtDate(start, p, '2025-12-31'), 'N');
  });

  // Monatswechsel im Zyklus (I4+I5)
  test('Monatswechsel Jan→Feb: korrekte Indexberechnung', () => {
    const s = '2025-01-20';
    // diffDays('2025-01-20', '2025-02-02') = 13
    // 13 % 4 = 1 → pattern[1] = 'S'
    eq(diffDaysUTC(s, '2025-02-02'), 13);
    eq(shiftCodeAtDate(s, P4, '2025-02-02'), 'S');
  });

  // Zyklus über Jahreswechsel
  test('Jahreswechsel im 28er-Zyklus: korrekte Indexberechnung', () => {
    const s = '2024-12-15';
    // diffDays('2024-12-15', '2025-01-12') = 28 → 28 % 4 = 0 → 'F'
    eq(diffDaysUTC(s, '2025-01-12'), 28);
    eq(shiftCodeAtDate(s, P4, '2025-01-12'), 'F');
  });

  // NaN-Guard (ungültiges Datum → niemals undefined)
  test('ungültiges startISO → null (NaN-Guard)', () => {
    // 'kein-datum' → split → map(Number) → NaN → Date.UTC(NaN…) → NaN
    isNull(shiftCodeAtDate('kein-datum', P4, '2026-02-26'));
  });

  test('ungültiges targetISO → null (NaN-Guard)', () => {
    isNull(shiftCodeAtDate('2026-01-01', P4, 'kein-datum'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('detectSubPattern', () => {
  test('7er-Periode in unvollständigem 24er-Pattern erkannt', () => {
    // base7 × 4 = 28, abgeschnitten auf 24: 24 % 7 = 3 ≠ 0 → Vervollständigung auf 28 möglich.
    // Wichtig: 3 Wiederholungen (21) wäre ein vollständiges Vielfaches → Algorithm überspringt
    // diesen Fall korrekt (nichts zu vervollständigen).
    const base7: ShiftType[] = ['N','N','K','R','R','R','N'];
    const p = [...base7, ...base7, ...base7, ...base7].slice(0, 24) as ShiftType[];
    const result = detectSubPattern(p);
    eq(result !== null, true, 'detectSubPattern sollte nicht null sein');
    if (result !== null) {
      eq(result.period, 7);
      eq(result.completedLength, 28); // ceil(24/7)*7 = 4*7 = 28
      // extension = completedLength - n = 28 - 24 = 4 Codes
      // Indizes im Basispattern: 24%7=3, 25%7=4, 26%7=5, 27%7=6
      eq(result.extension.length, 4);
      deepEq(result.extension, ['R', 'R', 'R', 'N'] as ShiftType[]);
    }
  });

  test('kein Teilmuster → null', () => {
    // Zufälliges Muster ohne Wiederholung
    const p: ShiftType[] = ['F','S','N','K','T','R','U','X','F','N','S','K'];
    isNull(detectSubPattern(p));
  });

  test('zu kurz (< 8 Codes) → null', () => {
    const p: ShiftType[] = ['F','S','N','K','R','R','R'];
    isNull(detectSubPattern(p));
  });

  test('alles R → null (Nutzer hat noch nichts eingegeben)', () => {
    const p: ShiftType[] = new Array(14).fill('R') as ShiftType[];
    isNull(detectSubPattern(p));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('weekdayIndexUTC — Mo=0…So=6', () => {
  test('2025-01-06 ist Montag (0)', () => {
    eq(weekdayIndexUTC('2025-01-06'), 0);
  });

  test('2025-01-07 ist Dienstag (1)', () => {
    eq(weekdayIndexUTC('2025-01-07'), 1);
  });

  test('2025-01-11 ist Samstag (5)', () => {
    eq(weekdayIndexUTC('2025-01-11'), 5);
  });

  test('2025-01-12 ist Sonntag (6)', () => {
    eq(weekdayIndexUTC('2025-01-12'), 6);
  });

  test('2026-02-26 ist Donnerstag (3)', () => {
    eq(weekdayIndexUTC('2026-02-26'), 3);
  });

  test('ungültiges Format → -1', () => {
    eq(weekdayIndexUTC('not-a-date'), -1);
  });
});

// ─── Ergebnis ─────────────────────────────────────────────────────────────────

process.stdout.write(
  `\n  Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen\n\n`
);

if (failed > 0) {
  process.exit(1);
}

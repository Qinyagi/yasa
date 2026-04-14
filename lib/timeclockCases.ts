/**
 * timeclockCases.ts — Shift-Case-Aggregation für die Stempeluhr-Anzeige.
 *
 * Extrahierte, pure Logik aus app/(services)/timeclock.tsx für Testbarkeit.
 *
 * P0 FIXES (2026-04-11):
 *   - Overnight-Shift (N, KN) Crossover: wenn check_out Timestamp ≤ check_in Timestamp
 *     und die Schicht overnight ist, wird +24h addiert. Behebt "Unvollständig"-Bug
 *     nach "Bearbeiten" von N-Platzhaltern, wenn der User die Zeit 06:00 eingibt
 *     und das dateISO auf dem Schicht-Tag D bleibt (statt D+1).
 *   - N-Shift-Toleranzfenster: isValidNShiftPair erkennt Standardfenster
 *     check_in [21:30, 22:30] + check_out [05:30, 06:30] UND Early-Checkout
 *     [04:00, 05:30] als gültig (kein Anomaly-Flag).
 *   - Per-Shift "flexHours" → "deltaHours" umbenannt (semantische Klarstellung).
 *     Echter Paid-Flex-Credit wird separat über computeShiftFlexCreditHours
 *     berechnet und NICHT in die Delta gemischt.
 *   - computeMonthly delta bleibt strict: worked - planned (unverändert in
 *     lib/timeAccountEngine.ts). Flex ist nur im Feld creditedFlexHoursToDate.
 */

import type { RegularShiftCode, TimeClockEvent, UserTimeClockConfig } from '../types';

export const REGULAR_SHIFT_CODES: RegularShiftCode[] = ['F', 'S', 'N', 'KS', 'KN', 'T'];

export const SHIFT_SORT_ORDER: Record<RegularShiftCode, number> = {
  F: 0,
  S: 1,
  N: 2,
  KS: 3,
  KN: 4,
  T: 5,
};

/** Minuten eines HH:MM-Strings, robust gegen leere/invalide Inputs. */
export function minutesForHHMM(input: string): number {
  if (!input) return 0;
  const [hRaw, mRaw] = input.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  const hh = Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 0;
  const mm = Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0;
  return hh * 60 + mm;
}

/** Geplante Schichtminuten; behandelt overnight (end ≤ start → +24h). */
export function plannedShiftMinutes(window: { startTime: string; endTime: string }): number {
  const start = minutesForHHMM(window.startTime);
  let end = minutesForHHMM(window.endTime);
  if (end <= start) end += 24 * 60;
  return end - start;
}

/** Ist die Schicht overnight (Endzeit ≤ Startzeit)? */
export function isOvernightShift(
  cfg: UserTimeClockConfig | null,
  shiftCode: RegularShiftCode
): boolean {
  if (!cfg) return false;
  const w = cfg.shiftSettings[shiftCode];
  if (!w) return false;
  return minutesForHHMM(w.endTime) <= minutesForHHMM(w.startTime);
}

/** Wochentag-Label (Deutsch) aus dateISO. */
export function weekdayLabelDE(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('de-DE', { weekday: 'long' });
}

/**
 * N-Shift-Toleranzfenster (P0):
 *   check_in in [21:30, 22:30]
 *   check_out in [05:30, 06:30] ODER [04:00, 05:30) Early-Checkout-Sonderfall
 *
 * @returns true wenn beide Timestamps innerhalb des Fensters liegen.
 *          Ausschließlich auf Wall-Clock-Minuten bezogen (Tagwechsel spielt keine Rolle).
 */
export function isValidNShiftPair(
  checkInTimestampISO: string,
  checkOutTimestampISO: string
): boolean {
  const ci = new Date(checkInTimestampISO);
  const co = new Date(checkOutTimestampISO);
  if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) return false;
  const ciMin = ci.getHours() * 60 + ci.getMinutes();
  const coMin = co.getHours() * 60 + co.getMinutes();
  const checkInValid = ciMin >= 21 * 60 + 30 && ciMin <= 22 * 60 + 30;
  // Normalfenster 05:30–06:30 vereinigt mit Early-Checkout 04:00–05:30
  const checkOutValid = coMin >= 4 * 60 && coMin <= 6 * 60 + 30;
  return checkInValid && checkOutValid;
}

/**
 * Pairt check_in/check_out events innerhalb eines Groups.
 * Fixt N-Shift-Crossover durch +24h auf end-Timestamp, wenn end ≤ start
 * UND die Schicht overnight ist.
 *
 * @returns segmentCount, workedMinutes, openCheckIn, orphanCheckOutCount
 */
export function pairCaseEvents(
  sortedCaseEvents: TimeClockEvent[],
  cfg: UserTimeClockConfig | null,
  shiftCode: RegularShiftCode
): {
  segmentCount: number;
  workedMinutes: number;
  hasOpenCheckIn: boolean;
  orphanCheckOutCount: number;
  firstCheckIn: TimeClockEvent | null;
  lastCheckOut: TimeClockEvent | null;
} {
  let openCheckIn: TimeClockEvent | null = null;
  let orphanCheckOutCount = 0;
  let workedMinutes = 0;
  let segmentCount = 0;
  let firstCheckIn: TimeClockEvent | null = null;
  let lastCheckOut: TimeClockEvent | null = null;
  let totalCheckInCount = 0;
  let totalCheckOutCount = 0;
  let firstSeenCheckOut: TimeClockEvent | null = null;
  const overnight = isOvernightShift(cfg, shiftCode);

  for (const event of sortedCaseEvents) {
    if (event.eventType === 'check_in') {
      totalCheckInCount += 1;
      if (firstCheckIn === null) firstCheckIn = event;
      // Bei doppeltem Kommen ohne Gehen: letzter Start ist aktiver Marker.
      openCheckIn = event;
      continue;
    }
    // check_out
    totalCheckOutCount += 1;
    if (firstSeenCheckOut === null) firstSeenCheckOut = event;
    lastCheckOut = event;
    if (!openCheckIn) {
      orphanCheckOutCount += 1;
      continue;
    }
    const startMs = new Date(openCheckIn.timestampISO).getTime();
    let endMs = new Date(event.timestampISO).getTime();
    // P0 FIX: overnight shift crossover
    // Wenn der User nach Edit beide Events auf Tag D hat (z.B. check_in 22:00 D,
    // check_out 06:00 D), liegt end vor start. Für Overnight-Shifts interpretieren
    // wir end als Folgetag-Zeitpunkt (+24h).
    if (endMs <= startMs && overnight) {
      endMs += 24 * 60 * 60 * 1000;
    }
    const diffMinutes = Math.round((endMs - startMs) / 60000);
    if (diffMinutes > 0) {
      workedMinutes += diffMinutes;
      segmentCount += 1;
    }
    openCheckIn = null;
  }

  // Robustheits-Fallback:
  // Wenn exakt 1x check_in + 1x check_out vorhanden sind, aber wegen
  // Reihenfolge-/Legacy-Metadaten kein Segment gepaart wurde, versuchen wir
  // eine direkte Paarbildung über die beiden Timestamps.
  // Ziel: "Unvollständig" vermeiden, wenn fachlich ein valides Paar existiert.
  if (
    segmentCount === 0 &&
    totalCheckInCount === 1 &&
    totalCheckOutCount === 1 &&
    firstCheckIn &&
    firstSeenCheckOut
  ) {
    const startMs = new Date(firstCheckIn.timestampISO).getTime();
    let endMs = new Date(firstSeenCheckOut.timestampISO).getTime();
    if (endMs <= startMs && overnight) {
      endMs += 24 * 60 * 60 * 1000;
    }
    const diffMinutes = Math.round((endMs - startMs) / 60000);
    if (diffMinutes > 0) {
      workedMinutes = diffMinutes;
      segmentCount = 1;
      openCheckIn = null;
      orphanCheckOutCount = 0;
      lastCheckOut = firstSeenCheckOut;
    }
  }

  return {
    segmentCount,
    workedMinutes,
    hasOpenCheckIn: openCheckIn !== null,
    orphanCheckOutCount,
    firstCheckIn,
    lastCheckOut,
  };
}

export interface ShiftCaseSummary {
  key: string;
  dateISO: string;
  weekday: string;
  shiftCode: RegularShiftCode;
  checkIn: string | null;
  checkOut: string | null;
  segmentCount: number;
  hasOpenCheckIn: boolean;
  orphanCheckOutCount: number;
  plannedHours: number;
  workedHours: number | null;
  /**
   * Per-Shift-Delta (worked - planned) in Stunden.
   * ACHTUNG: Semantisch ein DELTA, nicht "Gleitzeit". Flex wird separat
   * über computeShiftFlexCreditHours berechnet und darf NICHT in diesen Wert
   * gemischt werden (Invariante: Delta = worked - planned, strict).
   */
  deltaHours: number | null;
  /** Paid-Flex-Credit für diese Schicht (separat, nur zu Anzeigezwecken). */
  flexCreditHours: number | null;
}

export interface DaySummary {
  dateISO: string;
  weekday: string;
  workedHours: number;
  /** Per-Day-Delta (worked - planned), NICHT Flex. */
  deltaHours: number;
  completedShiftCount: number;
}

/**
 * Berechnet den Paid-Flex-Credit für eine konkret gestempelte Schicht.
 * Entspricht der Logik in lib/timeAccountEngine.ts computeFlexCreditHours,
 * aber auf Basis der rohen check_in/check_out Timestamps einer Shift-Case.
 *
 * Invariante: Dieser Wert ist NUR informativ. Er beeinflusst NICHT die Delta
 * (worked - planned). Er ist eine separate Größe für die Flex-Konto-Anzeige.
 */
export function computeShiftFlexCreditHours(
  dateISO: string,
  shiftCode: RegularShiftCode,
  checkInISO: string | null,
  checkOutISO: string | null,
  cfg: UserTimeClockConfig | null
): number {
  if (!cfg || !checkInISO || !checkOutISO) return 0;
  const window = cfg.shiftSettings[shiftCode];
  if (!window) return 0;
  const paidFlex = Math.max(0, window.paidFlexMinutes || 0);
  if (paidFlex === 0) return 0;

  const [y, m, d] = dateISO.split('-').map(Number);
  const startMin = minutesForHHMM(window.startTime);
  let endMin = minutesForHHMM(window.endTime);
  const overnight = endMin <= startMin;
  if (overnight) endMin += 24 * 60;

  const scheduledStart = new Date(y, m - 1, d, Math.floor(startMin / 60), startMin % 60, 0, 0);
  const scheduledEnd = new Date(
    y,
    m - 1,
    d,
    Math.floor(endMin / 60),
    endMin % 60,
    0,
    0
  );
  // Die Construction mit >24h-Werten klappt in JS: Date(…, 30, 0) → nächster Tag.

  const actualStart = new Date(checkInISO).getTime();
  let actualEnd = new Date(checkOutISO).getTime();
  // Overnight-Crossover für Ist-Zeiten (falls beide auf Tag D gespeichert)
  if (actualEnd <= actualStart && overnight) {
    actualEnd += 24 * 60 * 60 * 1000;
  }

  const earlyMinutes = Math.max(
    0,
    Math.round((scheduledStart.getTime() - actualStart) / 60000)
  );
  const lateMinutes = Math.max(
    0,
    Math.round((actualEnd - scheduledEnd.getTime()) / 60000)
  );
  const credited = Math.min(paidFlex, earlyMinutes + lateMinutes);
  return credited / 60;
}

/**
 * Gruppiert TimeClockEvents pro (dateISO, shiftCode) und baut ShiftCaseSummaries.
 *
 * Sortierung innerhalb eines Groups: createdAt-zuerst, Tiebreaker timestampISO.
 * Damit bleibt die Reihenfolge zwischen manual_edit und auto_placeholder-Events
 * deterministisch (manual_edit behält createdAt des Originals).
 */
export function buildShiftCases(
  eventList: TimeClockEvent[],
  cfg: UserTimeClockConfig | null
): ShiftCaseSummary[] {
  if (!cfg) return [];
  const grouped = new Map<string, TimeClockEvent[]>();

  eventList.forEach((event) => {
    const key = `${event.dateISO}|${event.shiftCode}`;
    const existing = grouped.get(key) ?? [];
    existing.push(event);
    grouped.set(key, existing);
  });

  const cases: ShiftCaseSummary[] = [];
  grouped.forEach((events, key) => {
    const sorted = [...events].sort((a, b) => {
      const byCreated = a.createdAt.localeCompare(b.createdAt);
      if (byCreated !== 0) return byCreated;
      return a.timestampISO.localeCompare(b.timestampISO);
    });
    const [dateISO, shiftCodeRaw] = key.split('|');
    const shiftCode = shiftCodeRaw as RegularShiftCode;
    const plannedMinutes = plannedShiftMinutes(cfg.shiftSettings[shiftCode]);

    const paired = pairCaseEvents(sorted, cfg, shiftCode);

    let workedHours: number | null = null;
    let deltaHours: number | null = null;
    let flexCreditHours: number | null = null;
    if (paired.segmentCount > 0) {
      workedHours = paired.workedMinutes / 60;
      // INVARIANTE: Delta = worked - planned, strict. Flex-Credit wird NICHT eingemischt.
      deltaHours = (paired.workedMinutes - plannedMinutes) / 60;
      flexCreditHours = computeShiftFlexCreditHours(
        dateISO,
        shiftCode,
        paired.firstCheckIn?.timestampISO ?? null,
        paired.lastCheckOut?.timestampISO ?? null,
        cfg
      );
    }

    cases.push({
      key,
      dateISO,
      weekday:
        paired.firstCheckIn?.weekdayLabel ??
        paired.lastCheckOut?.weekdayLabel ??
        weekdayLabelDE(dateISO),
      shiftCode,
      checkIn: paired.firstCheckIn?.timestampISO ?? null,
      checkOut: paired.lastCheckOut?.timestampISO ?? null,
      segmentCount: paired.segmentCount,
      hasOpenCheckIn: paired.hasOpenCheckIn,
      orphanCheckOutCount: paired.orphanCheckOutCount,
      plannedHours: plannedMinutes / 60,
      workedHours,
      deltaHours,
      flexCreditHours,
    });
  });

  return cases.sort((a, b) => {
    if (a.dateISO !== b.dateISO) return b.dateISO.localeCompare(a.dateISO);
    return SHIFT_SORT_ORDER[a.shiftCode] - SHIFT_SORT_ORDER[b.shiftCode];
  });
}

/**
 * Aggregiert ShiftCaseSummaries pro Tag.
 * deltaHours = Summe der per-shift deltaHours (worked - planned).
 * Unvollständige Cases (workedHours === null) werden übersprungen.
 */
export function buildDaySummaries(shiftCases: ShiftCaseSummary[]): DaySummary[] {
  const dayMap = new Map<string, DaySummary>();
  shiftCases.forEach((entry) => {
    if (entry.workedHours === null || entry.deltaHours === null) return;
    const current = dayMap.get(entry.dateISO) ?? {
      dateISO: entry.dateISO,
      weekday: entry.weekday,
      workedHours: 0,
      deltaHours: 0,
      completedShiftCount: 0,
    };
    current.workedHours += entry.workedHours;
    current.deltaHours += entry.deltaHours;
    current.completedShiftCount += 1;
    dayMap.set(entry.dateISO, current);
  });

  return [...dayMap.values()].sort((a, b) => b.dateISO.localeCompare(a.dateISO));
}

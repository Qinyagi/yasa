import type { RegularShiftCode, TimeClockEvent, UserShiftPlan, UserTimeClockConfig } from '../types';
import type { SpaceRuleProfile } from '../types/timeAccount';
import { getHolidayMap } from '../data/holidays';
import type { TimeClockQaDateType } from './storage';

const REGULAR_SHIFT_CODES: ReadonlySet<RegularShiftCode> = new Set(['F', 'S', 'N', 'KS', 'KN', 'T']);

export interface MonthlyWorkProgress {
  monthLabel: string;
  fromISO: string;
  toISO: string;
  plannedHoursMonth: number;
  plannedHoursToDate: number;
  workedHoursToDate: number;
  deltaHoursToDate: number;
  creditedHolidayHoursToDate: number;
  creditedPreHolidayHoursToDate: number;
  creditedHoursToDate: number;
  creditedFlexHoursToDate: number;
  totalDeltaWithCreditsToDate: number;
  explanation: string[];
}

export interface ComputeMonthlyWorkProgressInput {
  plan: UserShiftPlan | null;
  config: UserTimeClockConfig | null;
  events: TimeClockEvent[];
  spaceProfile?: SpaceRuleProfile | null;
  qaDateOverrides?: Record<string, TimeClockQaDateType>;
  today?: Date;
}

interface WorkSegment {
  dateISO: string;
  shiftCode: RegularShiftCode;
  startAt: Date;
  endAt: Date;
}

function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function minutesForHHMM(input: string): number {
  const [hRaw, mRaw] = input.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  const hh = Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 0;
  const mm = Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0;
  return hh * 60 + mm;
}

function plannedShiftMinutes(window: { startTime: string; endTime: string }): number {
  const start = minutesForHHMM(window.startTime);
  let end = minutesForHHMM(window.endTime);
  if (end <= start) end += 24 * 60;
  return end - start;
}

function currentMonthBounds(today: Date): { fromISO: string; toISO: string; label: string } {
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return {
    fromISO: formatDateISO(from),
    toISO: formatDateISO(to),
    label: today.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
  };
}

function collectHolidayMap(fromISO: string, toISO: string): Record<string, { date: string; name: string }> {
  const fromYear = Number(fromISO.slice(0, 4));
  const toYear = Number(toISO.slice(0, 4));
  const map: Record<string, { date: string; name: string }> = {};
  for (let year = fromYear; year <= toYear + 1; year++) {
    Object.assign(map, getHolidayMap(year));
  }
  return map;
}

function plusDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const next = new Date(y, m - 1, d);
  next.setDate(next.getDate() + days);
  return formatDateISO(next);
}

function isPreHolidayDate(
  dateISO: string,
  holidayMap: Record<string, { date: string; name: string }>
): boolean {
  return !!holidayMap[plusDaysISO(dateISO, 1)];
}

function toShiftDateTime(dateISO: string, hhmm: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  const minutes = minutesForHHMM(hhmm);
  const h = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return new Date(y, m - 1, d, h, mm, 0, 0);
}

function fmtHours(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} h`;
}

function pairWorkSegments(
  events: TimeClockEvent[],
  config: UserTimeClockConfig | null
): WorkSegment[] {
  const grouped = new Map<string, TimeClockEvent[]>();
  for (const event of events) {
    const key = `${event.dateISO}|${event.shiftCode}`;
    const arr = grouped.get(key) ?? [];
    arr.push(event);
    grouped.set(key, arr);
  }

  const segments: WorkSegment[] = [];
  grouped.forEach((caseEvents, key) => {
    const [dateISO, shiftCodeRaw] = key.split('|');
    const shiftCode = shiftCodeRaw as RegularShiftCode;
    const sorted = [...caseEvents].sort((a, b) => {
      const byCreated = a.createdAt.localeCompare(b.createdAt);
      if (byCreated !== 0) return byCreated;
      return a.timestampISO.localeCompare(b.timestampISO);
    });
    let openCheckIn: TimeClockEvent | null = null;
    for (const event of sorted) {
      if (event.eventType === 'check_in') {
        openCheckIn = event;
        continue;
      }
      if (!openCheckIn) continue;
      const startAt = new Date(openCheckIn.timestampISO);
      let endAt = new Date(event.timestampISO);
      if (endAt.getTime() <= startAt.getTime() && config) {
        const shiftWindow = config.shiftSettings[shiftCode];
        const isOvernightShift =
          !!shiftWindow &&
          minutesForHHMM(shiftWindow.endTime) <= minutesForHHMM(shiftWindow.startTime);
        if (isOvernightShift) {
          endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
        }
      }
      if (endAt.getTime() > startAt.getTime()) {
        segments.push({ dateISO, shiftCode, startAt, endAt });
      }
      openCheckIn = null;
    }
  });
  return segments;
}

function splitSegmentByMidnight(segment: WorkSegment): Array<{ dateISO: string; minutes: number }> {
  const parts: Array<{ dateISO: string; minutes: number }> = [];
  let cursor = new Date(segment.startAt);
  const end = segment.endAt;
  while (cursor.getTime() < end.getTime()) {
    const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 0, 0, 0, 0);
    const nextMidnight = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const sliceEnd = new Date(Math.min(nextMidnight.getTime(), end.getTime()));
    const minutes = Math.max(0, Math.round((sliceEnd.getTime() - cursor.getTime()) / 60000));
    if (minutes > 0) {
      parts.push({ dateISO: formatDateISO(cursor), minutes });
    }
    cursor = sliceEnd;
  }
  return parts;
}

function computeFlexCreditHours(segment: WorkSegment, config: UserTimeClockConfig | null): number {
  if (!config) return 0;
  const window = config.shiftSettings[segment.shiftCode];
  if (!window) return 0;
  const scheduledStart = toShiftDateTime(segment.dateISO, window.startTime);
  let scheduledEnd = toShiftDateTime(segment.dateISO, window.endTime);
  if (scheduledEnd.getTime() <= scheduledStart.getTime()) {
    scheduledEnd = new Date(scheduledEnd.getTime() + 24 * 60 * 60 * 1000);
  }
  const paidFlex = Math.max(0, window.paidFlexMinutes || 0);
  if (paidFlex === 0) return 0;

  const earlyMinutes = Math.max(0, Math.round((scheduledStart.getTime() - segment.startAt.getTime()) / 60000));
  const lateMinutes = Math.max(0, Math.round((segment.endAt.getTime() - scheduledEnd.getTime()) / 60000));
  const credited = Math.min(paidFlex, earlyMinutes + lateMinutes);
  return credited / 60;
}

export function computeMonthlyWorkProgress(
  input: ComputeMonthlyWorkProgressInput
): MonthlyWorkProgress {
  const todayDate = input.today ?? new Date();
  const todayISO = formatDateISO(todayDate);
  const { fromISO, toISO, label } = currentMonthBounds(todayDate);

  let plannedHoursMonth = 0;
  let plannedHoursToDate = 0;

  if (input.plan && input.config) {
    const entriesInMonth = input.plan.entries.filter((e) => e.dateISO >= fromISO && e.dateISO <= toISO);
    for (const entry of entriesInMonth) {
      if (!REGULAR_SHIFT_CODES.has(entry.code as RegularShiftCode)) continue;
      const hours = plannedShiftMinutes(input.config.shiftSettings[entry.code as RegularShiftCode]) / 60;
      plannedHoursMonth += hours;
      if (entry.dateISO <= todayISO) plannedHoursToDate += hours;
    }
  }

  const monthEvents = input.events.filter((e) => e.dateISO >= fromISO && e.dateISO <= todayISO);
  const segments = pairWorkSegments(monthEvents, input.config);
  const holidayMap = collectHolidayMap(fromISO, toISO);

  let workedHoursToDate = 0;
  let creditedHolidayHoursToDate = 0;
  let creditedPreHolidayHoursToDate = 0;
  let creditedFlexHoursToDate = 0;

  for (const segment of segments) {
    const workedMinutes = Math.max(0, Math.round((segment.endAt.getTime() - segment.startAt.getTime()) / 60000));
    workedHoursToDate += workedMinutes / 60;
    creditedFlexHoursToDate += computeFlexCreditHours(segment, input.config);

    const parts = splitSegmentByMidnight(segment);
    for (const part of parts) {
      const overrideType = input.qaDateOverrides?.[part.dateISO];
      const isHolidayDate = overrideType === 'holiday' || (overrideType !== 'preholiday' && !!holidayMap[part.dateISO]);
      const isPreHoliday =
        overrideType === 'preholiday' ||
        (overrideType !== 'holiday' && isPreHolidayDate(part.dateISO, holidayMap));

      if (input.spaceProfile?.holidayCredit.enabled && isHolidayDate) {
        creditedHolidayHoursToDate += part.minutes / 60;
        continue;
      }
      if (input.spaceProfile?.preHolidayCredit.enabled && isPreHoliday) {
        creditedPreHolidayHoursToDate += part.minutes / 60;
      }
    }
  }

  const deltaHoursToDate = workedHoursToDate - plannedHoursToDate;
  const creditedHoursToDate = creditedHolidayHoursToDate + creditedPreHolidayHoursToDate;
  const totalDeltaWithCreditsToDate = deltaHoursToDate + creditedHoursToDate;

  return {
    monthLabel: label,
    fromISO,
    toISO,
    plannedHoursMonth,
    plannedHoursToDate,
    workedHoursToDate,
    deltaHoursToDate,
    creditedHolidayHoursToDate,
    creditedPreHolidayHoursToDate,
    creditedHoursToDate,
    creditedFlexHoursToDate,
    totalDeltaWithCreditsToDate,
    explanation: [
      `Soll aus Schichtplan (${fromISO} bis ${toISO})`,
      `Ist aus Stempelintervallen bis ${todayISO}`,
      `Soll bisher: ${fmtHours(plannedHoursToDate)}`,
      `Ist bisher: ${fmtHours(workedHoursToDate)}`,
      `Delta bisher: ${fmtHours(deltaHoursToDate)}`,
      `Tarifgutschrift bisher: ${fmtHours(creditedHoursToDate)} (Feiertag ${fmtHours(creditedHolidayHoursToDate)} + Vorfest ${fmtHours(creditedPreHolidayHoursToDate)})`,
      `Feiertag: gearbeitete Minuten an gesetzlichen Feiertagen (laut Feiertagskalender oder QA-Override)`,
      `Vorfest: gearbeitete Minuten am Tag vor einem Feiertag (z. B. Nachtdienst 21:45–24:00 vor Feiertag)`,
      `W-Tage: bereits abgeschlossene Schichten mit Kommen+Gehen; offene/unvollständige Schichten zählen noch nicht`,
      `Gleitzeit angerechnet (Regel): ${fmtHours(creditedFlexHoursToDate)}`,
      `Gesamtdelta inkl. Tarif: ${fmtHours(totalDeltaWithCreditsToDate)}`,
    ],
  };
}

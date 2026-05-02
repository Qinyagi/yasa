import type { ShiftType, UserShiftPlan } from '../types';
import { getHolidayMap } from '../data/holidays';
import { shiftCodeAtDate } from './shiftEngine';
import type { TimeClockQaDateType } from './storage';

export interface ComputeWDayRangeInput {
  plan: UserShiftPlan | null;
  fromISO: string;
  toISO: string;
  qaDateOverrides?: Record<string, TimeClockQaDateType>;
  wEnabled?: boolean;
}

export interface WDayRangeResult {
  totalWDays: number;
  dateISOs: string[];
}

function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

function weekdayIndexMondayFirst(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  return weekday === 0 ? 6 : weekday - 1;
}

function isWeekdayHoliday(
  dateISO: string,
  holidayMap: Record<string, { date: string; name: string }>,
  qaDateOverrides?: Record<string, TimeClockQaDateType>
): boolean {
  const overrideType = qaDateOverrides?.[dateISO];
  const isHolidayDate =
    overrideType === 'holiday' ||
    (overrideType !== 'preholiday' && !!holidayMap[dateISO]);
  const weekday = weekdayIndexMondayFirst(dateISO);
  return isHolidayDate && weekday >= 0 && weekday <= 4;
}

function resolvePlannedCode(plan: UserShiftPlan, dateISO: string): ShiftType | null {
  const entry = plan.entries.find((item) => item.dateISO === dateISO);
  if (entry) return entry.code;
  return shiftCodeAtDate(plan.startDateISO, plan.pattern, dateISO);
}

export function computeWDaysForRange(input: ComputeWDayRangeInput): WDayRangeResult {
  if (!input.plan || input.wEnabled === false) {
    return { totalWDays: 0, dateISOs: [] };
  }

  const holidayMap = collectHolidayMap(input.fromISO, input.toISO);
  const hits: string[] = [];
  const [fromY, fromM, fromD] = input.fromISO.split('-').map(Number);
  const [toY, toM, toD] = input.toISO.split('-').map(Number);
  const cursor = new Date(fromY, fromM - 1, fromD);
  const end = new Date(toY, toM - 1, toD);

  while (cursor.getTime() <= end.getTime()) {
    const dateISO = formatDateISO(cursor);
    const plannedCode = resolvePlannedCode(input.plan, dateISO);
    if (plannedCode === 'R' && isWeekdayHoliday(dateISO, holidayMap, input.qaDateOverrides)) {
      hits.push(dateISO);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    totalWDays: hits.length,
    dateISOs: hits,
  };
}

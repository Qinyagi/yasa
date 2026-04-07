import type { ShiftType, UserShiftPlan, UserTimeClockConfig } from '../types';
import { getHolidayMap } from '../data/holidays';
import { shiftCodeAtDate } from './shiftEngine';
import type { VacationStrategy } from './strategyTypes';

interface BuildVacationStrategiesInput {
  shiftPlan: UserShiftPlan;
  vacationDays: string[];
  overrides: Record<string, ShiftType>;
  timeClockConfig: UserTimeClockConfig;
  now?: Date;
}

function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysISO(baseISO: string, days: number): string {
  const [y, m, d] = baseISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return formatDateISO(date);
}

function combine<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  function walk(start: number, acc: T[]) {
    if (acc.length === size) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]);
      walk(i + 1, acc);
      acc.pop();
    }
  }
  walk(0, []);
  return out;
}

export function resolveOriginalShiftCodeForDate(plan: UserShiftPlan | null, dateISO: string): ShiftType | null {
  if (!plan) return null;
  const entryMap = new Map(plan.entries.map((e) => [e.dateISO, e.code]));
  if (entryMap.has(dateISO)) return entryMap.get(dateISO) ?? null;
  if (plan.pattern.length === 0 || dateISO < plan.startDateISO) return null;
  return shiftCodeAtDate(plan.startDateISO, plan.pattern, dateISO);
}

export function buildVacationStrategies(input: BuildVacationStrategiesInput): VacationStrategy[] {
  const { shiftPlan, vacationDays, overrides, timeClockConfig } = input;
  const existingVacation = new Set(vacationDays);
  const entryMap = new Map(shiftPlan.entries.map((e) => [e.dateISO, e.code]));
  const now = input.now ?? new Date();
  const fromISO = formatDateISO(now);
  const toDate = new Date(now);
  toDate.setDate(toDate.getDate() + 365);
  const toISO = formatDateISO(toDate);

  const allHolidays = {} as Record<string, ReturnType<typeof getHolidayMap>[string]>;
  for (let y = now.getFullYear(); y <= toDate.getFullYear(); y++) {
    Object.assign(allHolidays, getHolidayMap(y));
  }

  const holidayDates = Object.keys(allHolidays)
    .filter((d) => d >= fromISO && d <= toISO)
    .sort();

  const WORK_CODES = new Set<ShiftType>(['F', 'S', 'N', 'T', 'KS', 'KN', 'K']);
  const OFF_CODES = new Set<ShiftType>(['R', 'X', 'U']);
  const holidayDateSet = new Set(Object.keys(allHolidays));

  function isWeekendISO(dateISO: string): boolean {
    const [y, m, d] = dateISO.split('-').map(Number);
    const day = new Date(y, m - 1, d).getDay();
    return day === 0 || day === 6;
  }

  function getPlannedCode(dateISO: string): ShiftType | null {
    if (entryMap.has(dateISO)) return entryMap.get(dateISO) ?? null;
    if (shiftPlan.pattern.length === 0 || dateISO < shiftPlan.startDateISO) return null;
    return shiftCodeAtDate(shiftPlan.startDateISO, shiftPlan.pattern, dateISO);
  }

  function getEffectiveCode(dateISO: string, extraVacation: Set<string>): ShiftType | null {
    if (extraVacation.has(dateISO) || existingVacation.has(dateISO)) return 'U';
    if (overrides[dateISO]) return overrides[dateISO];
    return getPlannedCode(dateISO);
  }

  function isOffByCode(code: ShiftType | null): boolean {
    return code !== null && OFF_CODES.has(code);
  }

  function isWorkByCode(code: ShiftType | null): boolean {
    return code !== null && WORK_CODES.has(code);
  }

  function isLikelyShiftModel(): boolean {
    if (shiftPlan.pattern.length === 0) return false;
    const horizon = Math.max(shiftPlan.pattern.length, 28);
    for (let i = 0; i < horizon; i++) {
      const date = addDaysISO(shiftPlan.startDateISO, i);
      const code = shiftCodeAtDate(shiftPlan.startDateISO, shiftPlan.pattern, date);
      if (!isWorkByCode(code)) continue;
      const [y, m, d] = date.split('-').map(Number);
      const weekday = new Date(y, m - 1, d).getDay();
      if (weekday === 0 || weekday === 6) return true;
    }
    return false;
  }

  const shiftModel = isLikelyShiftModel();

  function isEffectivelyOff(dateISO: string, extraVacation: Set<string>): boolean {
    const code = getEffectiveCode(dateISO, extraVacation);
    if (isOffByCode(code)) return true;
    if (!shiftModel && (isWeekendISO(dateISO) || holidayDateSet.has(dateISO))) return true;
    return false;
  }

  function getSpanAround(holidayDateISO: string, extraVacation: Set<string>): number {
    if (!isEffectivelyOff(holidayDateISO, extraVacation)) return 0;
    let start = holidayDateISO;
    let end = holidayDateISO;

    while (true) {
      const prev = addDaysISO(start, -1);
      if (!isEffectivelyOff(prev, extraVacation)) break;
      start = prev;
    }
    while (true) {
      const next = addDaysISO(end, 1);
      if (!isEffectivelyOff(next, extraVacation)) break;
      end = next;
    }

    let count = 1;
    let cursor = start;
    while (cursor < end) {
      cursor = addDaysISO(cursor, 1);
      count++;
    }
    return count;
  }

  function minutesForShiftCode(code: ShiftType | null): number {
    if (code !== 'KS' && code !== 'KN') return 0;
    const window = timeClockConfig.shiftSettings[code];
    const [startH, startM] = window.startTime.split(':').map(Number);
    const [endH, endM] = window.endTime.split(':').map(Number);
    const start = (Number.isFinite(startH) ? startH : 0) * 60 + (Number.isFinite(startM) ? startM : 0);
    let end = (Number.isFinite(endH) ? endH : 0) * 60 + (Number.isFinite(endM) ? endM : 0);
    if (end <= start) end += 24 * 60;
    return end - start;
  }

  const bestByKey = new Map<string, VacationStrategy>();
  const SCAN_OFFSETS = [-3, -2, -1, 0, 1, 2, 3];

  for (const holidayDateISO of holidayDates) {
    const holiday = allHolidays[holidayDateISO];
    if (!holiday) continue;

    const pool = SCAN_OFFSETS
      .map((off) => addDaysISO(holidayDateISO, off))
      .filter((d) => d >= fromISO && d <= toISO)
      .filter((d, idx, arr) => arr.indexOf(d) === idx)
      .filter((d) => {
        if (existingVacation.has(d)) return false;
        return !isEffectivelyOff(d, new Set<string>());
      });

    const maxPick = Math.min(3, pool.length);
    for (let pick = 1; pick <= maxPick; pick++) {
      const combos = combine(pool, pick);
      for (const combo of combos) {
        const extraVacation = new Set(combo);
        const freieTage = getSpanAround(holidayDateISO, extraVacation);
        if (freieTage < combo.length + 1) continue;

        const urlaubstage = [...combo].sort();
        const key = `${holidayDateISO}|${urlaubstage.join(',')}`;
        const existing = bestByKey.get(key);
        const strategyCodes = urlaubstage.map((d) => getEffectiveCode(d, new Set<string>()));
        const requiresShortShiftRequest = strategyCodes.some((c) => c === 'KS' || c === 'KN');
        const candidate: VacationStrategy = {
          urlaubstage,
          freieTage,
          feiertag: holiday,
          strategyType: 'vacation',
          requiresShortShiftRequest,
        };
        if (!existing || candidate.freieTage > existing.freieTage) {
          bestByKey.set(key, candidate);
        }
      }
    }
  }

  const baseStrategies = Array.from(bestByKey.values()).sort((a, b) => {
    if (a.urlaubstage.length !== b.urlaubstage.length) {
      return a.urlaubstage.length - b.urlaubstage.length;
    }
    return b.freieTage - a.freieTage;
  });

  const hourStrategies: VacationStrategy[] = [];
  for (const strategy of baseStrategies) {
    const dayCodes = strategy.urlaubstage.map((d) => getEffectiveCode(d, new Set<string>()));
    const allShortShift = dayCodes.length > 0 && dayCodes.every((c) => c === 'KS' || c === 'KN');
    if (!allShortShift) continue;

    const requiredMinutes = dayCodes.reduce((sum, code) => sum + minutesForShiftCode(code), 0);
    if (requiredMinutes <= 0) continue;

    hourStrategies.push({
      ...strategy,
      strategyType: 'hours',
      requiredHours: Math.round((requiredMinutes / 60) * 100) / 100,
      requiresShortShiftRequest: strategy.requiresShortShiftRequest,
    });
  }

  return [...baseStrategies, ...hourStrategies];
}


/**
 * YASA – Feiertage (bundesweit, DE)
 * Offline, ohne API-Abhängigkeit.
 *
 * Enthält nur bundesweite gesetzliche Feiertage.
 */

export interface Holiday {
  date: string;
  name: string;
}

function padTwo(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

function toISO(date: Date): string {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Gaußscher Oster-Algorithmus (gregorianischer Kalender)
function computeEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function computeHolidaysForYear(year: number): Holiday[] {
  const easter = computeEasterSunday(year);
  const holidays: Holiday[] = [
    { date: `${year}-01-01`, name: 'Neujahr' },
    { date: toISO(addDays(easter, -2)), name: 'Karfreitag' },
    { date: toISO(addDays(easter, 1)), name: 'Ostermontag' },
    { date: `${year}-05-01`, name: 'Tag der Arbeit' },
    { date: toISO(addDays(easter, 39)), name: 'Christi Himmelfahrt' },
    { date: toISO(addDays(easter, 50)), name: 'Pfingstmontag' },
    { date: `${year}-10-03`, name: 'Tag der Deutschen Einheit' },
    { date: `${year}-12-25`, name: '1. Weihnachtsfeiertag' },
    { date: `${year}-12-26`, name: '2. Weihnachtsfeiertag' },
  ];
  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

const cache: Record<number, Holiday[]> = {};

export function getHolidaysForYear(year: number): Holiday[] {
  if (!cache[year]) cache[year] = computeHolidaysForYear(year);
  return cache[year];
}

export function isHoliday(dateISO: string): Holiday | null {
  const year = Number(dateISO.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  const holiday = getHolidaysForYear(year).find((item) => item.date === dateISO);
  return holiday ?? null;
}

export function getHolidayMap(year: number): Record<string, Holiday> {
  const map: Record<string, Holiday> = {};
  for (const holiday of getHolidaysForYear(year)) {
    map[holiday.date] = holiday;
  }
  return map;
}


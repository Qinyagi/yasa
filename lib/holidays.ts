/**
 * YASA – Offline-Feiertagsdaten (bundesweit, DE)
 * Keine API, keine PII, DSGVO-safe.
 *
 * Enthält alle bundesweiten gesetzlichen Feiertage für 2025–2027.
 * Osterabhängige Feiertage werden per Gauss-Algorithmus berechnet.
 */

export interface Holiday {
  date: string;   // "YYYY-MM-DD"
  name: string;
}

// ─── Gauss'scher Oster-Algorithmus ──────────────────────────────────────────

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
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = März, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

// ─── Feiertage für ein Jahr berechnen ────────────────────────────────────────

function computeHolidaysForYear(year: number): Holiday[] {
  const easter = computeEasterSunday(year);

  const holidays: Holiday[] = [
    // Feste Feiertage
    { date: `${year}-01-01`, name: 'Neujahr' },
    { date: `${year}-05-01`, name: 'Tag der Arbeit' },
    { date: `${year}-10-03`, name: 'Tag der Deutschen Einheit' },
    { date: `${year}-12-25`, name: '1. Weihnachtsfeiertag' },
    { date: `${year}-12-26`, name: '2. Weihnachtsfeiertag' },

    // Osterabhängige Feiertage
    { date: toISO(addDays(easter, -2)), name: 'Karfreitag' },
    { date: toISO(easter), name: 'Ostersonntag' },
    { date: toISO(addDays(easter, 1)), name: 'Ostermontag' },
    { date: toISO(addDays(easter, 39)), name: 'Christi Himmelfahrt' },
    { date: toISO(addDays(easter, 49)), name: 'Pfingstsonntag' },
    { date: toISO(addDays(easter, 50)), name: 'Pfingstmontag' },
  ];

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const _cache: Record<number, Holiday[]> = {};

/**
 * Gibt alle bundesweiten Feiertage für ein Jahr zurück.
 * Ergebnis wird gecacht (synchron).
 */
export function getHolidaysForYear(year: number): Holiday[] {
  if (!_cache[year]) {
    _cache[year] = computeHolidaysForYear(year);
  }
  return _cache[year];
}

/**
 * Prüft ob ein Datum ein bundesweiter Feiertag ist.
 * Gibt den Feiertagsnamen oder null zurück.
 */
export function getHolidayName(dateISO: string): string | null {
  const year = parseInt(dateISO.substring(0, 4), 10);
  const holidays = getHolidaysForYear(year);
  const found = holidays.find((h) => h.date === dateISO);
  return found?.name ?? null;
}

/**
 * Gibt eine Map dateISO → name für einen Jahresbereich zurück.
 * Nützlich für schnellen Lookup im Kalender.
 */
export function getHolidayMap(fromYear: number, toYear: number): Record<string, string> {
  const map: Record<string, string> = {};
  for (let y = fromYear; y <= toYear; y++) {
    for (const h of getHolidaysForYear(y)) {
      map[h.date] = h.name;
    }
  }
  return map;
}

/**
 * Prüft ob ein Datum ein Samstag (6) oder Sonntag (0) ist.
 */
export function isWeekend(dateISO: string): boolean {
  const [y, m, d] = dateISO.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
}

/**
 * Gibt den Wochentag zurück (0=So, 1=Mo, ..., 6=Sa).
 */
export function getWeekday(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

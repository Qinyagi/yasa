/**
 * Holidays - Deutsche Feiertage (bundESWEIT, offline)
 * 
 * Stand: 2026-2027
 * Quelle: Allgemeine deutsche Feiertage (bundesweit)
 * 
 * Format: { date: "YYYY-MM-DD", name: string }
 */

export interface Holiday {
  date: string;    // ISO-Datum "YYYY-MM-DD"
  name: string;    // Name des Feiertags
}

/**
 * Deutsche Feiertage 2026 (bundesweit)
 */
export const HOLIDAYS_2026: Holiday[] = [
  { date: "2026-01-01", name: "Neujahr" },
  { date: "2026-01-06", name: "Heilige Drei Könige" },
  { date: "2026-02-14", name: "Valentinstag" },  // Kein Feiertag, aber markiert
  { date: "2026-04-03", name: "Karfreitag" },
  { date: "2026-04-06", name: "Ostermontag" },
  { date: "2026-05-01", name: "Tag der Arbeit" },
  { date: "2026-05-09", name: "Christi Himmelfahrt" },
  { date: "2026-05-20", name: "Pfingstmontag" },
  { date: "2026-10-03", name: "Tag der Deutschen Einheit" },
  { date: "2026-12-25", name: "Weihnachten" },
  { date: "2026-12-26", name: "Zweiter Weihnachtsfeiertag" },
  { date: "2026-12-31", name: "Silvester" },  // Kein Feiertag, aber markiert
];

/**
 * Deutsche Feiertage 2027 (bundesweit)
 */
export const HOLIDAYS_2027: Holiday[] = [
  { date: "2027-01-01", name: "Neujahr" },
  { date: "2027-01-06", name: "Heilige Drei Könige" },
  { date: "2027-02-14", name: "Valentinstag" },
  { date: "2027-03-26", name: "Karfreitag" },
  { date: "2027-03-29", name: "Ostermontag" },
  { date: "2027-05-01", name: "Tag der Arbeit" },
  { date: "2027-05-20", name: "Christi Himmelfahrt" },
  { date: "2027-05-31", name: "Pfingstmontag" },
  { date: "2027-10-03", name: "Tag der Deutschen Einheit" },
  { date: "2027-12-25", name: "Weihnachten" },
  { date: "2027-12-26", name: "Zweiter Weihnachtsfeiertag" },
  { date: "2027-12-31", name: "Silvester" },
];

/**
 * Alle Feiertage als Map für schnellen Lookup
 */
export function getHolidaysForYear(year: number): Holiday[] {
  switch (year) {
    case 2026:
      return HOLIDAYS_2026;
    case 2027:
      return HOLIDAYS_2027;
    default:
      return [];
  }
}

/**
 * Prüft, ob ein Datum ein Feiertag ist
 */
export function isHoliday(dateISO: string): Holiday | null {
  const [yearStr] = dateISO.split("-");
  const year = parseInt(yearStr, 10);
  const holidays = getHolidaysForYear(year);
  return holidays.find(h => h.date === dateISO) || null;
}

/**
 * Feiertag-Map für schnellen Lookup nach Datum
 */
export function getHolidayMap(year: number): Record<string, Holiday> {
  const holidays = getHolidaysForYear(year);
  const map: Record<string, Holiday> = {};
  for (const h of holidays) {
    map[h.date] = h;
  }
  return map;
}

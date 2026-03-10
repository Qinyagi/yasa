/**
 * YASA Schulferien-Daten (offline, kein API-Fetch)
 *
 * Struktur: Bundesland → Jahr → Array von Ferienzeiträumen
 * Quelle: Öffentlich zugängliche KMK-Ferienregelung / Kultusministerkonferenz
 * Stand: 2026–2027, ausgewählte Bundesländer
 *
 * Erweiterbarkeit: Weitere Bundesländer analog unten ergänzen.
 * Wenn ein Bundesland noch nicht hinterlegt ist, gibt getSchoolHolidayMap()
 * null zurück → UI kann „noch nicht hinterlegt" anzeigen.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchoolHolidayPeriod {
  name: string;      // z.B. "Sommerferien", "Weihnachtsferien"
  start: string;     // ISO "YYYY-MM-DD"
  end: string;       // ISO "YYYY-MM-DD" (inklusiv)
}

export interface SchoolHolidayYear {
  year: number;
  periods: SchoolHolidayPeriod[];
}

// ─── Bundesland-Kenner ────────────────────────────────────────────────────────

/** Bundesland-Kürzel (ISO 3166-2:DE) */
export type Bundesland =
  | 'BW'  // Baden-Württemberg
  | 'BY'  // Bayern
  | 'BE'  // Berlin
  | 'BB'  // Brandenburg
  | 'HB'  // Bremen
  | 'HH'  // Hamburg
  | 'HE'  // Hessen
  | 'MV'  // Mecklenburg-Vorpommern
  | 'NI'  // Niedersachsen
  | 'NW'  // Nordrhein-Westfalen
  | 'RP'  // Rheinland-Pfalz
  | 'SL'  // Saarland
  | 'SN'  // Sachsen
  | 'ST'  // Sachsen-Anhalt
  | 'SH'  // Schleswig-Holstein
  | 'TH'; // Thüringen

export const BUNDESLAND_LABELS: Record<Bundesland, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};

// ─── Daten: Nordrhein-Westfalen ───────────────────────────────────────────────

const NW_2026: SchoolHolidayYear = {
  year: 2026,
  periods: [
    { name: 'Winterferien',      start: '2026-02-16', end: '2026-02-20' },
    { name: 'Osterferien',       start: '2026-03-30', end: '2026-04-11' },
    { name: 'Pfingstferien',     start: '2026-05-26', end: '2026-06-06' },
    { name: 'Sommerferien',      start: '2026-06-29', end: '2026-08-11' },
    { name: 'Herbstferien',      start: '2026-10-05', end: '2026-10-17' },
    { name: 'Weihnachtsferien',  start: '2026-12-23', end: '2027-01-06' },
  ],
};

const NW_2027: SchoolHolidayYear = {
  year: 2027,
  periods: [
    { name: 'Winterferien',      start: '2027-02-15', end: '2027-02-19' },
    { name: 'Osterferien',       start: '2027-03-29', end: '2027-04-10' },
    { name: 'Pfingstferien',     start: '2027-05-25', end: '2027-06-05' },
    { name: 'Sommerferien',      start: '2027-06-28', end: '2027-08-10' },
    { name: 'Herbstferien',      start: '2027-10-04', end: '2027-10-16' },
    { name: 'Weihnachtsferien',  start: '2027-12-22', end: '2028-01-05' },
  ],
};

// ─── Daten: Bayern ────────────────────────────────────────────────────────────

const BY_2026: SchoolHolidayYear = {
  year: 2026,
  periods: [
    { name: 'Winterferien',      start: '2026-02-21', end: '2026-02-28' },
    { name: 'Osterferien',       start: '2026-04-09', end: '2026-04-22' },
    { name: 'Pfingstferien',     start: '2026-05-29', end: '2026-06-10' },
    { name: 'Sommerferien',      start: '2026-08-03', end: '2026-09-14' },
    { name: 'Herbstferien',      start: '2026-10-31', end: '2026-11-07' },
    { name: 'Weihnachtsferien',  start: '2026-12-23', end: '2027-01-05' },
  ],
};

const BY_2027: SchoolHolidayYear = {
  year: 2027,
  periods: [
    { name: 'Winterferien',      start: '2027-02-13', end: '2027-02-20' },
    { name: 'Osterferien',       start: '2027-03-27', end: '2027-04-10' },
    { name: 'Pfingstferien',     start: '2027-05-22', end: '2027-06-03' },
    { name: 'Sommerferien',      start: '2027-08-02', end: '2027-09-13' },
    { name: 'Herbstferien',      start: '2027-10-30', end: '2027-11-06' },
    { name: 'Weihnachtsferien',  start: '2027-12-22', end: '2028-01-04' },
  ],
};

// ─── Daten: Baden-Württemberg ─────────────────────────────────────────────────

const BW_2026: SchoolHolidayYear = {
  year: 2026,
  periods: [
    { name: 'Osterferien',       start: '2026-04-07', end: '2026-04-18' },
    { name: 'Pfingstferien',     start: '2026-06-06', end: '2026-06-19' },
    { name: 'Sommerferien',      start: '2026-07-30', end: '2026-09-12' },
    { name: 'Herbstferien',      start: '2026-10-26', end: '2026-10-30' },
    { name: 'Weihnachtsferien',  start: '2026-12-23', end: '2027-01-08' },
  ],
};

const BW_2027: SchoolHolidayYear = {
  year: 2027,
  periods: [
    { name: 'Osterferien',       start: '2027-04-06', end: '2027-04-17' },
    { name: 'Pfingstferien',     start: '2027-06-05', end: '2027-06-18' },
    { name: 'Sommerferien',      start: '2027-07-29', end: '2027-09-11' },
    { name: 'Herbstferien',      start: '2027-10-25', end: '2027-10-29' },
    { name: 'Weihnachtsferien',  start: '2027-12-22', end: '2028-01-07' },
  ],
};

// ─── Daten: Berlin ────────────────────────────────────────────────────────────

const BE_2026: SchoolHolidayYear = {
  year: 2026,
  periods: [
    { name: 'Winterferien',      start: '2026-02-02', end: '2026-02-06' },
    { name: 'Osterferien',       start: '2026-04-02', end: '2026-04-14' },
    { name: 'Pfingstferien',     start: '2026-05-29', end: '2026-06-06' },
    { name: 'Sommerferien',      start: '2026-06-25', end: '2026-08-07' },
    { name: 'Herbstferien',      start: '2026-10-19', end: '2026-10-30' },
    { name: 'Weihnachtsferien',  start: '2026-12-21', end: '2027-01-02' },
  ],
};

const BE_2027: SchoolHolidayYear = {
  year: 2027,
  periods: [
    { name: 'Winterferien',      start: '2027-02-01', end: '2027-02-05' },
    { name: 'Osterferien',       start: '2027-03-29', end: '2027-04-10' },
    { name: 'Pfingstferien',     start: '2027-05-22', end: '2027-05-29' },
    { name: 'Sommerferien',      start: '2027-06-24', end: '2027-08-06' },
    { name: 'Herbstferien',      start: '2027-10-18', end: '2027-10-29' },
    { name: 'Weihnachtsferien',  start: '2027-12-20', end: '2028-01-01' },
  ],
};

// ─── Daten: Hessen ────────────────────────────────────────────────────────────

const HE_2026: SchoolHolidayYear = {
  year: 2026,
  periods: [
    { name: 'Osterferien',       start: '2026-04-09', end: '2026-04-21' },
    { name: 'Sommerferien',      start: '2026-07-20', end: '2026-08-29' },
    { name: 'Herbstferien',      start: '2026-10-19', end: '2026-10-30' },
    { name: 'Weihnachtsferien',  start: '2026-12-21', end: '2027-01-09' },
  ],
};

const HE_2027: SchoolHolidayYear = {
  year: 2027,
  periods: [
    { name: 'Osterferien',       start: '2027-03-29', end: '2027-04-10' },
    { name: 'Sommerferien',      start: '2027-07-19', end: '2027-08-28' },
    { name: 'Herbstferien',      start: '2027-10-18', end: '2027-10-29' },
    { name: 'Weihnachtsferien',  start: '2027-12-20', end: '2028-01-08' },
  ],
};

// ─── Master-Datenbank ─────────────────────────────────────────────────────────

/** Welche Bundesländer aktuell mit Daten hinterlegt sind */
export const SUPPORTED_BUNDESLAENDER: readonly Bundesland[] = [
  'NW', 'BY', 'BW', 'BE', 'HE',
] as const;

type BundeslandYearData = Partial<Record<Bundesland, Record<number, SchoolHolidayYear>>>;

const SCHOOL_HOLIDAYS_DB: BundeslandYearData = {
  NW: { 2026: NW_2026, 2027: NW_2027 },
  BY: { 2026: BY_2026, 2027: BY_2027 },
  BW: { 2026: BW_2026, 2027: BW_2027 },
  BE: { 2026: BE_2026, 2027: BE_2027 },
  HE: { 2026: HE_2026, 2027: HE_2027 },
};

// ─── API ──────────────────────────────────────────────────────────────────────

/**
 * Gibt alle Schulferientage eines Bundeslands und Jahres als ISO-Date-Set zurück.
 * Gibt `null` zurück, wenn das Bundesland noch nicht hinterlegt ist.
 * Gibt `{}` zurück, wenn das Bundesland hinterlegt ist, aber das Jahr fehlt.
 */
export function getSchoolHolidayMap(
  bundesland: string,
  year: number,
): Record<string, SchoolHolidayPeriod> | null {
  const bl = bundesland as Bundesland;
  const blData = SCHOOL_HOLIDAYS_DB[bl];
  if (!blData) return null; // Bundesland nicht hinterlegt

  const yearData = blData[year];
  if (!yearData) return {}; // Jahr nicht hinterlegt → leere Map

  const result: Record<string, SchoolHolidayPeriod> = {};
  for (const period of yearData.periods) {
    const start = new Date(period.start + 'T00:00:00Z');
    const end   = new Date(period.end   + 'T00:00:00Z');
    const cur   = new Date(start);
    while (cur <= end) {
      const iso = cur.toISOString().slice(0, 10);
      result[iso] = period;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  return result;
}

/**
 * Gibt Schulferientage für mehrere Jahre zurück (zusammengeführt).
 * Gibt `null` zurück, wenn das Bundesland nicht hinterlegt ist.
 */
export function getSchoolHolidayMapForRange(
  bundesland: string,
  fromYear: number,
  toYear: number,
): Record<string, SchoolHolidayPeriod> | null {
  const bl = bundesland as Bundesland;
  if (!SCHOOL_HOLIDAYS_DB[bl]) return null;

  const result: Record<string, SchoolHolidayPeriod> = {};
  for (let y = fromYear; y <= toYear; y++) {
    const yearMap = getSchoolHolidayMap(bundesland, y);
    if (yearMap) {
      Object.assign(result, yearMap);
    }
  }
  return result;
}

/** Prüft ob ein Bundesland-Kürzel in der Datenbank hinterlegt ist. */
export function isBundeslandSupported(bundesland: string): boolean {
  return (SUPPORTED_BUNDESLAENDER as readonly string[]).includes(bundesland);
}

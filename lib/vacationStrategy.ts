/**
 * YASA – Brückentag-Strategieberechnung (offline)
 *
 * Scannt Feiertage und findet Kombinationen, bei denen 1–3 Urlaubstage
 * zu 4+ zusammenhängenden freien Tagen führen.
 */

import { getHolidaysForYear, isWeekend, getWeekday } from './holidays';
import type { Holiday } from './holidays';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VacationSuggestion {
  /** Eindeutige ID für React keys */
  id: string;
  /** Erster Tag des freien Zeitraums (inkl. WE/Feiertage) */
  startDate: string;
  /** Letzter Tag des freien Zeitraums */
  endDate: string;
  /** Alle Tage die als Urlaub genommen werden müssen (Arbeitstage, keine Feiertage/WE) */
  vacationDays: string[];
  /** Anzahl Urlaubstage benötigt */
  vacationCount: number;
  /** Gesamtzahl freie Tage (WE + Feiertage + Urlaub) */
  freeDays: number;
  /** Effizienz: freeDays / vacationCount */
  efficiency: number;
  /** Name des auslösenden Feiertags */
  holidayName: string;
  /** Datum des auslösenden Feiertags */
  holidayDate: string;
  /** Menschenlesbarer Zeitraum */
  periodLabel: string;
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDaysToISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toISO(date);
}

function formatGerman(dateISO: string): string {
  const [, m, d] = dateISO.split('-');
  const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  return `${parseInt(d, 10)}. ${MONTH_SHORT[parseInt(m, 10) - 1]}`;
}

/**
 * Prüft ob ein Datum ein Feiertag ist (schneller Set-Check).
 */
function isHoliday(dateISO: string, holidaySet: Set<string>): boolean {
  return holidaySet.has(dateISO);
}

/**
 * Prüft ob ein Tag "frei" ist (Wochenende oder Feiertag).
 */
function isFreeDay(dateISO: string, holidaySet: Set<string>): boolean {
  return isWeekend(dateISO) || isHoliday(dateISO, holidaySet);
}

/**
 * Erweitert einen Zeitraum nach links/rechts um freie Tage (WE/Feiertage).
 * Gibt [startDate, endDate] zurück.
 */
function expandFreePeriod(
  centerDates: string[],
  holidaySet: Set<string>
): { start: string; end: string; allDays: string[] } {
  if (centerDates.length === 0) return { start: '', end: '', allDays: [] };

  const sorted = [...centerDates].sort();
  let start = sorted[0];
  let end = sorted[sorted.length - 1];

  // Nach links expandieren
  let prev = addDaysToISO(start, -1);
  while (isFreeDay(prev, holidaySet)) {
    start = prev;
    prev = addDaysToISO(start, -1);
  }

  // Nach rechts expandieren
  let next = addDaysToISO(end, 1);
  while (isFreeDay(next, holidaySet)) {
    end = next;
    next = addDaysToISO(end, 1);
  }

  // Alle Tage im Bereich sammeln
  const allDays: string[] = [];
  let current = start;
  while (current <= end) {
    allDays.push(current);
    current = addDaysToISO(current, 1);
  }

  return { start, end, allDays };
}

// ─── Strategie-Engine ────────────────────────────────────────────────────────

/**
 * Berechnet Brückentag-Vorschläge für die nächsten 12 Monate.
 *
 * Logik:
 * - Feiertag auf Di → Mo Urlaub → 4 Tage frei (Sa–Di)
 * - Feiertag auf Do → Fr Urlaub → 4 Tage frei (Do–So)
 * - Feiertag auf Mi → Mo+Di oder Do+Fr Urlaub → 5 Tage frei
 * - Feiertag auf Mo → verlängertes WE (Fr oder kein extra Urlaub)
 * - Feiertag auf Fr → verlängertes WE (Mo oder kein extra Urlaub)
 * - Zwei nahe Feiertage → Kombinationsvorschläge
 *
 * @param fromDateISO Start-Datum (normalerweise heute)
 * @param existingVacation Bereits geplante Urlaubstage (werden ausgeschlossen)
 */
export function computeVacationSuggestions(
  fromDateISO: string,
  existingVacation: string[] = []
): VacationSuggestion[] {
  const fromYear = parseInt(fromDateISO.substring(0, 4), 10);
  const toDateISO = addDaysToISO(fromDateISO, 365);
  const toYear = parseInt(toDateISO.substring(0, 4), 10);

  // Alle Feiertage im Zeitraum
  const allHolidays: Holiday[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    allHolidays.push(...getHolidaysForYear(y));
  }
  const relevantHolidays = allHolidays.filter(
    (h) => h.date >= fromDateISO && h.date <= toDateISO
  );

  const holidaySet = new Set(allHolidays.map((h) => h.date));
  const existingSet = new Set(existingVacation);
  const suggestions: VacationSuggestion[] = [];
  const seenIds = new Set<string>();

  for (const holiday of relevantHolidays) {
    const weekday = getWeekday(holiday.date); // 0=So, 1=Mo, ..., 6=Sa

    // Überspringe Feiertage die bereits am Wochenende liegen
    if (weekday === 0 || weekday === 6) continue;

    const scenarios: { vacDays: string[]; label: string }[] = [];

    switch (weekday) {
      case 1: // Montag → Fr davor = 4 Tage frei (Fr–Mo)
        scenarios.push({
          vacDays: [addDaysToISO(holiday.date, -3)], // Freitag
          label: 'Freitag vor Feiertag',
        });
        break;

      case 2: // Dienstag → Mo = 4 Tage frei (Sa–Di)
        scenarios.push({
          vacDays: [addDaysToISO(holiday.date, -1)], // Montag
          label: 'Montag vor Feiertag',
        });
        // Mo+Fr davor = noch mehr frei
        break;

      case 3: // Mittwoch → Mo+Di = 5 Tage frei (Sa–Mi) oder Do+Fr = 5 Tage frei (Mi–So)
        scenarios.push({
          vacDays: [addDaysToISO(holiday.date, -2), addDaysToISO(holiday.date, -1)],
          label: 'Mo+Di vor Feiertag',
        });
        scenarios.push({
          vacDays: [addDaysToISO(holiday.date, 1), addDaysToISO(holiday.date, 2)],
          label: 'Do+Fr nach Feiertag',
        });
        break;

      case 4: // Donnerstag → Fr = 4 Tage frei (Do–So)
        scenarios.push({
          vacDays: [addDaysToISO(holiday.date, 1)], // Freitag
          label: 'Freitag nach Feiertag',
        });
        break;

      case 5: // Freitag → Mo danach = 4 Tage frei (Fr–Mo)
        scenarios.push({
          vacDays: [addDaysToISO(holiday.date, 3)], // Montag
          label: 'Montag nach Feiertag',
        });
        break;
    }

    for (const scenario of scenarios) {
      // Filtere Urlaubstage die selbst Feiertage/WE sind oder schon geplant
      const actualVacDays = scenario.vacDays.filter(
        (d) => !isFreeDay(d, holidaySet) && !existingSet.has(d)
      );

      if (actualVacDays.length === 0) continue; // Kein Urlaubstag nötig (schon frei)

      // Alle "freien" Tage = Feiertag + Urlaubstage + angrenzende WE/Feiertage
      const coreDays = [holiday.date, ...actualVacDays].sort();
      const { start, end, allDays } = expandFreePeriod(coreDays, holidaySet);

      // Markiere alle Urlaubstage im erweiterten Bereich
      const vacInPeriod = allDays.filter(
        (d) => !isFreeDay(d, holidaySet) && !existingSet.has(d)
      );

      const freeDays = allDays.length;
      const vacCount = vacInPeriod.length;

      if (freeDays < 4 || vacCount === 0) continue;

      const id = `${holiday.date}-${start}-${end}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      suggestions.push({
        id,
        startDate: start,
        endDate: end,
        vacationDays: vacInPeriod,
        vacationCount: vacCount,
        freeDays,
        efficiency: freeDays / vacCount,
        holidayName: holiday.name,
        holidayDate: holiday.date,
        periodLabel: `${formatGerman(start)} – ${formatGerman(end)}`,
      });
    }
  }

  // Sortierung: weniger Urlaubstage zuerst, bei Gleichstand mehr freie Tage
  suggestions.sort((a, b) => {
    if (a.vacationCount !== b.vacationCount) return a.vacationCount - b.vacationCount;
    return b.freeDays - a.freeDays;
  });

  return suggestions;
}

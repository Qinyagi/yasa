/**
 * YASA Time Account – Berechnungslogik
 *
 * Alle Ergebnisse sind technische Prognosen auf Basis ausgewählter
 * Regelinformationen. Kein Rechtsanspruch.
 */

import type { UserShiftPlan, ShiftType } from '../types';
import type {
  SpaceRuleProfile,
  UserTimeAccountProfile,
  TimeAccountSummary,
} from '../types/timeAccount';
import type { Holiday } from '../data/holidays';

// ─── Hilfskonstanten ──────────────────────────────────────────────────────────

/** Shift-Codes, die als Arbeitstag gewertet werden */
const WORK_CODES: ReadonlySet<ShiftType> = new Set(['F', 'S', 'N', 'T', 'KS', 'KN']);

/** ISO-Daten der "Vorfesttage" (Heiligabend + Silvester) – statisch */
function isPreHolidayDate(dateISO: string): boolean {
  const mmdd = dateISO.slice(5); // "MM-DD"
  return mmdd === '12-24' || mmdd === '12-31';
}

// ─── summaryVersion ───────────────────────────────────────────────────────────

/**
 * Deterministischer Versions-String aus den Eingaben.
 * Kein kryptographischer Hash – simpler Fingerprint für Änderungserkennung.
 */
export function computeSummaryVersion(
  plan: UserShiftPlan,
  userProfile: UserTimeAccountProfile,
  spaceProfile: SpaceRuleProfile | null,
  fromISO: string,
  toISO: string,
): string {
  const planFp = `${plan.startDateISO}|${plan.pattern.join('')}|${plan.cycleLengthDays}`;
  const userFp = `${userProfile.weeklyHours}|${userProfile.workModel}|${userProfile.openingBalanceHours}`;
  const spaceFp = spaceProfile
    ? `${spaceProfile.bundesland}|${spaceProfile.holidayCredit.enabled}|${spaceProfile.holidayCredit.hoursPerHolidayShift}|${spaceProfile.preHolidayCredit.enabled}|${spaceProfile.preHolidayCredit.hoursPerOccurrence}`
    : 'no-space';
  return `${planFp}::${userFp}::${spaceFp}::${fromISO}::${toISO}`;
}

// ─── Hauptberechnung ──────────────────────────────────────────────────────────

export interface TimeAccountInput {
  plan: UserShiftPlan;
  userProfile: UserTimeAccountProfile;
  spaceProfile: SpaceRuleProfile | null;
  /** HolidayMap: ISO-Date → Holiday (bundesweit, vom Calendar bereits befüllt) */
  holidayMap: Record<string, Holiday>;
  /** Explizit markierte Urlaubstage des Users */
  vacationDaySet: ReadonlySet<string>;
  /** Auswertungszeitraum von (inklusiv) */
  fromISO: string;
  /** Auswertungszeitraum bis (inklusiv) */
  toISO: string;
}

/**
 * Berechnet die Freizeitkonto-Summary aus Plan + Regeln + User-Daten.
 * Gibt null zurück wenn keine ausreichenden Eingaben vorhanden sind.
 */
export function computeTimeAccountSummary(
  input: TimeAccountInput,
): TimeAccountSummary | null {
  const { plan, userProfile, spaceProfile, holidayMap, vacationDaySet, fromISO, toISO } = input;

  if (!plan.entries.length) return null;

  // ── Erzeuge Map der Plan-Einträge im Zeitraum ────────────────────────────
  const entryMap: Record<string, ShiftType> = {};
  for (const entry of plan.entries) {
    if (entry.dateISO >= fromISO && entry.dateISO <= toISO) {
      entryMap[entry.dateISO] = entry.code;
    }
  }

  let vacationDays      = 0;
  let plannedWorkDays   = 0;
  let creditedHours     = 0;

  // ── Iteriere über alle Tage im Zeitraum ──────────────────────────────────
  const cur = new Date(fromISO + 'T00:00:00Z');
  const end = new Date(toISO   + 'T00:00:00Z');

  while (cur <= end) {
    const dateISO = cur.toISOString().slice(0, 10);
    const code    = entryMap[dateISO];
    const isVac   = vacationDaySet.has(dateISO);

    // Urlaubstage zählen (U-Code oder explizit markiert)
    if (isVac || code === 'U') {
      vacationDays++;
    }

    // Arbeitstage zählen
    if (code && WORK_CODES.has(code)) {
      plannedWorkDays++;

      // Feiertagsgutschrift: Arbeitstag fällt auf Feiertag
      if (
        spaceProfile?.holidayCredit.enabled &&
        holidayMap[dateISO]
      ) {
        creditedHours += spaceProfile.holidayCredit.hoursPerHolidayShift;
      }

      // Vorfest-Gutschrift: Arbeitstag an Heiligabend oder Silvester
      if (
        spaceProfile?.preHolidayCredit.enabled &&
        isPreHolidayDate(dateISO)
      ) {
        creditedHours += spaceProfile.preHolidayCredit.hoursPerOccurrence;
      }
    }

    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const openingBalanceHours = userProfile.openingBalanceHours;
  const totalHoursBalance   = openingBalanceHours + creditedHours;

  // dailyHoursEquivalent: weeklyHours / 5 (pragmatisch, MVP)
  const dailyHours        = userProfile.weeklyHours > 0 ? userProfile.weeklyHours / 5 : 7.6;
  const offDaysEquivalent = vacationDays + totalHoursBalance / dailyHours;

  const summaryVersion = computeSummaryVersion(
    plan,
    userProfile,
    spaceProfile,
    fromISO,
    toISO,
  );

  return {
    profileId:            userProfile.profileId,
    spaceId:              spaceProfile?.spaceId ?? null,
    vacationDays,
    plannedWorkDays,
    creditedHours,
    openingBalanceHours,
    totalHoursBalance,
    offDaysEquivalent:    Math.round(offDaysEquivalent * 10) / 10,
    summaryVersion,
    computedAt:           new Date().toISOString(),
  };
}

// ─── Hilfsfunktion: Standardzeitraum ─────────────────────────────────────────

/**
 * Gibt den Standard-Auswertungszeitraum zurück:
 * Jahresanfang bis Jahresende des aktuellen Jahres.
 */
export function defaultTimeRange(): { fromISO: string; toISO: string } {
  const year = new Date().getFullYear();
  return {
    fromISO: `${year}-01-01`,
    toISO:   `${year}-12-31`,
  };
}

/** Gibt zurück ob ausreichend Daten für eine Summary vorhanden sind. */
export function hasSufficientData(
  plan: UserShiftPlan | null,
  userProfile: UserTimeAccountProfile | null,
): boolean {
  if (!plan || !userProfile) return false;
  if (!plan.entries.length) return false;
  if (userProfile.weeklyHours <= 0) return false;
  return true;
}

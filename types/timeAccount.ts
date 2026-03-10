/**
 * YASA Time Account Types
 *
 * Datenmodell für Urlaubs- und Freizeitkonto, Space-Regelprofil und Prognosesummary.
 * Alle Berechnungen sind Prognosen auf Basis ausgewählter Regelinformationen –
 * keine rechtliche Aussage.
 */

// ─── Arbeitsmodell ────────────────────────────────────────────────────────────

export type WorkModel =
  | 'standard'      // Standard-Schichtmodell (Früh/Spät/Nacht)
  | 'day_service'   // Tagesdienst / T-Modell
  | 'jumper'        // Springer / flexibel
  | 'custom';       // Abweichend vom Teamstandard

export const WORK_MODEL_LABELS: Record<WorkModel, string> = {
  standard:    'Standard-Schichtmodell',
  day_service: 'Tagesdienst / T-Modell',
  jumper:      'Springer / flexibel',
  custom:      'Abweichend vom Teamstandard',
};

// ─── Space-Regelprofil ────────────────────────────────────────────────────────

/**
 * Spaceweites Regelkonfigurations-Profil.
 * Nur Owner/Admin dürfen diese Daten pflegen.
 * Wird unter yasa.timeAccountSpaceRules.v1 gespeichert (Map spaceId → Profil).
 */
export interface SpaceRuleProfile {
  spaceId: string;
  bundesland: string;
  branche: string;
  ruleProfileName: string;
  /** Kurz-Label für die Regelquelle, z.B. „TVöD § 6 Abs. 3" */
  sourceLabel: string;
  /** Optional: URL zum Nachschlagewerk */
  sourceUrl?: string;
  /** Code-spezifische Regeln */
  codeRules: {
    W?: { enabled: boolean; label?: string };
    T?: { enabled: boolean; label?: string };
  };
  /** Feiertagsgutschrift */
  holidayCredit: {
    enabled: boolean;
    hoursPerHolidayShift: number;
  };
  /** Vorfest-Gutschrift (z.B. Heiligabend / Silvester) */
  preHolidayCredit: {
    enabled: boolean;
    hoursPerOccurrence: number;
  };
  /** Schulferien-Anzeige spaceweit als Default aktiv */
  schoolHolidaysEnabledByDefault: boolean;
  /** ISO-Timestamp der letzten Änderung */
  updatedAt: string;
}

// ─── User Time Account Profile ────────────────────────────────────────────────

/**
 * Persönliches Stundenkonto-Profil des Users.
 * Wird unter yasa.timeAccountUser.v1 gespeichert (Map profileId → Profil).
 */
export interface UserTimeAccountProfile {
  profileId: string;
  /** Wöchentliche Soll-Stunden, z.B. 38.5 */
  weeklyHours: number;
  workModel: WorkModel;
  /** Startsaldo des Stundenkontos (kann negativ sein) */
  openingBalanceHours: number;
  /**
   * null  = Space-Default übernehmen
   * true  = immer anzeigen
   * false = nie anzeigen
   */
  schoolHolidaysEnabled?: boolean | null;
  /** ISO-Timestamp der letzten Änderung */
  updatedAt: string;
}

// ─── Summary ─────────────────────────────────────────────────────────────────

/**
 * Prognostiziertes Stundenkonto / Freizeitkonto.
 * Kein Rechtsanspruch – reine technische Prognose.
 */
export interface TimeAccountSummary {
  profileId: string;
  spaceId?: string | null;
  /** Anzahl Urlaubstage im betrachteten Zeitraum */
  vacationDays: number;
  /** Arbeitstage mit aktivem Schichtcode (nicht R/U/X) */
  plannedWorkDays: number;
  /** Gutgeschriebene Stunden (Feiertag- + Vorfest-Gutschrift) */
  creditedHours: number;
  /** Übernommener Startsaldo */
  openingBalanceHours: number;
  /** openingBalanceHours + creditedHours */
  totalHoursBalance: number;
  /**
   * Freizeitpotenzial in Tagesäquivalenten:
   * vacationDays + totalHoursBalance / dailyHoursEquivalent
   */
  offDaysEquivalent: number;
  /** Deterministischer Versions-String der Eingaben */
  summaryVersion: string;
  /** ISO-Timestamp der Berechnung */
  computedAt: string;
}

// ─── UI Dismiss State ─────────────────────────────────────────────────────────

/**
 * Persistierter Dismiss-State für das Freizeitkonto-Modal im Kalender.
 * Modal erscheint neu, wenn summaryVersion sich geändert hat.
 */
export interface TimeAccountUiState {
  profileId: string;
  /** summaryVersion, bei der der User zuletzt dismissed hat */
  dismissedForVersion: string;
  /** ISO-Timestamp des Dismisses */
  dismissedAt: string;
}

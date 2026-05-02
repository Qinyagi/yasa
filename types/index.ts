import type { SpaceRuleProfile } from './timeAccount';
import type { PreparedIdProfile } from './preparedProfile';

// ─── YASA Core Types ───────────────────────────────────────────────────────────

/**
 * Snapshot eines Mitglieds zum Zeitpunkt des Beitritts.
 * Ermöglicht Anzeige von Name + Avatar ohne vollständiges Profil laden zu müssen.
 */
export interface MemberSnapshot {
  id: string;
  displayName: string;
  avatarUrl: string;
}

/**
 * Vollständiger Lifecycle-Eintrag eines Space-Mitglieds.
 * Wird in Space.memberHistory[] geführt und ist ausschließlich
 * für die Host-Ansicht (members.tsx) bestimmt.
 *
 * Backward-Compat: Optional in Space (memberHistory?), migriert on-read.
 */
export interface MemberLifecycleEntry {
  id: string;
  displayName: string;
  avatarUrl: string;
  /** ISO-8601 – Zeitpunkt des Beitritts */
  joinedAt: string;
  /**
   * ProfileId desjenigen, der eingeladen hat (Host oder Co-Admin).
   * Entspricht ownerProfileId wenn über Host-QR beigetreten.
   * Fallback: ownerProfileId (QR-Payload enthält keine Einlader-Info).
   */
  joinedViaProfileId: string;
  /** ISO-8601 – gesetzt wenn Profil gelöscht / Member entfernt wurde */
  removedAt?: string;
  /** true = aktives Mitglied, false = entfernt/inaktiv */
  active: boolean;
}

export interface UserProfile {
  /** UUID v4 */
  id: string;
  /** Obfuscierter Anzeigename, z.B. "Müsba" */
  displayName: string;
  /** Multiavatar URL (SVG) – bei Ghosts: deterministischer Seed */
  avatarUrl: string;
  /** ISO-8601 Timestamp */
  createdAt: string;
  /** Anzahl erlaubter Bearbeitungen, danach gesperrt (Space-Identitätsstabilität) */
  profileEditCount?: number;
  /** Profilbearbeitung nach einmaliger Änderung gesperrt */
  profileEditLocked?: boolean;

  // ─── Ghost-Felder (Iteration 8) ────────────────────────────────
  /** "active" = echtes Profil (Default/Migration), "ghost" = Platzhalter */
  kind?: 'active' | 'ghost';
  /** Label/Name des Ghost-Platzhalters (nur bei kind="ghost") */
  ghostLabel?: string;
  /** Status: "active" oder "archived" (nur bei kind="ghost") */
  ghostStatus?: 'active' | 'archived';
  /** ProfileId des Erstellers (nur bei kind="ghost") */
  createdByProfileId?: string;
  /** SpaceId, in dem der Ghost existiert (nur bei kind="ghost") */
  ghostSpaceId?: string;
  /** ProfileId des echten Profils, das den Ghost ersetzt hat (für spätere Merge) */
  replacedByProfileId?: string;
}

export interface Space {
  /** UUID v4 */
  id: string;
  /** Frei gewählter Space-Name */
  name: string;
  /** ISO-8601 Timestamp */
  createdAt: string;
  /** UserProfile.id des Erstellers */
  ownerProfileId: string;
  /** displayName des Erstellers zum Anzeigezeitpunkt */
  ownerDisplayName: string;
  /** Zufälliges Token für QR-Invite-Link */
  inviteToken: string;
  /** Profile-IDs von Co-Admins (Iteration 4+) */
  coAdminProfileIds: string[];
  /**
   * Profile-IDs aller Mitglieder (inkl. Owner).
   * Migration: falls undefined → wird on-read zu [] normalisiert.
   */
  memberProfileIds: string[];
  /**
   * Snapshots (Name + Avatar) aller Mitglieder zum Beitrittszeitpunkt.
   * Migration: falls undefined → wird on-read aus ownerProfileId/ownerDisplayName initialisiert.
   * Enthält ausschließlich aktive Mitglieder (nach RC-3 authoritative merge).
   */
  memberProfiles: MemberSnapshot[];
  /**
   * Vollständige Mitglieder-Timeline: Join + Remove-Events.
   * Wächst nur (nie schrumpft), enthält auch entfernte Mitglieder.
   * Optional für Backward-Compat; wird on-read aus memberProfiles geseedet wenn leer.
   * Nur für Host-Ansicht (members.tsx) relevant.
   */
  memberHistory?: MemberLifecycleEntry[];
  /**
   * Optionales Space-Regelprofil für Cross-Device Sync.
   * Backward-Compat: kann fehlen; lokale Storage-Map bleibt Quelle/Fallback.
   */
  spaceRuleProfile?: SpaceRuleProfile | null;
  /**
   * Host-prepared onboarding profiles for this Space.
   * Read-only roster signal for members; never grants membership/permissions.
   */
  preparedIdProfiles?: PreparedIdProfile[];
}

// ─── Shift Types (Iteration 6 + 7 Erweiterung) ─────────────────────────────

/**
 * Schichtcode:
 * F = Frühschicht, S = Spätschicht, N = Nachtschicht,
 * T = Tagesdienst, KS = Kurzer Spätdienst, KN = Kurzer Nachtdienst,
 * K = Krank, EK = entschuldigt Krank,
 * R = Ruhe (ehem. O/Frei), U = Urlaub, X = Platzhalter/Frei
 *
 * Migration: Alter Code „O" wird on-read zu „R" migriert.
 */
export type ShiftType = 'F' | 'S' | 'N' | 'T' | 'KS' | 'KN' | 'K' | 'EK' | 'R' | 'U' | 'X';

/**
 * Metadaten zu einem Schichtcode (für spätere Anzeige / Farben).
 */
export interface ShiftDefinition {
  code: ShiftType;
  label: string;
  startTime?: string; // z.B. "06:00"
  endTime?: string;   // z.B. "14:00"
  color?: string;     // z.B. "#F59E0B"
}

/**
 * Ein konkreter Schichteintrag für einen Tag.
 */
export interface ShiftEntry {
  /** ISO-Datum "YYYY-MM-DD" */
  dateISO: string;
  code: ShiftType;
}

/**
 * Der Schichtplan eines Profils.
 * Wird unter yasa.shifts.v1 als Map { [profileId]: UserShiftPlan } gespeichert.
 */
export interface UserShiftPlan {
  /** Referenz auf UserProfile.id */
  profileId: string;
  /** ISO-Datum "YYYY-MM-DD" – erster generierter Tag des Musters */
  startDateISO: string;
  /** Referenzdatum, das der User als Startdatum gewählt hat (optional) */
  anchorDateISO?: string;
  /** Das Wiederholungsmuster, z.B. 28 Codes für 28-Tage-Zyklus */
  pattern: ShiftType[];
  /** Länge des Zyklus in Tagen (frei wählbar, z.B. 1–56) */
  cycleLengthDays: number;
  /** ISO-Datum bis zu dem entries generiert wurden */
  generatedUntilISO: string;
  /** Alle generierten Tageseinträge */
  entries: ShiftEntry[];
}

// ─── Swap Types (Iteration 10) ─────────────────────────────────────────────────

/**
 * Ein Tauschanfrage für einen Schichtdienst.
 */
export interface SwapRequest {
  /** UUID v4 */
  id: string;
  /** SpaceId, in dem der Tausch stattfindet */
  spaceId: string;
  /** UserProfile.id des Anfragers */
  requesterProfileId: string;
  /** ISO-Datum "YYYY-MM-DD" des Dienstes, der getauscht werden soll */
  date: string;
  /** Shift-Code des Anfragers an diesem Datum */
  shiftCode: ShiftType;
  /** Optionale Nachricht an den Tauschpartner */
  message?: string;
  /** Status der Anfrage */
  status: 'open' | 'accepted' | 'declined' | 'cancelled';
  /** ID des Profils, das die Anfrage angenommen hat (bei status=accepted) */
  acceptedByProfileId?: string;
  /** ISO-Timestamp der Erstellung */
  createdAt: string;
}

// ─── Time Clock Types (Companion / Stempeluhr) ──────────────────────────────

/**
 * Regeldienste, fuer die die Stempeluhr relevant ist.
 */
export type RegularShiftCode = 'F' | 'S' | 'N' | 'KS' | 'KN' | 'T';

/**
 * Pro Dienst konfigurierbares Zeitfenster inkl. Gleitzeit/Kulanz.
 */
export interface TimeClockShiftWindow {
  /** Dienstbeginn z. B. "06:00" */
  startTime: string;
  /** Dienstende z. B. "14:00" */
  endTime: string;
  /** Bezahlte Gleitzeit in Minuten (0 = keine) */
  paidFlexMinutes: number;
  /** Zusatzkulanz nach Dienstende in Minuten */
  postShiftGraceMinutes: number;
}

/**
 * Alle relevanten Dienstfenster fuer ein Profil.
 */
export interface UserTimeClockShiftSettings {
  F: TimeClockShiftWindow;
  S: TimeClockShiftWindow;
  N: TimeClockShiftWindow;
  KS: TimeClockShiftWindow;
  KN: TimeClockShiftWindow;
  T: TimeClockShiftWindow;
}

/**
 * User-spezifische Konfiguration der virtuellen Stempeluhr.
 */
export interface UserTimeClockConfig {
  profileId: string;
  shiftSettings: UserTimeClockShiftSettings;
  updatedAt: string;
}

export type TimeClockEventType = 'check_in' | 'check_out';

/**
 * Einzelner Stempelvorgang (Kommen/Gehen).
 * Enthält bewusst Datum + Wochentag + Schichtkürzel für spätere Auswertung.
 */
export interface TimeClockEvent {
  id: string;
  profileId: string;
  dateISO: string;
  weekdayLabel: string;
  shiftCode: RegularShiftCode;
  eventType: TimeClockEventType;
  timestampISO: string;
  source: 'manual_popup' | 'manual_service' | 'manual_edit' | 'manual_test_popup' | 'auto_placeholder';
  createdAt: string;
}

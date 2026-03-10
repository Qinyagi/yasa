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

export interface UserProfile {
  /** UUID v4 */
  id: string;
  /** Obfuscierter Anzeigename, z.B. "Müsba" */
  displayName: string;
  /** Multiavatar URL (SVG) – bei Ghosts: deterministischer Seed */
  avatarUrl: string;
  /** ISO-8601 Timestamp */
  createdAt: string;

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
   */
  memberProfiles: MemberSnapshot[];
}

// ─── Shift Types (Iteration 6 + 7 Erweiterung) ─────────────────────────────

/**
 * Schichtcode:
 * F = Frühschicht, S = Spätschicht, N = Nachtschicht,
 * T = Tagesdienst, KS = Kurzer Spätdienst, KN = Kurzer Nachtdienst,
 * K = Kurzer Dienst (Legacy-Altcode),
 * R = Ruhe (ehem. O/Frei), U = Urlaub, X = Platzhalter/Frei
 *
 * Migration: Alter Code „O" wird on-read zu „R" migriert.
 */
export type ShiftType = 'F' | 'S' | 'N' | 'T' | 'KS' | 'KN' | 'K' | 'R' | 'U' | 'X';

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
  /** ISO-Datum "YYYY-MM-DD" – erster Tag des Musters */
  startDateISO: string;
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

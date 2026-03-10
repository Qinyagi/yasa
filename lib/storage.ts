import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserProfile, Space, MemberSnapshot, UserShiftPlan, ShiftType, ShiftEntry, SwapRequest } from '../types';
import type { SpaceRuleProfile, UserTimeAccountProfile, TimeAccountUiState } from '../types/timeAccount';
import { getHolidayMap, type Holiday } from '../data/holidays';
import { logInfo, logWarn, logError } from './log';

// ─── Storage Keys ──────────────────────────────────────────────────────────────
/** All AsyncStorage keys used by YASA – exported for admin cleanup / debug */
export const STORAGE_KEYS = {
  PROFILE: 'yasa.profile.v1',
  SPACES: 'yasa.spaces.v1',
  CURRENT_SPACE_ID: 'yasa.currentSpaceId.v1',
  SHIFTS: 'yasa.shifts.v1',
  GHOSTS: 'yasa.ghosts.v1',
  VACATION: 'yasa.vacation.v1',
  SWAPS: 'yasa.swaps.v1',
  // ── Shift Overrides (einmalige Schichtwechsel) ──
  SHIFT_OVERRIDES: 'yasa.shiftOverrides.v1',
  // ── Day Changes History (Original + Aktuell) ──
  DAY_CHANGES: 'yasa.dayChanges.v1',
  // ── Time Account (Iteration 20) ──
  TIME_ACCOUNT_SPACE_RULES: 'yasa.timeAccountSpaceRules.v1',
  TIME_ACCOUNT_USER: 'yasa.timeAccountUser.v1',
  TIME_ACCOUNT_UI: 'yasa.timeAccountUi.v1',
} as const;

/** Internal alias for backward compat within this module */
const KEYS = STORAGE_KEYS;

// ─── Profile ───────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.PROFILE);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export async function setProfile(profile: UserProfile): Promise<void> {
  logInfo('Storage', 'createProfile', { id: profile.id, name: profile.displayName });
  await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
}

export async function clearProfile(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.PROFILE);
}

// ─── Spaces ────────────────────────────────────────────────────────────────────

/**
 * Normalisiert alte Space-Objekte on-read:
 * - memberProfileIds: [] falls nicht vorhanden
 * - coAdminProfileIds: [] falls nicht vorhanden
 * - memberProfiles: aus ownerProfileId/ownerDisplayName initialisieren falls nicht vorhanden
 */
function migrateSpace(s: Space): Space {
  const memberProfileIds = Array.isArray(s.memberProfileIds) ? s.memberProfileIds : [];
  const coAdminProfileIds = Array.isArray(s.coAdminProfileIds) ? s.coAdminProfileIds : [];

  // memberProfiles Migration: Owner als Fallback-Eintrag
  let memberProfiles: MemberSnapshot[] = Array.isArray(s.memberProfiles) ? s.memberProfiles : [];
  if (memberProfiles.length === 0 && s.ownerProfileId) {
    memberProfiles = [
      {
        id: s.ownerProfileId,
        displayName: s.ownerDisplayName ?? 'Unbekannt',
        avatarUrl: '',
      },
    ];
  }

  return { ...s, memberProfileIds, coAdminProfileIds, memberProfiles };
}

export async function getSpaces(): Promise<Space[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SPACES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Space[];
    return parsed.map(migrateSpace);
  } catch {
    return [];
  }
}

export async function setSpaces(spaces: Space[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.SPACES, JSON.stringify(spaces));
}

export async function addSpace(space: Space): Promise<void> {
  logInfo('Storage', 'createSpace', { id: space.id, name: space.name });
  const existing = await getSpaces();
  await setSpaces([...existing, space]);
}

/**
 * Join-Logik:
 * 1) Findet Space per spaceId
 * 2) Validiert inviteToken
 * 3) Fügt profileId zu memberProfileIds hinzu (idempotent)
 * 4) Fügt MemberSnapshot zu memberProfiles hinzu (idempotent)
 * 5) Setzt currentSpaceId
 * 6) Persistiert
 */
export async function joinSpace(
  spaceId: string,
  token: string,
  profile: UserProfile
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const spaces = await getSpaces();
  const idx = spaces.findIndex((s) => s.id === spaceId);

  if (idx === -1) return { ok: false, reason: 'Space nicht gefunden.' };

  const space = spaces[idx];
  if (space.inviteToken !== token) return { ok: false, reason: 'Ungültiges Einlade-Token.' };

  const alreadyMember = space.memberProfileIds.includes(profile.id);

  spaces[idx] = {
    ...space,
    memberProfileIds: alreadyMember
      ? space.memberProfileIds
      : [...space.memberProfileIds, profile.id],
    memberProfiles: alreadyMember
      ? space.memberProfiles
      : [
          ...space.memberProfiles.filter((m) => m.id !== profile.id),
          { id: profile.id, displayName: profile.displayName, avatarUrl: profile.avatarUrl },
        ],
  };

  await setSpaces(spaces);
  await setCurrentSpaceId(spaceId);
  logInfo('Storage', 'joinSpace', { spaceId, profileId: profile.id, alreadyMember });
  return { ok: true };
}

/**
 * Importiert einen Space aus einem QR-Payload (lokaler Space-Import).
 * Wird verwendet wenn Gerät B den QR scannt und der Space noch nicht lokal existiert.
 * 
 * 1) Prüft ob Space bereits lokal existiert → wenn ja, gib existierenden Space zurück
 * 2) Erstellt neuen Space aus QR-Metadaten
 * 3) Fügt importingProfile als erstes Mitglied hinzu
 * 4) Setzt currentSpaceId
 * 
 * @param payload - Die QR-Payload-Daten
 * @param profile - Das Profil des Users der beitritt
 * @returns Das importierte/gefundene Space
 */
export async function importSpaceFromInvite(
  payload: {
    spaceId: string;
    name: string;
    ownerProfileId: string;
    ownerDisplayName: string;
    inviteToken: string;
  },
  profile: UserProfile
): Promise<{ ok: true; space: Space } | { ok: false; reason: string }> {
  const spaces = await getSpaces();
  
  // Prüfe ob Space bereits lokal existiert
  const existingIdx = spaces.findIndex((s) => s.id === payload.spaceId);
  if (existingIdx !== -1) {
    // Space existiert bereits - prüfe Token und füge Member hinzu
    const existing = spaces[existingIdx];
    if (existing.inviteToken !== payload.inviteToken) {
      return { ok: false, reason: 'Ungültiges Einlade-Token.' };
    }
    
    // Member hinzufügen falls noch nicht vorhanden
    if (!existing.memberProfileIds.includes(profile.id)) {
      spaces[existingIdx] = {
        ...existing,
        memberProfileIds: [...existing.memberProfileIds, profile.id],
        memberProfiles: [
          ...existing.memberProfiles.filter((m) => m.id !== profile.id),
          { id: profile.id, displayName: profile.displayName, avatarUrl: profile.avatarUrl },
        ],
      };
      await setSpaces(spaces);
    }
    
    await setCurrentSpaceId(payload.spaceId);
    logInfo('Storage', 'importSpaceFromInvite:existing', { spaceId: payload.spaceId, profileId: profile.id });
    return { ok: true, space: spaces[existingIdx] };
  }
  
  // Space existiert nicht - neu erstellen
  const newSpace: Space = {
    id: payload.spaceId,
    name: payload.name,
    createdAt: new Date().toISOString(),
    ownerProfileId: payload.ownerProfileId,
    ownerDisplayName: payload.ownerDisplayName,
    inviteToken: payload.inviteToken,
    coAdminProfileIds: [],
    memberProfileIds: [payload.ownerProfileId, profile.id],
    memberProfiles: [
      { id: payload.ownerProfileId, displayName: payload.ownerDisplayName, avatarUrl: '' },
      { id: profile.id, displayName: profile.displayName, avatarUrl: profile.avatarUrl },
    ],
  };
  
  spaces.push(newSpace);
  await setSpaces(spaces);
  await setCurrentSpaceId(payload.spaceId);
  
  logInfo('Storage', 'importSpaceFromInvite:new', { spaceId: payload.spaceId, name: payload.name, profileId: profile.id });
  return { ok: true, space: newSpace };
}

/**
 * Aktualisiert coAdminProfileIds eines Space.
 * Gibt false zurück wenn Space nicht gefunden.
 */
export async function updateCoAdmins(
  spaceId: string,
  coAdminProfileIds: string[]
): Promise<boolean> {
  const spaces = await getSpaces();
  const idx = spaces.findIndex((s) => s.id === spaceId);
  if (idx === -1) return false;
  spaces[idx] = { ...spaces[idx], coAdminProfileIds };
  await setSpaces(spaces);
  return true;
}

export async function deleteSpace(spaceId: string): Promise<void> {
  logInfo('Storage', 'deleteSpace', { spaceId });
  const existing = await getSpaces();
  await setSpaces(existing.filter((s) => s.id !== spaceId));
  const currentId = await getCurrentSpaceId();
  if (currentId === spaceId) {
    await clearCurrentSpaceId();
  }
  // Iteration 19: Robuste Ghost-Bereinigung (idempotent, inkl. Shift-Cleanup)
  await purgeSpaceGhostData(spaceId);
}

/**
 * Bereinigt alle Ghost-Daten eines gelöschten Space – idempotent.
 *
 * Schritt 1: Archiviert alle Ghosts des Space (ghostStatus → 'archived').
 *            Bereits archivierte Ghosts werden neu gesetzt → idempotent.
 * Schritt 2: Entfernt die zugehörigen Ghost-Schichtpläne aus KEYS.SHIFTS,
 *            um verwaiste Einträge zu vermeiden.
 *
 * Non-fatal: ein Fehler bricht die Space-Löschung nicht ab.
 * Mehrfachaufruf ist sicher: hat beim zweiten Mal keinen weiteren Effekt.
 */
export async function purgeSpaceGhostData(spaceId: string): Promise<void> {
  try {
    const allGhosts = await getAllGhosts();
    const spaceGhosts = allGhosts[spaceId];

    if (!spaceGhosts || spaceGhosts.length === 0) {
      logInfo('Storage', 'purgeSpaceGhostData:skipped', { spaceId, reason: 'no ghosts' });
      return;
    }

    // Schritt 1: Alle Ghosts dieses Space archivieren
    const ghostIds = spaceGhosts.map((g) => g.id);
    allGhosts[spaceId] = spaceGhosts.map((g) => ({
      ...g,
      ghostStatus: 'archived' as const,
    }));
    await setAllGhosts(allGhosts);

    // Schritt 2: Ghost-Schichtpläne bereinigen (orphaned entries)
    const allPlans = await getAllShiftPlans();
    let changed = false;
    for (const gid of ghostIds) {
      if (Object.prototype.hasOwnProperty.call(allPlans, gid)) {
        delete allPlans[gid];
        changed = true;
      }
    }
    if (changed) {
      await AsyncStorage.setItem(KEYS.SHIFTS, JSON.stringify(allPlans));
    }

    logInfo('Storage', 'purgeSpaceGhostData', { spaceId, ghostCount: ghostIds.length });
  } catch (err) {
    logError('Storage', 'purgeSpaceGhostData:error', { spaceId, err: String(err) });
    // Non-fatal: Space-Löschung bereits abgeschlossen
  }
}

// ─── Current Space ─────────────────────────────────────────────────────────────

export async function getCurrentSpaceId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEYS.CURRENT_SPACE_ID);
  } catch {
    return null;
  }
}

export async function setCurrentSpaceId(spaceId: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.CURRENT_SPACE_ID, spaceId);
}

export async function clearCurrentSpaceId(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.CURRENT_SPACE_ID);
}

// ─── Shifts (Iteration 6 + 7 Erweiterung) ───────────────────────────────────

/**
 * Migriert einen einzelnen ShiftType: 'O' → 'R'.
 * Alle anderen Codes bleiben unverändert.
 */
function migrateShiftCode(code: string): ShiftType {
  if (code === 'O') return 'R';
  return code as ShiftType;
}

/**
 * Migriert einen gespeicherten Schichtplan:
 * - pattern: O → R
 * - entries: O → R
 */
function migrateShiftPlan(plan: UserShiftPlan): UserShiftPlan {
  const needsMigration =
    plan.pattern.includes('O' as ShiftType) ||
    plan.entries.some((e) => (e.code as string) === 'O');

  if (!needsMigration) return plan;

  return {
    ...plan,
    pattern: plan.pattern.map((c) => migrateShiftCode(c as string)),
    entries: plan.entries.map((e) => ({
      ...e,
      code: migrateShiftCode(e.code as string),
    })),
  };
}

/**
 * Generiert ShiftEntry-Array für eine gegebene Anzahl an Wochen,
 * ausgehend vom startDatum und dem Wiederholungsmuster.
 */
export function generateShiftEntries(
  startDateISO: string,
  pattern: ShiftType[],
  weeksCount: number
): ShiftEntry[] {
  const entries: ShiftEntry[] = [];
  const totalDays = weeksCount * 7;
  const patternLen = pattern.length;
  if (patternLen === 0) return entries;

  // Startdatum ohne Zeit-Anteil parsen
  const [y, m, d] = startDateISO.split('-').map(Number);
  const start = new Date(y, m - 1, d);

  for (let i = 0; i < totalDays; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dateISO = formatDateISO(date);
    const code = pattern[i % patternLen];
    entries.push({ dateISO, code });
  }
  return entries;
}

/** Formatiert ein Date-Objekt zu "YYYY-MM-DD" ohne UTC-Versatz */
export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Gibt das heutige Datum als "YYYY-MM-DD" zurück */
export function todayISO(): string {
  return formatDateISO(new Date());
}

/**
 * Liest alle Schichtpläne (Map profileId → UserShiftPlan).
 * Gibt leere Map zurück wenn kein Eintrag vorhanden.
 * Migration: O → R wird on-read angewendet.
 */
export async function getAllShiftPlans(): Promise<Record<string, UserShiftPlan>> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SHIFTS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, UserShiftPlan>;
    // Migration O → R on-read
    const result: Record<string, UserShiftPlan> = {};
    for (const [key, plan] of Object.entries(parsed)) {
      result[key] = migrateShiftPlan(plan);
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Liest den Schichtplan für ein spezifisches Profil.
 * Gibt null zurück wenn kein Plan vorhanden.
 */
export async function getShiftPlan(profileId: string): Promise<UserShiftPlan | null> {
  const all = await getAllShiftPlans();
  return all[profileId] ?? null;
}

/**
 * Speichert einen Schichtplan für ein Profil (überschreibt bestehenden).
 */
export async function saveShiftPlan(plan: UserShiftPlan): Promise<void> {
  const all = await getAllShiftPlans();
  all[plan.profileId] = plan;
  await AsyncStorage.setItem(KEYS.SHIFTS, JSON.stringify(all));
}

/**
 * Gibt den Schichtcode für ein Profil an einem bestimmten Datum zurück.
 * null wenn kein Plan vorhanden oder kein Eintrag für das Datum.
 */
export async function getShiftForDate(
  profileId: string,
  dateISO: string
): Promise<ShiftType | null> {
  const plan = await getShiftPlan(profileId);
  if (!plan) return null;
  const entry = plan.entries.find((e) => e.dateISO === dateISO);
  return entry?.code ?? null;
}

// ─── Ghosts (Iteration 8) ────────────────────────────────────────────────────

/**
 * Einfache UUID v4 Generierung (ohne externe Abhängigkeit).
 * Exportiert für Wiederverwendung in Screens (profile creation, space creation).
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Liest alle Ghost-Profile (Map spaceId → UserProfile[]).
 */
async function getAllGhosts(): Promise<Record<string, UserProfile[]>> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.GHOSTS);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, UserProfile[]>;
  } catch {
    return {};
  }
}

/**
 * Speichert alle Ghost-Profile.
 */
async function setAllGhosts(data: Record<string, UserProfile[]>): Promise<void> {
  await AsyncStorage.setItem(KEYS.GHOSTS, JSON.stringify(data));
}

/**
 * Erstellt einen neuen Ghost in einem Space.
 * Nur der Owner sollte diese Funktion aufrufen (Rechte-Check im UI).
 */
export async function createGhost(
  spaceId: string,
  ghostLabel: string,
  ownerProfileId: string
): Promise<UserProfile> {
  const all = await getAllGhosts();
  const spaceGhosts = all[spaceId] ?? [];

  const ghost: UserProfile = {
    id: generateUUID(),
    displayName: ghostLabel,
    avatarUrl: `${spaceId}:${ghostLabel}`.toLowerCase(),
    createdAt: new Date().toISOString(),
    kind: 'ghost',
    ghostLabel,
    ghostStatus: 'active',
    createdByProfileId: ownerProfileId,
    ghostSpaceId: spaceId,
  };

  spaceGhosts.push(ghost);
  all[spaceId] = spaceGhosts;
  await setAllGhosts(all);
  return ghost;
}

/**
 * Listet alle aktiven Ghosts eines Space.
 */
export async function listGhosts(spaceId: string): Promise<UserProfile[]> {
  const all = await getAllGhosts();
  const spaceGhosts = all[spaceId] ?? [];
  return spaceGhosts.filter((g) => g.ghostStatus === 'active');
}

/**
 * Listet alle Ghosts eines Space (inkl. archivierter).
 */
export async function listAllGhosts(spaceId: string): Promise<UserProfile[]> {
  const all = await getAllGhosts();
  return all[spaceId] ?? [];
}

/**
 * Archiviert einen Ghost (soft delete).
 * Ghost bleibt in der Datenbank, aber ghostStatus wird auf "archived" gesetzt.
 */
export async function archiveGhost(
  spaceId: string,
  ghostProfileId: string
): Promise<boolean> {
  const all = await getAllGhosts();
  const spaceGhosts = all[spaceId] ?? [];
  const idx = spaceGhosts.findIndex((g) => g.id === ghostProfileId);
  if (idx === -1) return false;

  spaceGhosts[idx] = { ...spaceGhosts[idx], ghostStatus: 'archived' };
  all[spaceId] = spaceGhosts;
  await setAllGhosts(all);
  return true;
}

/**
 * Markiert einen Ghost als "anwesend" für ein bestimmtes Datum + Shift-Code.
 * Erzeugt oder aktualisiert einen Shift-Eintrag in yasa.shifts.v1.
 * Alle Space-Mitglieder dürfen diese Funktion aufrufen.
 */
export async function markGhostPresent(
  ghostProfileId: string,
  dateISO: string,
  shiftCode: ShiftType
): Promise<void> {
  const allPlans = await getAllShiftPlans();
  const existing = allPlans[ghostProfileId];

  if (existing) {
    // Prüfe ob bereits ein Eintrag für dieses Datum existiert
    const entryIdx = existing.entries.findIndex((e) => e.dateISO === dateISO);
    if (entryIdx >= 0) {
      // Update bestehenden Eintrag
      existing.entries[entryIdx] = { dateISO, code: shiftCode };
    } else {
      // Neuen Eintrag hinzufügen
      existing.entries.push({ dateISO, code: shiftCode });
      // entries nach Datum sortieren
      existing.entries.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    }
    // generatedUntilISO aktualisieren
    if (dateISO > existing.generatedUntilISO) {
      existing.generatedUntilISO = dateISO;
    }
    allPlans[ghostProfileId] = existing;
  } else {
    // Neuen "Plan" für Ghost anlegen (nur Einzeleinträge, kein Pattern)
    const ghostPlan: UserShiftPlan = {
      profileId: ghostProfileId,
      startDateISO: dateISO,
      pattern: [],
      cycleLengthDays: 0,
      generatedUntilISO: dateISO,
      entries: [{ dateISO, code: shiftCode }],
    };
    allPlans[ghostProfileId] = ghostPlan;
  }

  await AsyncStorage.setItem(KEYS.SHIFTS, JSON.stringify(allPlans));
}

// ─── Vacation Planning (Iteration 9) ────────────────────────────────────────────────

/**
 * Liest alle Urlaubstage für ein Profil.
 * Nutzt den zentralen KEYS.VACATION Storage.
 */
export async function getVacationDays(profileId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.VACATION);
    if (!raw) return [];
    const all = JSON.parse(raw) as Record<string, string[]>;
    return all[profileId] ?? [];
  } catch {
    return [];
  }
}

/**
 * Speichert alle Urlaubstage für ein Profil (überschreibt).
 */
async function saveVacationDays(profileId: string, days: string[]): Promise<void> {
  let all: Record<string, string[]> = {};
  try {
    const raw = await AsyncStorage.getItem(KEYS.VACATION);
    if (raw) all = JSON.parse(raw) as Record<string, string[]>;
  } catch {
    // ignore
  }
  all[profileId] = [...days].sort();
  await AsyncStorage.setItem(KEYS.VACATION, JSON.stringify(all));
}

/**
 * Toggle einen Urlaubstag und schreibt Day Change History.
 */
export async function toggleVacationDay(profileId: string, dateISO: string): Promise<string[]> {
  const days = await getVacationDays(profileId);
  const exists = days.includes(dateISO);
  
  // Hole den Original-Code aus dem Schichtplan
  const originalCode = await getShiftForDate(profileId, dateISO);
  
  let newDays: string[];
  if (exists) {
    newDays = days.filter(d => d !== dateISO);
    // Urlaub entfernt: Day Change löschen (wiederhergestellt auf Original)
    await clearDayChange(profileId, dateISO);
  } else {
    newDays = [...days, dateISO].sort();
    // Urlaub gesetzt: Day Change schreiben
    await setDayChange(profileId, dateISO, originalCode, 'U', 'vacation');
  }
  
  await saveVacationDays(profileId, newDays);
  return newDays;
}

/**
 * Zählt Urlaubstage für ein Profil in einem bestimmten Jahr
 */
export async function countVacationDaysForYear(profileId: string, year: number): Promise<number> {
  const days = await getVacationDays(profileId);
  return days.filter(d => d.startsWith(`${year}-`)).length;
}

/**
 * Strategie-Vorschlag für Brückentage
 */
export interface VacationStrategy {
  urlaubstage: string[];      // Array von YYYY-MM-DD
  freieTage: number;         // Anzahl freie Tage gesamt
  feiertag: Holiday;        // Der Feiertag
}

/**
 * Berechnet Strategie-Vorschläge für die nächsten 12 Monate
 */
export async function calculateVacationStrategy(profileId: string): Promise<VacationStrategy[]> {
  const plan = await getShiftPlan(profileId);
  if (!plan) return [];

  const [vacationDays, overrides] = await Promise.all([
    getVacationDays(profileId),
    getShiftOverrides(profileId),
  ]);

  const existingVacation = new Set(vacationDays);
  const entryMap = new Map(plan.entries.map((e) => [e.dateISO, e.code]));
  const now = new Date();
  const fromISO = formatDateISO(now);
  const toDate = new Date(now);
  toDate.setDate(toDate.getDate() + 365);
  const toISO = formatDateISO(toDate);

  const allHolidays: Record<string, Holiday> = {};
  for (let y = now.getFullYear(); y <= toDate.getFullYear(); y++) {
    Object.assign(allHolidays, getHolidayMap(y));
  }

  const holidayDates = Object.keys(allHolidays)
    .filter((d) => d >= fromISO && d <= toISO)
    .sort();

  function addDaysISO(dateISO: string, days: number): string {
    const [y, m, d] = dateISO.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return formatDateISO(dt);
  }

  function getEffectiveCode(dateISO: string, extraVacation: Set<string>): ShiftType | null {
    if (extraVacation.has(dateISO) || existingVacation.has(dateISO)) return 'U';
    if (overrides[dateISO]) return overrides[dateISO];
    return entryMap.get(dateISO) ?? null;
  }

  function isOff(code: ShiftType | null): boolean {
    return code === 'R' || code === 'X' || code === 'U';
  }

  function getSpanAround(holidayDateISO: string, extraVacation: Set<string>): number {
    // Für 24/7-Logik muss der Feiertag selbst effektiv frei sein,
    // sonst gibt es keinen zusammenhängenden Frei-Block um den Feiertag.
    if (!isOff(getEffectiveCode(holidayDateISO, extraVacation))) return 0;

    let start = holidayDateISO;
    let end = holidayDateISO;

    while (true) {
      const prev = addDaysISO(start, -1);
      if (!isOff(getEffectiveCode(prev, extraVacation))) break;
      start = prev;
    }
    while (true) {
      const next = addDaysISO(end, 1);
      if (!isOff(getEffectiveCode(next, extraVacation))) break;
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
        const effectiveCode = getEffectiveCode(d, new Set<string>());
        // Nur echte Arbeitstage als neue Urlaubstage vorschlagen.
        return effectiveCode !== null && !isOff(effectiveCode);
      });

    const maxPick = Math.min(3, pool.length);
    for (let pick = 1; pick <= maxPick; pick++) {
      const combos = combine(pool, pick);
      for (const combo of combos) {
        const extraVacation = new Set(combo);
        const freieTage = getSpanAround(holidayDateISO, extraVacation);
        // Mindestwert: sinnvoller zusammenhängender Block
        if (freieTage < combo.length + 1) continue;

        const urlaubstage = [...combo].sort();
        const key = `${holidayDateISO}|${urlaubstage.join(',')}`;
        const existing = bestByKey.get(key);
        const candidate: VacationStrategy = {
          urlaubstage,
          freieTage,
          feiertag: holiday,
        };
        if (!existing || candidate.freieTage > existing.freieTage) {
          bestByKey.set(key, candidate);
        }
      }
    }
  }

  return Array.from(bestByKey.values()).sort((a, b) => {
    if (a.urlaubstage.length !== b.urlaubstage.length) {
      return a.urlaubstage.length - b.urlaubstage.length;
    }
    return b.freieTage - a.freieTage;
  });
}

/**
 * Übernimmt einen Strategie-Vorschlag und setzt Urlaubstage
 */
export async function applyVacationStrategy(profileId: string, strategy: VacationStrategy): Promise<string[]> {
  const days = await getVacationDays(profileId);
  const newDays = [...new Set([...days, ...strategy.urlaubstage])].sort();
  await saveVacationDays(profileId, newDays);
  return newDays;
}

// ─── Shift Overrides (einmalige Schichtwechsel) ─────────────────────────────────────

/**
 * Liest alle Shift-Overrides für ein Profil.
 * Override = einmalige Schichtänderung für einen bestimmten Tag.
 * Map: { [dateISO]: ShiftType }
 */
export async function getShiftOverrides(profileId: string): Promise<Record<string, ShiftType>> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SHIFT_OVERRIDES);
    if (!raw) return {};
    const all = JSON.parse(raw) as Record<string, Record<string, ShiftType>>;
    return all[profileId] ?? {};
  } catch {
    return {};
  }
}

/**
 * Speichert alle Shift-Overrides für ein Profil (überschreibt).
 */
async function saveShiftOverrides(profileId: string, overrides: Record<string, ShiftType>): Promise<void> {
  let all: Record<string, Record<string, ShiftType>> = {};
  try {
    const raw = await AsyncStorage.getItem(KEYS.SHIFT_OVERRIDES);
    if (raw) all = JSON.parse(raw) as Record<string, Record<string, ShiftType>>;
  } catch {
    // ignore
  }
  all[profileId] = { ...overrides };
  await AsyncStorage.setItem(KEYS.SHIFT_OVERRIDES, JSON.stringify(all));
}

/**
 * Setzt einen Override für ein bestimmtes Datum.
 * Wenn overrideCode === null, wird der Override gelöscht.
 * U (Urlaub) kann nicht als Override gesetzt werden.
 * Schreibt auch Day Change History.
 */
export async function setShiftOverride(
  profileId: string,
  dateISO: string,
  overrideCode: ShiftType | null
): Promise<Record<string, ShiftType>> {
  // U darf nicht als Override verwendet werden
  if (overrideCode === 'U') {
    logWarn('Storage', 'setShiftOverride:reject', { reason: 'U not allowed as override' });
    return getShiftOverrides(profileId);
  }

  const overrides = await getShiftOverrides(profileId);
  const originalCode = await getShiftForDate(profileId, dateISO);

  if (overrideCode === null) {
    // Löschen
    delete overrides[dateISO];
    // Day Change löschen (wiederhergestellt auf Original)
    await clearDayChange(profileId, dateISO);
  } else {
    // Setzen
    overrides[dateISO] = overrideCode;
    // Day Change schreiben
    await setDayChange(profileId, dateISO, originalCode, overrideCode, 'override');
  }

  await saveShiftOverrides(profileId, overrides);
  return overrides;
}

/**
 * Toggle einen Override: wenn bereits vorhanden, zum nächsten Code wechseln oder löschen.
 * Sequenz: F → S → N → T → KS → KN → R → X → (entfernen)
 */
export async function toggleShiftOverride(
  profileId: string,
  dateISO: string
): Promise<Record<string, ShiftType>> {
  const overrides = await getShiftOverrides(profileId);
  const current = overrides[dateISO];

  // Sequenz für Override (U nicht enthalten)
  const OVERRIDE_SEQUENCE: ShiftType[] = ['F', 'S', 'N', 'T', 'KS', 'KN', 'R', 'X'];

  let nextCode: ShiftType | null;

  if (!current) {
    // Erster Override: F
    nextCode = 'F';
  } else {
    const idx = OVERRIDE_SEQUENCE.indexOf(current);
    if (idx === -1 || idx === OVERRIDE_SEQUENCE.length - 1) {
      // Nicht in Sequenz oder letzter → löschen
      nextCode = null;
    } else {
      // Nächster Code
      nextCode = OVERRIDE_SEQUENCE[idx + 1];
    }
  }

  return setShiftOverride(profileId, dateISO, nextCode);
}

// ─── Day Changes History (Original + Aktuell) ─────────────────────────────────────

/**
 * Typ für Day Change History.
 * Speichert für jeden Tag den Original-Code (aus dem Schichtplan) und den Aktuell-Code (nach Urlaub/Tausch/Override).
 */
export interface DayChange {
  originalCode: ShiftType | null;  // Originaler Schichtcode aus dem Plan
  currentCode: ShiftType | null;   // Aktueller Code (inkl. Urlaub/Tausch/Override)
  reason: 'vacation' | 'swap' | 'override';  // Grund der Änderung
  updatedAt: string;               // Zeitstempel der letzten Änderung
}

/**
 * Liest alle Day Changes für ein Profil.
 * Map: { [dateISO]: DayChange }
 */
export async function getDayChanges(profileId: string): Promise<Record<string, DayChange>> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.DAY_CHANGES);
    if (!raw) return {};
    const all = JSON.parse(raw) as Record<string, Record<string, DayChange>>;
    return all[profileId] ?? {};
  } catch {
    return {};
  }
}

/**
 * Speichert alle Day Changes für ein Profil (überschreibt).
 */
async function saveDayChanges(profileId: string, changes: Record<string, DayChange>): Promise<void> {
  let all: Record<string, Record<string, DayChange>> = {};
  try {
    const raw = await AsyncStorage.getItem(KEYS.DAY_CHANGES);
    if (raw) all = JSON.parse(raw) as Record<string, Record<string, DayChange>>;
  } catch {
    // ignore
  }
  all[profileId] = { ...changes };
  await AsyncStorage.setItem(KEYS.DAY_CHANGES, JSON.stringify(all));
}

/**
 * Setzt einen Day Change für ein bestimmtes Datum.
 * Wird aufgerufen wenn Urlaub/Override/Swap gesetzt oder entfernt wird.
 * 
 * @param profileId - Profil-ID
 * @param dateISO - Datum im Format YYYY-MM-DD
 * @param originalCode - Der originale Schichtcode (aus dem Plan)
 * @param currentCode - Der aktuelle Schichtcode (nach Änderung)
 * @param reason - Grund der Änderung
 */
export async function setDayChange(
  profileId: string,
  dateISO: string,
  originalCode: ShiftType | null,
  currentCode: ShiftType | null,
  reason: 'vacation' | 'swap' | 'override'
): Promise<void> {
  const changes = await getDayChanges(profileId);
  changes[dateISO] = {
    originalCode,
    currentCode,
    reason,
    updatedAt: new Date().toISOString(),
  };
  await saveDayChanges(profileId, changes);
}

/**
 * Löscht einen Day Change (z.B. wenn Urlaub/Override entfernt wird).
 * Wenn der aktuelle Code wieder dem Original entspricht, wird der Eintrag entfernt.
 */
export async function clearDayChange(profileId: string, dateISO: string): Promise<void> {
  const changes = await getDayChanges(profileId);
  delete changes[dateISO];
  await saveDayChanges(profileId, changes);
}

// ─── Swap System (Iteration 10) ─────────────────────────────────────────────────

/**
 * Liest alle Tauschanfragen.
 */
async function getAllSwaps(): Promise<SwapRequest[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SWAPS);
    if (!raw) return [];
    return JSON.parse(raw) as SwapRequest[];
  } catch {
    return [];
  }
}

/**
 * Speichert alle Tauschanfragen.
 */
async function setAllSwaps(swaps: SwapRequest[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.SWAPS, JSON.stringify(swaps));
}

/**
 * Erstellt eine neue Tauschanfrage.
 * 
 * Bug Fix (Hotfix 10.1):
 * - #3: Datum-Validierung hinzugefügt
 */
export async function createSwapRequest(
  spaceId: string,
  requesterProfileId: string,
  date: string,
  shiftCode: ShiftType,
  message?: string
): Promise<SwapRequest> {
  // --- BUG FIX #3: Datum-Validierung ---
  if (!isValidISODate(date)) {
    throw new Error('Ungültiges Datumformat. Bitte YYYY-MM-DD verwenden.');
  }
  
  const swaps = await getAllSwaps();
  
  const newRequest: SwapRequest = {
    id: generateUUID(),
    spaceId,
    requesterProfileId,
    date,
    shiftCode,
    message,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  
  swaps.push(newRequest);
  await setAllSwaps(swaps);
  logInfo('Storage', 'createSwapRequest', { id: newRequest.id, spaceId, date, shiftCode });
  return newRequest;
}

/**
 * Gibt alle offenen Tauschanfragen für einen Space zurück.
 */
export async function getOpenSwapRequests(spaceId: string): Promise<SwapRequest[]> {
  const swaps = await getAllSwaps();
  return swaps.filter(s => s.spaceId === spaceId && s.status === 'open');
}

/**
 * Gibt alle Tauschanfragen eines Users zurück.
 */
export async function getMySwapRequests(requesterProfileId: string): Promise<SwapRequest[]> {
  const swaps = await getAllSwaps();
  return swaps.filter(s => s.requesterProfileId === requesterProfileId);
}

/**
 * Akzeptiert eine Tauschanfrage.
 * Tauscht die Shift-Codes beider Benutzer.
 * 
 * Bug Fixes (Hotfix 10.1):
 * - #1: Space-Mitgliedschaft wird geprüft
 * - #2: Kein automatisches X bei fehlendem Shift
 * - #3: Datum-Validierung
 */
export async function acceptSwapRequest(
  requestId: string,
  acceptorProfileId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const swaps = await getAllSwaps();
  const idx = swaps.findIndex(s => s.id === requestId);
  
  if (idx === -1) return { ok: false, reason: 'Anfrage nicht gefunden.' };
  
  const request = swaps[idx];
  if (request.status !== 'open') return { ok: false, reason: 'Anfrage ist nicht mehr offen.' };
  if (request.requesterProfileId === acceptorProfileId) {
    return { ok: false, reason: 'Du kannst nicht deine eigene Anfrage annehmen.' };
  }
  
  // --- BUG FIX #1: Space-Mitgliedschaft prüfen ---
  const spaces = await getSpaces();
  const space = spaces.find(s => s.id === request.spaceId);
  if (!space) {
    return { ok: false, reason: 'Space nicht gefunden.' };
  }
  
  const memberIds = space.memberProfiles.map(p => p.id);
  if (!memberIds.includes(acceptorProfileId)) {
    return { ok: false, reason: 'Du bist kein Mitglied dieses Teams.' };
  }
  if (!memberIds.includes(request.requesterProfileId)) {
    return { ok: false, reason: 'Anfrage-Team stimmt nicht überein.' };
  }
  
  // --- BUG FIX #3: Datum-Validierung ---
  if (!isValidISODate(request.date)) {
    return { ok: false, reason: 'Ungültiges Datumformat.' };
  }
  
  // Hole die Shift-Pläne beider Benutzer
  const allPlans = await getAllShiftPlans();
  const requesterPlan = allPlans[request.requesterProfileId];
  const acceptorPlan = allPlans[acceptorProfileId];
  
  if (!requesterPlan) return { ok: false, reason: 'Anfrager hat keinen Schichtplan.' };
  if (!acceptorPlan) return { ok: false, reason: 'Du hast keinen Schichtplan.' };
  
  // Finde die Shift-Einträge für das Datum
  const reqEntryIdx = requesterPlan.entries.findIndex(e => e.dateISO === request.date);
  const accEntryIdx = acceptorPlan.entries.findIndex(e => e.dateISO === request.date);
  
  // --- BUG FIX #2: Nur tauschen wenn beide einen Shift-Eintrag haben ---
  // MEDIUM: "Kein Schicht-Eintrag vorhanden" → Swap blockieren
  if (reqEntryIdx < 0) {
    return { ok: false, reason: 'Anfrager hat keinen Schicht-Eintrag für dieses Datum.' };
  }
  if (accEntryIdx < 0) {
    return { ok: false, reason: 'Du hast keinen Schicht-Eintrag für dieses Datum.' };
  }
  
  // Tausche die Codes (keine Auto-X mehr)
  const requesterCode = requesterPlan.entries[reqEntryIdx].code;
  const acceptorCode = acceptorPlan.entries[accEntryIdx].code;
  
  // --- Day Changes History schreiben für beide Benutzer ---
  // Requester: sein Original-Code wird zum neuen Code des Acceptors
  await setDayChange(
    request.requesterProfileId,
    request.date,
    requesterCode,
    acceptorCode,
    'swap'
  );
  // Acceptor: sein Original-Code wird zum neuen Code des Requesters
  await setDayChange(
    acceptorProfileId,
    request.date,
    acceptorCode,
    requesterCode,
    'swap'
  );

  requesterPlan.entries[reqEntryIdx].code = acceptorCode;
  acceptorPlan.entries[accEntryIdx].code = requesterCode;
  
  // --- HOTFIX 17.2: Status ERST schreiben (sicherer bei Crash) ---
  // Wenn Status-Write klappt aber Shift-Write crasht: User sieht "accepted",
  // Shifts sind noch nicht getauscht → manuell loesbar.
  // Umgekehrt (alte Reihenfolge) waere doppelter Tausch moeglich.
  swaps[idx] = {
    ...request,
    status: 'accepted',
    acceptedByProfileId: acceptorProfileId,
  };
  await setAllSwaps(swaps);

  // Danach Shifts tauschen
  allPlans[request.requesterProfileId] = requesterPlan;
  allPlans[acceptorProfileId] = acceptorPlan;
  await AsyncStorage.setItem(KEYS.SHIFTS, JSON.stringify(allPlans));

  logInfo('Storage', 'acceptSwapRequest', { requestId, acceptorProfileId, date: request.date });
  return { ok: true };
}

/**
 * Lehnt eine Tauschanfrage ab.
 */
export async function declineSwapRequest(
  requestId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const swaps = await getAllSwaps();
  const idx = swaps.findIndex(s => s.id === requestId);
  
  if (idx === -1) return { ok: false, reason: 'Anfrage nicht gefunden.' };
  if (swaps[idx].status !== 'open') return { ok: false, reason: 'Anfrage ist nicht mehr offen.' };
  
  swaps[idx] = { ...swaps[idx], status: 'declined' };
  await setAllSwaps(swaps);
  
  return { ok: true };
}

/**
 * Bricht eine eigene Tauschanfrage ab.
 */
export async function cancelSwapRequest(
  requestId: string,
  profileId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const swaps = await getAllSwaps();
  const idx = swaps.findIndex(s => s.id === requestId);
  
  if (idx === -1) return { ok: false, reason: 'Anfrage nicht gefunden.' };
  if (swaps[idx].requesterProfileId !== profileId) return { ok: false, reason: 'Nicht deine Anfrage.' };
  if (swaps[idx].status !== 'open') return { ok: false, reason: 'Anfrage ist nicht mehr offen.' };
  
  swaps[idx] = { ...swaps[idx], status: 'cancelled' };
  await setAllSwaps(swaps);
  
  return { ok: true };
}

/**
 * Validiert ISO-Datum "YYYY-MM-DD"
 */
export function isValidISODate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/**
 * Kandidaten für einen Tausch finden.
 * MVP: Nur User mit R/U/X am Datum dürfen tauschen.
 * NUR wenn der Shift tatsächlich eingetragen ist.
 */
export interface SwapCandidate {
  profileId: string;
  displayName: string;
  avatarUrl: string;
  shiftCode: ShiftType | null;
}

export async function getSwapCandidates(
  spaceId: string,
  date: string,
  excludeProfileId: string
): Promise<SwapCandidate[]> {
  const space = (await getSpaces()).find(s => s.id === spaceId);
  if (!space) return [];
  
  const allPlans = await getAllShiftPlans();
  const candidates: SwapCandidate[] = [];
  
  // Prüfe jedes Space-Mitglied
  for (const member of space.memberProfiles) {
    if (member.id === excludeProfileId) continue;
    
    const plan = allPlans[member.id];
    if (!plan) continue;
    
    const entry = plan.entries.find(e => e.dateISO === date);
    const code = entry?.code ?? null;
    
    // MVP-Regel: Nur R, U, X sind "frei" zum Tauschen - NUR wenn eingetragen!
    if (code === 'R' || code === 'U' || code === 'X') {
      candidates.push({
        profileId: member.id,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        shiftCode: code,
      });
    }
    // null bedeutet "kein Shift eingetragen" - das ist NICHT "frei"
  }
  
  return candidates;
}

// ─── Time Account: Space Rule Profile ────────────────────────────────────────
// Storage: Map { [spaceId]: SpaceRuleProfile } unter STORAGE_KEYS.TIME_ACCOUNT_SPACE_RULES

export async function getSpaceRuleProfile(spaceId: string): Promise<SpaceRuleProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIME_ACCOUNT_SPACE_RULES);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, SpaceRuleProfile>;
    return map[spaceId] ?? null;
  } catch {
    return null;
  }
}

export async function setSpaceRuleProfile(profile: SpaceRuleProfile): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIME_ACCOUNT_SPACE_RULES);
    const map: Record<string, SpaceRuleProfile> = raw ? JSON.parse(raw) : {};
    map[profile.spaceId] = profile;
    await AsyncStorage.setItem(STORAGE_KEYS.TIME_ACCOUNT_SPACE_RULES, JSON.stringify(map));
    logInfo('Storage', 'setSpaceRuleProfile', { spaceId: profile.spaceId });
  } catch (e) {
    logError('Storage', 'setSpaceRuleProfile failed', e);
  }
}

// ─── Time Account: User Profile ──────────────────────────────────────────────
// Storage: Map { [profileId]: UserTimeAccountProfile } unter STORAGE_KEYS.TIME_ACCOUNT_USER

export async function getUserTimeAccountProfile(
  profileId: string,
): Promise<UserTimeAccountProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIME_ACCOUNT_USER);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, UserTimeAccountProfile>;
    return map[profileId] ?? null;
  } catch {
    return null;
  }
}

export async function setUserTimeAccountProfile(
  profile: UserTimeAccountProfile,
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIME_ACCOUNT_USER);
    const map: Record<string, UserTimeAccountProfile> = raw ? JSON.parse(raw) : {};
    map[profile.profileId] = profile;
    await AsyncStorage.setItem(STORAGE_KEYS.TIME_ACCOUNT_USER, JSON.stringify(map));
    logInfo('Storage', 'setUserTimeAccountProfile', { profileId: profile.profileId });
  } catch (e) {
    logError('Storage', 'setUserTimeAccountProfile failed', e);
  }
}

// ─── Time Account: UI Dismiss State ──────────────────────────────────────────
// Storage: Map { [profileId]: TimeAccountUiState } unter STORAGE_KEYS.TIME_ACCOUNT_UI

export async function getTimeAccountUiState(
  profileId: string,
): Promise<TimeAccountUiState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIME_ACCOUNT_UI);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, TimeAccountUiState>;
    return map[profileId] ?? null;
  } catch {
    return null;
  }
}

export async function setTimeAccountUiState(state: TimeAccountUiState): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIME_ACCOUNT_UI);
    const map: Record<string, TimeAccountUiState> = raw ? JSON.parse(raw) : {};
    map[state.profileId] = state;
    await AsyncStorage.setItem(STORAGE_KEYS.TIME_ACCOUNT_UI, JSON.stringify(map));
  } catch (e) {
    logError('Storage', 'setTimeAccountUiState failed', e);
  }
}

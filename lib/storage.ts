import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  UserProfile,
  Space,
  MemberSnapshot,
  MemberLifecycleEntry,
  UserShiftPlan,
  ShiftType,
  ShiftEntry,
  SwapRequest,
  UserTimeClockConfig,
  UserTimeClockShiftSettings,
  TimeClockEvent,
  RegularShiftCode,
  TimeClockEventType,
} from '../types';
import type { SpaceRuleProfile, UserTimeAccountProfile, TimeAccountUiState } from '../types/timeAccount';
import { getHolidayMap, type Holiday } from '../data/holidays';
import { diffDaysUTC, shiftCodeAtDate } from './shiftEngine';
import { logInfo, logWarn, logError } from './log';
import type { VacationStrategy } from './strategyTypes';
import { buildVacationStrategies, resolveOriginalShiftCodeForDate } from './strategyEngine';
import { fallbackAvatarSeed } from './avatarSeed';

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
  // ── Time Clock (Stempeluhr) ──
  TIMECLOCK_CONFIG: 'yasa.timeclock.config.v1',
  TIMECLOCK_EVENTS: 'yasa.timeclock.events.v1',
  TIMECLOCK_TEST_PROMPT: 'yasa.timeclock.testPrompt.v1',
  TIMECLOCK_UI: 'yasa.timeclock.ui.v1',
  TIMECLOCK_QA_CALENDAR: 'yasa.timeclock.qaCalendar.v1',
  VACATION_SHORTSHIFT_REMINDERS: 'yasa.vacation.shortShiftReminders.v1',
  STRATEGY_HOURS_BANK: 'yasa.strategy.hoursBank.v1',
  STRATEGY_HOURS_JOURNAL: 'yasa.strategy.hoursJournal.v1',
  SHIFT_COLOR_OVERRIDES: 'yasa.shiftColorOverrides.v1',
} as const;

/** Internal alias for backward compat within this module */
const KEYS = STORAGE_KEYS;
const RETENTION = {
  SHORTSHIFT_CONFIRMED_DAYS: 120,
} as const;
const PROFILE_EDIT_MAX = 1;

// ─── Serialized Writes (Scale-Readiness P0) ─────────────────────────────────
// Verhindert konkurrierende read-modify-write Rennen pro Storage-Key.
const storageWriteQueues = new Map<string, Promise<void>>();

async function runSerializedWrite<T>(storageKey: string, operation: () => Promise<T>): Promise<T> {
  const previous = storageWriteQueues.get(storageKey) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const chained = previous.catch(() => undefined).then(() => current);
  storageWriteQueues.set(storageKey, chained);

  try {
    await previous.catch(() => undefined);
    return await operation();
  } finally {
    releaseCurrent();
    if (storageWriteQueues.get(storageKey) === chained) {
      storageWriteQueues.delete(storageKey);
    }
  }
}

// ─── Profile ───────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.PROFILE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfile;
    return {
      ...parsed,
      profileEditCount: Number(parsed.profileEditCount ?? 0),
      profileEditLocked: Boolean(parsed.profileEditLocked ?? false),
    };
  } catch {
    return null;
  }
}

export async function setProfile(profile: UserProfile): Promise<void> {
  logInfo('Storage', 'createProfile', { id: profile.id, name: profile.displayName });
  const normalized: UserProfile = {
    ...profile,
    profileEditCount: Number(profile.profileEditCount ?? 0),
    profileEditLocked: Boolean(profile.profileEditLocked ?? false),
  };
  await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(normalized));
}

export async function clearProfile(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.PROFILE);
}

export async function updateProfileOnce(input: {
  displayName: string;
  avatarUrl: string;
}): Promise<{ ok: true; profile: UserProfile } | { ok: false; reason: string }> {
  const existing = await getProfile();
  if (!existing) return { ok: false, reason: 'Kein Profil gefunden.' };
  if (existing.kind === 'ghost') return { ok: false, reason: 'Ghost-Profile können nicht bearbeitet werden.' };
  if (existing.profileEditLocked || (existing.profileEditCount ?? 0) >= PROFILE_EDIT_MAX) {
    return { ok: false, reason: 'Profilbearbeitung ist bereits gesperrt.' };
  }
  const nextName = input.displayName.trim();
  const nextAvatar = input.avatarUrl.trim().toLowerCase();
  if (nextName.length < 3) return { ok: false, reason: 'Name muss mindestens 3 Zeichen lang sein.' };
  if (!nextAvatar) return { ok: false, reason: 'Avatar-Seed fehlt.' };

  const updatedProfile: UserProfile = {
    ...existing,
    displayName: nextName,
    avatarUrl: nextAvatar,
    profileEditCount: (existing.profileEditCount ?? 0) + 1,
    profileEditLocked: true,
  };

  await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(updatedProfile));

  const spaces = await getSpaces();
  const nextSpaces = spaces.map((space) => {
    const nextMembers = space.memberProfiles.map((member) =>
      member.id === updatedProfile.id
        ? { ...member, displayName: updatedProfile.displayName, avatarUrl: updatedProfile.avatarUrl }
        : member
    );
    const ownerDisplayName =
      space.ownerProfileId === updatedProfile.id ? updatedProfile.displayName : space.ownerDisplayName;
    return { ...space, ownerDisplayName, memberProfiles: nextMembers };
  });
  await setSpaces(nextSpaces);

  return { ok: true, profile: updatedProfile };
}

export type ShiftColorOverrideMap = Partial<Record<ShiftType, string>>;

function normalizeHexColor(input: string): string | null {
  const value = input.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(value)) return null;
  return value;
}

export async function getShiftColorOverrides(profileId: string): Promise<ShiftColorOverrideMap> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SHIFT_COLOR_OVERRIDES);
    if (!raw) return {};
    const map = JSON.parse(raw) as Record<string, ShiftColorOverrideMap>;
    return map[profileId] ?? {};
  } catch {
    return {};
  }
}

export async function setShiftColorOverrides(
  profileId: string,
  overrides: ShiftColorOverrideMap
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SHIFT_COLOR_OVERRIDES);
    const map: Record<string, ShiftColorOverrideMap> = raw ? JSON.parse(raw) : {};
    const sanitized: ShiftColorOverrideMap = {};
    for (const [code, value] of Object.entries(overrides)) {
      const valid = normalizeHexColor(value ?? '');
      if (valid) sanitized[code as ShiftType] = valid;
    }
    map[profileId] = sanitized;
    await AsyncStorage.setItem(KEYS.SHIFT_COLOR_OVERRIDES, JSON.stringify(map));
  } catch (e) {
    logError('Storage', 'setShiftColorOverrides failed', e);
  }
}

export async function resetShiftColorOverrides(profileId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SHIFT_COLOR_OVERRIDES);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, ShiftColorOverrideMap>;
    delete map[profileId];
    await AsyncStorage.setItem(KEYS.SHIFT_COLOR_OVERRIDES, JSON.stringify(map));
  } catch (e) {
    logError('Storage', 'resetShiftColorOverrides failed', e);
  }
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
    const ownerName = s.ownerDisplayName ?? 'Unbekannt';
    memberProfiles = [
      {
        id: s.ownerProfileId,
        displayName: ownerName,
        avatarUrl: fallbackAvatarSeed(s.ownerProfileId, ownerName),
      },
    ];
  }

  // memberHistory: on-read normalisieren + aus memberProfiles seeden (backward compat)
  let memberHistory: MemberLifecycleEntry[] = Array.isArray(s.memberHistory) ? s.memberHistory : [];
  if (memberHistory.length === 0 && memberProfiles.length > 0) {
    // Seed aus bestehenden memberProfiles – einmalig beim ersten on-read nach Feature-Einführung.
    // Alle existierenden Mitglieder erhalten joinedAt = space.createdAt als beste Schätzung.
    const seedTime = s.createdAt ?? new Date().toISOString();
    const ownerId = s.ownerProfileId ?? memberProfiles[0]?.id ?? '';
    memberHistory = memberProfiles.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      joinedAt: seedTime,
      joinedViaProfileId: ownerId,
      active: true,
    }));
  }

  return { ...s, memberProfileIds, coAdminProfileIds, memberProfiles, memberHistory };
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

  // Lifecycle history update
  const now = new Date().toISOString();
  const existingHistory: MemberLifecycleEntry[] = space.memberHistory ?? [];
  const histEntry = existingHistory.find((h) => h.id === profile.id);
  const updatedHistory: MemberLifecycleEntry[] = histEntry
    ? existingHistory.map((h) =>
        h.id === profile.id ? { ...h, active: true, removedAt: undefined } : h
      )
    : [
        ...existingHistory,
        {
          id: profile.id,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          joinedAt: now,
          joinedViaProfileId: space.ownerProfileId,
          active: true,
        },
      ];

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
    memberHistory: updatedHistory,
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
    /**
     * Avatar-Seed des Hosts, seit R2 im QR-Payload mitgeliefert.
     * Wenn vorhanden: direkt in den Owner-Snapshot übernehmen, kein Backend-Sync
     * nötig damit Gerät B den korrekten Avatar sofort sieht.
     * Wenn fehlt (Legacy-QR): Fallback-Seed verwenden, Sync löst es später auf.
     */
    ownerAvatarUrl?: string;
    inviteToken: string;
  },
  profile: UserProfile
): Promise<{ ok: true; space: Space } | { ok: false; reason: string }> {
  const spaces = await getSpaces();

  // Kanonischer Avatar-Seed für den Owner: QR-Wert bevorzugen, dann Fallback
  const ownerAvatarResolved =
    payload.ownerAvatarUrl && payload.ownerAvatarUrl.trim().length > 0
      ? payload.ownerAvatarUrl.trim().toLowerCase()
      : fallbackAvatarSeed(payload.ownerProfileId, payload.ownerDisplayName);

  // Prüfe ob Space bereits lokal existiert
  const existingIdx = spaces.findIndex((s) => s.id === payload.spaceId);
  if (existingIdx !== -1) {
    // Space existiert bereits - prüfe Token und füge Member hinzu
    const existing = spaces[existingIdx];
    if (existing.inviteToken !== payload.inviteToken) {
      return { ok: false, reason: 'Ungültiges Einlade-Token.' };
    }

    let changed = false;
    let updatedSpace = existing;

    // Member hinzufügen falls noch nicht vorhanden
    if (!existing.memberProfileIds.includes(profile.id)) {
      updatedSpace = {
        ...updatedSpace,
        memberProfileIds: [...updatedSpace.memberProfileIds, profile.id],
        memberProfiles: [
          ...updatedSpace.memberProfiles.filter((m) => m.id !== profile.id),
          { id: profile.id, displayName: profile.displayName, avatarUrl: profile.avatarUrl },
        ],
      };
      changed = true;
    }

    // Owner-Snapshot auffrischen wenn wir jetzt einen echten Seed haben
    // und der gespeicherte noch ein Fallback war (z.B. Legacy-QR-Scan).
    const ownerInExisting = updatedSpace.memberProfiles.find((m) => m.id === payload.ownerProfileId);
    if (
      ownerInExisting &&
      payload.ownerAvatarUrl &&
      payload.ownerAvatarUrl.trim().length > 0 &&
      ownerInExisting.avatarUrl !== ownerAvatarResolved
    ) {
      updatedSpace = {
        ...updatedSpace,
        memberProfiles: updatedSpace.memberProfiles.map((m) =>
          m.id === payload.ownerProfileId
            ? { ...m, avatarUrl: ownerAvatarResolved }
            : m
        ),
      };
      changed = true;
    }

    // Lifecycle history: joining member hinzufügen wenn nicht vorhanden / reaktivieren
    const existingHistory: MemberLifecycleEntry[] = updatedSpace.memberHistory ?? [];
    const histEntry = existingHistory.find((h) => h.id === profile.id);
    if (!histEntry) {
      const now = new Date().toISOString();
      updatedSpace = {
        ...updatedSpace,
        memberHistory: [
          ...existingHistory,
          {
            id: profile.id,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            joinedAt: now,
            joinedViaProfileId: payload.ownerProfileId,
            active: true,
          },
        ],
      };
      changed = true;
    } else if (!histEntry.active) {
      // Wieder beigetreten nach Entfernung
      updatedSpace = {
        ...updatedSpace,
        memberHistory: existingHistory.map((h) =>
          h.id === profile.id ? { ...h, active: true, removedAt: undefined } : h
        ),
      };
      changed = true;
    }

    if (changed) {
      spaces[existingIdx] = updatedSpace;
      await setSpaces(spaces);
    }

    await setCurrentSpaceId(payload.spaceId);
    logInfo('Storage', 'importSpaceFromInvite:existing', { spaceId: payload.spaceId, profileId: profile.id });
    return { ok: true, space: spaces[existingIdx] };
  }

  // Space existiert nicht - neu erstellen
  const joinNow = new Date().toISOString();
  const newMemberHistory: MemberLifecycleEntry[] = [
    {
      id: payload.ownerProfileId,
      displayName: payload.ownerDisplayName,
      avatarUrl: ownerAvatarResolved,
      joinedAt: joinNow, // exakte Erstellzeit des Space unbekannt vom Gast aus
      joinedViaProfileId: payload.ownerProfileId, // Host ist selbst beigetreten
      active: true,
    },
    {
      id: profile.id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      joinedAt: joinNow,
      joinedViaProfileId: payload.ownerProfileId, // via Host (QR enthält keine Co-Admin-Info)
      active: true,
    },
  ];

  const newSpace: Space = {
    id: payload.spaceId,
    name: payload.name,
    createdAt: joinNow,
    ownerProfileId: payload.ownerProfileId,
    ownerDisplayName: payload.ownerDisplayName,
    inviteToken: payload.inviteToken,
    coAdminProfileIds: [],
    memberProfileIds: [payload.ownerProfileId, profile.id],
    memberProfiles: [
      {
        id: payload.ownerProfileId,
        displayName: payload.ownerDisplayName,
        // Use QR-provided seed if available; fallback for legacy QR codes.
        avatarUrl: ownerAvatarResolved,
      },
      { id: profile.id, displayName: profile.displayName, avatarUrl: profile.avatarUrl },
    ],
    memberHistory: newMemberHistory,
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
  try {
    const { pushShiftPlanToBackend } = await import('./backend/shiftSync');
    await pushShiftPlanToBackend(plan);
  } catch (e) {
    logWarn('Backend', 'pushShiftPlanToBackend failed', { profileId: plan.profileId, error: String(e) });
  }
}

/**
 * Gibt den Schichtcode für ein Profil an einem bestimmten Datum zurück.
 * null wenn kein Plan vorhanden oder das Datum vor plan.startDateISO liegt.
 *
 * Lookup-Strategie (zwei Stufen, identisch für Host und Member):
 *   1. Fast path: plan.entries (vorberechnetes Array) → O(n) Suche.
 *   2. Fallback: shiftCodeAtDate(plan.startDateISO, plan.pattern, dateISO)
 *      → deckt Daten außerhalb des vorberechneten Fensters ab (z.B. wenn
 *        generatedUntilISO veraltet ist und neue Daten nicht mehr in entries
 *        stehen — häufig bei Member-Profilen, die den Plan selten neu speichern).
 */
export async function getShiftForDate(
  profileId: string,
  dateISO: string
): Promise<ShiftType | null> {
  const overrides = await getShiftOverrides(profileId);
  if (dateISO in overrides) return overrides[dateISO] ?? null;
  const plan = await getShiftPlan(profileId);
  if (!plan) return null;
  // Fast path: vorberechnete Einträge
  const entry = plan.entries.find((e) => e.dateISO === dateISO);
  if (entry !== undefined) return entry.code;
  // Fallback: Zyklus-Formel (behandelt Daten außerhalb des generierten Fensters)
  return shiftCodeAtDate(plan.startDateISO, plan.pattern, dateISO);
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
 * Merges remote ghost definitions into local ghost storage for a space.
 *
 * Called after pullGhostsForSpace to apply backend ghost metadata locally.
 * Merge semantics:
 *   - Remote ghost (by id) wins on metadata (remote is authoritative).
 *   - Local-only ghosts (not in remote, e.g. pending push) are preserved.
 *   - New remote ghosts are added.
 *   - Empty remote → no-op (preserves existing local ghosts).
 *
 * This is the client-side complement to pushGhostsForSpace / pullGhostsForSpace
 * in lib/backend/ghostSync.ts.
 */
export async function mergeRemoteGhosts(
  spaceId: string,
  remoteGhosts: UserProfile[]
): Promise<void> {
  if (remoteGhosts.length === 0) return;
  const all = await getAllGhosts();
  const localGhosts = all[spaceId] ?? [];

  // Build map keyed by ghost id; local first, then remote wins on overlap
  const byId = new Map<string, UserProfile>(localGhosts.map((g) => [g.id, g]));
  for (const remote of remoteGhosts) {
    if (!remote.id) continue;
    byId.set(remote.id, {
      ...(byId.get(remote.id) ?? {}),
      ...remote,
    });
  }

  all[spaceId] = Array.from(byId.values());
  await setAllGhosts(all);
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
    await clearShortShiftVacationReminderForDate(profileId, dateISO);
  } else {
    newDays = [...days, dateISO].sort();
    // Urlaub gesetzt: Day Change schreiben
    await setDayChange(profileId, dateISO, originalCode, 'U', 'vacation');
    if (originalCode === 'KS' || originalCode === 'KN') {
      await ensureShortShiftVacationReminder(profileId, dateISO, originalCode);
    }
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

export interface ShortShiftVacationReminder {
  id: string;
  profileId: string;
  dateISO: string;
  shiftCode: 'KS' | 'KN';
  createdAt: string;
  confirmedAt: string | null;
  deferredUntilISO?: string | null;
}

export interface StrategyHoursJournalEntry {
  id: string;
  profileId: string;
  deltaHours: number;
  reason: 'strategy_hours_apply' | 'manual_adjustment';
  referenceDateISO?: string;
  createdAt: string;
}

function normalizeHours(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, value) * 100) / 100;
}

async function appendStrategyHoursJournal(
  profileId: string,
  entry: Omit<StrategyHoursJournalEntry, 'id' | 'profileId' | 'createdAt'>
): Promise<void> {
  await runSerializedWrite(KEYS.STRATEGY_HOURS_JOURNAL, async () => {
    const raw = await AsyncStorage.getItem(KEYS.STRATEGY_HOURS_JOURNAL);
    const map: Record<string, StrategyHoursJournalEntry[]> = raw ? JSON.parse(raw) : {};
    const list = map[profileId] ?? [];
    list.push({
      id: generateUUID(),
      profileId,
      createdAt: new Date().toISOString(),
      ...entry,
    });
    map[profileId] = list;
    await AsyncStorage.setItem(KEYS.STRATEGY_HOURS_JOURNAL, JSON.stringify(map));
  });
}

export async function getStrategyHoursBalance(profileId: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.STRATEGY_HOURS_BANK);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, { availableHours: number; updatedAt: string }>;
      if (map[profileId]) {
        return normalizeHours(Number(map[profileId].availableHours));
      }
    }
  } catch {
    // fallback below
  }

  const profile = await getUserTimeAccountProfile(profileId);
  return normalizeHours(profile?.openingBalanceHours ?? 0);
}

export async function setStrategyHoursBalance(
  profileId: string,
  hours: number,
  reason: StrategyHoursJournalEntry['reason'] = 'manual_adjustment',
  referenceDateISO?: string
): Promise<number> {
  const normalized = normalizeHours(hours);
  await runSerializedWrite(KEYS.STRATEGY_HOURS_BANK, async () => {
    const raw = await AsyncStorage.getItem(KEYS.STRATEGY_HOURS_BANK);
    const map: Record<string, { availableHours: number; updatedAt: string }> = raw ? JSON.parse(raw) : {};
    map[profileId] = {
      availableHours: normalized,
      updatedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(KEYS.STRATEGY_HOURS_BANK, JSON.stringify(map));
  });
  await appendStrategyHoursJournal(profileId, {
    deltaHours: 0,
    reason,
    referenceDateISO,
  });
  return normalized;
}

/**
 * Berechnet Strategie-Vorschläge für die nächsten 12 Monate
 */
export async function calculateVacationStrategy(profileId: string): Promise<VacationStrategy[]> {
  const plan = await getShiftPlan(profileId);
  if (!plan) return [];
  const [vacationDays, overrides, timeClockConfig] = await Promise.all([
    getVacationDays(profileId),
    getShiftOverrides(profileId),
    getTimeClockConfigOrDefault(profileId),
  ]);
  return buildVacationStrategies({
    shiftPlan: plan,
    vacationDays,
    overrides,
    timeClockConfig,
  });
}

/**
 * Übernimmt einen Strategie-Vorschlag und setzt Urlaubstage
 */
export async function applyVacationStrategy(profileId: string, strategy: VacationStrategy): Promise<string[]> {
  if (strategy.strategyType === 'hours') {
    const required = normalizeHours(strategy.requiredHours ?? 0);
    if (required <= 0) {
      throw new Error('Ungültige Stundenstrategie: benötigte Stunden fehlen.');
    }
    const before = await getStrategyHoursBalance(profileId);
    if (before < required) {
      throw new Error(
        `Nicht genug Stunden verfügbar (${before.toFixed(2).replace('.', ',')} h verfügbar, ${required.toFixed(2).replace('.', ',')} h benötigt).`
      );
    }
    for (const dateISO of strategy.urlaubstage) {
      await setShiftOverride(profileId, dateISO, 'X');
    }
    const after = normalizeHours(before - required);
    await runSerializedWrite(KEYS.STRATEGY_HOURS_BANK, async () => {
      const raw = await AsyncStorage.getItem(KEYS.STRATEGY_HOURS_BANK);
      const map: Record<string, { availableHours: number; updatedAt: string }> = raw ? JSON.parse(raw) : {};
      map[profileId] = {
        availableHours: after,
        updatedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(KEYS.STRATEGY_HOURS_BANK, JSON.stringify(map));
    });
    await appendStrategyHoursJournal(profileId, {
      deltaHours: -required,
      reason: 'strategy_hours_apply',
      referenceDateISO: strategy.urlaubstage[0],
    });
    return getVacationDays(profileId);
  }
  const [days, plan] = await Promise.all([
    getVacationDays(profileId),
    getShiftPlan(profileId),
  ]);
  const existing = new Set(days);
  const newDates = strategy.urlaubstage.filter((d) => !existing.has(d));
  const newDays = [...new Set([...days, ...strategy.urlaubstage])].sort();

  // Strategy-Urlaub muss dieselbe Historie schreiben wie manuelles Toggle.
  for (const dateISO of newDates) {
    const originalCode = resolveOriginalShiftCodeForDate(plan, dateISO);
    await setDayChange(profileId, dateISO, originalCode, 'U', 'vacation');
    if (originalCode === 'KS' || originalCode === 'KN') {
      await ensureShortShiftVacationReminder(profileId, dateISO, originalCode);
    }
  }

  await saveVacationDays(profileId, newDays);
  return newDays;
}

type ReminderStore = Record<string, ShortShiftVacationReminder[]>;

async function getAllShortShiftVacationReminders(): Promise<ReminderStore> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.VACATION_SHORTSHIFT_REMINDERS);
    if (!raw) return {};
    return JSON.parse(raw) as ReminderStore;
  } catch {
    return {};
  }
}

async function saveAllShortShiftVacationReminders(all: ReminderStore): Promise<void> {
  await runSerializedWrite(KEYS.VACATION_SHORTSHIFT_REMINDERS, async () => {
    await AsyncStorage.setItem(KEYS.VACATION_SHORTSHIFT_REMINDERS, JSON.stringify(all));
  });
}

async function ensureShortShiftVacationReminder(
  profileId: string,
  dateISO: string,
  shiftCode: 'KS' | 'KN'
): Promise<void> {
  const all = await getAllShortShiftVacationReminders();
  const current = all[profileId] ?? [];
  const exists = current.some((r) => r.dateISO === dateISO && r.confirmedAt === null);
  if (exists) return;
  current.push({
    id: generateUUID(),
    profileId,
    dateISO,
    shiftCode,
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    deferredUntilISO: null,
  });
  current.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  all[profileId] = current;
  await saveAllShortShiftVacationReminders(all);
}

async function clearShortShiftVacationReminderForDate(profileId: string, dateISO: string): Promise<void> {
  const all = await getAllShortShiftVacationReminders();
  const current = all[profileId] ?? [];
  const filtered = current.filter((r) => r.dateISO !== dateISO);
  if (filtered.length === current.length) return;
  all[profileId] = filtered;
  await saveAllShortShiftVacationReminders(all);
}

export async function getOpenShortShiftVacationReminders(profileId: string): Promise<ShortShiftVacationReminder[]> {
  const today = todayISO();
  const all = await getAllShortShiftVacationReminders();
  const current = all[profileId] ?? [];

  // Scale-Readiness P2: bestaetigte Reminder begrenzt auf ein Retention-Fenster halten.
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION.SHORTSHIFT_CONFIRMED_DAYS);
  const confirmedCutoffISO = cutoffDate.toISOString();
  const compacted = current.filter((r) => {
    if (r.confirmedAt === null) return true;
    return r.confirmedAt >= confirmedCutoffISO;
  });
  if (compacted.length !== current.length) {
    all[profileId] = compacted;
    await saveAllShortShiftVacationReminders(all);
  }

  const effective = compacted;
  return effective
    .filter((r) => {
      if (r.confirmedAt !== null) return false;
      const daysUntil = diffDaysUTC(today, r.dateISO);
      const isUrgent = daysUntil <= 7;
      if (isUrgent) return true;
      const deferredUntilISO = r.deferredUntilISO ?? null;
      if (!deferredUntilISO) return true;
      return deferredUntilISO <= today;
    })
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}

export async function confirmShortShiftVacationReminder(profileId: string, reminderId: string): Promise<void> {
  const all = await getAllShortShiftVacationReminders();
  const current = all[profileId] ?? [];
  const idx = current.findIndex((r) => r.id === reminderId);
  if (idx < 0) return;
  current[idx] = {
    ...current[idx],
    confirmedAt: new Date().toISOString(),
    deferredUntilISO: null,
  };
  all[profileId] = current;
  await saveAllShortShiftVacationReminders(all);
}

export async function snoozeShortShiftVacationReminder(profileId: string, reminderId: string): Promise<void> {
  const all = await getAllShortShiftVacationReminders();
  const current = all[profileId] ?? [];
  const idx = current.findIndex((r) => r.id === reminderId);
  if (idx < 0) return;

  const today = todayISO();
  const daysUntil = diffDaysUTC(today, current[idx].dateISO);
  if (daysUntil <= 7) return;

  const tomorrow = formatDateISO(new Date(Date.now() + 24 * 60 * 60 * 1000));
  current[idx] = {
    ...current[idx],
    deferredUntilISO: tomorrow,
  };
  all[profileId] = current;
  await saveAllShortShiftVacationReminders(all);
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
  await runSerializedWrite(KEYS.SHIFT_OVERRIDES, async () => {
    let all: Record<string, Record<string, ShiftType>> = {};
    try {
      const raw = await AsyncStorage.getItem(KEYS.SHIFT_OVERRIDES);
      if (raw) all = JSON.parse(raw) as Record<string, Record<string, ShiftType>>;
    } catch {
      // ignore
    }
    all[profileId] = { ...overrides };
    await AsyncStorage.setItem(KEYS.SHIFT_OVERRIDES, JSON.stringify(all));
  });
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

function compactDayChanges(changes: Record<string, DayChange>): Record<string, DayChange> {
  const compacted: Record<string, DayChange> = {};
  for (const [dateISO, change] of Object.entries(changes)) {
    // Redundante History-Einträge ohne effektive Änderung entfernen.
    if (change.currentCode === change.originalCode) continue;
    compacted[dateISO] = change;
  }
  return compacted;
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
    const current = all[profileId] ?? {};
    const compacted = compactDayChanges(current);
    if (Object.keys(compacted).length !== Object.keys(current).length) {
      await saveDayChanges(profileId, compacted);
    }
    return compacted;
  } catch {
    return {};
  }
}

/**
 * Speichert alle Day Changes für ein Profil (überschreibt).
 */
async function saveDayChanges(profileId: string, changes: Record<string, DayChange>): Promise<void> {
  await runSerializedWrite(KEYS.DAY_CHANGES, async () => {
    let all: Record<string, Record<string, DayChange>> = {};
    try {
      const raw = await AsyncStorage.getItem(KEYS.DAY_CHANGES);
      if (raw) all = JSON.parse(raw) as Record<string, Record<string, DayChange>>;
    } catch {
      // ignore
    }
    all[profileId] = { ...changes };
    await AsyncStorage.setItem(KEYS.DAY_CHANGES, JSON.stringify(all));
  });
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

// ─── Time Clock (Stempeluhr) ────────────────────────────────────────────────

function defaultTimeClockShiftSettings(): UserTimeClockShiftSettings {
  return {
    F: { startTime: '06:00', endTime: '14:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
    S: { startTime: '14:00', endTime: '22:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
    N: { startTime: '22:00', endTime: '06:00', paidFlexMinutes: 15, postShiftGraceMinutes: 30 },
    KS: { startTime: '16:00', endTime: '22:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
    KN: { startTime: '00:00', endTime: '06:00', paidFlexMinutes: 15, postShiftGraceMinutes: 30 },
    T: { startTime: '08:00', endTime: '16:00', paidFlexMinutes: 15, postShiftGraceMinutes: 15 },
  };
}

function normalizeTimeHHMM(input: string, fallback = '00:00'): string {
  const digits = input.replace(/\D/g, '').slice(0, 4);
  if (digits.length === 0) return fallback;

  let hour = 0;
  let minute = 0;
  if (digits.length <= 2) {
    hour = Number(digits);
  } else if (digits.length === 3) {
    hour = Number(digits.slice(0, 1));
    minute = Number(digits.slice(1, 3));
  } else {
    hour = Number(digits.slice(0, 2));
    minute = Number(digits.slice(2, 4));
  }

  const clampedHour = Math.max(0, Math.min(23, Number.isFinite(hour) ? hour : 0));
  const clampedMinute = Math.max(0, Math.min(59, Number.isFinite(minute) ? minute : 0));
  return `${String(clampedHour).padStart(2, '0')}:${String(clampedMinute).padStart(2, '0')}`;
}

function sanitizeShiftWindow(window: {
  startTime: string;
  endTime: string;
  paidFlexMinutes: number;
  postShiftGraceMinutes: number;
}) {
  return {
    startTime: normalizeTimeHHMM(window.startTime, '00:00'),
    endTime: normalizeTimeHHMM(window.endTime, '00:00'),
    paidFlexMinutes: Math.max(0, Math.min(180, Number(window.paidFlexMinutes) || 0)),
    postShiftGraceMinutes: Math.max(0, Math.min(180, Number(window.postShiftGraceMinutes) || 0)),
  };
}

function sanitizeTimeClockConfig(config: UserTimeClockConfig): UserTimeClockConfig {
  const defaults = defaultTimeClockShiftSettings();
  return {
    profileId: config.profileId,
    updatedAt: config.updatedAt,
    shiftSettings: {
      F: sanitizeShiftWindow(config.shiftSettings?.F ?? defaults.F),
      S: sanitizeShiftWindow(config.shiftSettings?.S ?? defaults.S),
      N: sanitizeShiftWindow(config.shiftSettings?.N ?? defaults.N),
      KS: sanitizeShiftWindow(config.shiftSettings?.KS ?? defaults.KS),
      KN: sanitizeShiftWindow(config.shiftSettings?.KN ?? defaults.KN),
      T: sanitizeShiftWindow(config.shiftSettings?.T ?? defaults.T),
    },
  };
}

export async function getTimeClockConfig(profileId: string): Promise<UserTimeClockConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIMECLOCK_CONFIG);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, UserTimeClockConfig>;
    const config = map[profileId] ?? null;
    return config ? sanitizeTimeClockConfig(config) : null;
  } catch {
    return null;
  }
}

export async function getTimeClockConfigOrDefault(profileId: string): Promise<UserTimeClockConfig> {
  const existing = await getTimeClockConfig(profileId);
  if (existing) return existing;
  return {
    profileId,
    shiftSettings: defaultTimeClockShiftSettings(),
    updatedAt: new Date().toISOString(),
  };
}

export async function setTimeClockConfig(config: UserTimeClockConfig): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIMECLOCK_CONFIG);
    const map: Record<string, UserTimeClockConfig> = raw ? JSON.parse(raw) : {};
    map[config.profileId] = sanitizeTimeClockConfig({
      ...config,
      updatedAt: new Date().toISOString(),
    });
    await AsyncStorage.setItem(STORAGE_KEYS.TIMECLOCK_CONFIG, JSON.stringify(map));
    logInfo('Storage', 'setTimeClockConfig', { profileId: config.profileId });
  } catch (e) {
    logError('Storage', 'setTimeClockConfig failed', e);
  }
}

export async function getTimeClockEvents(profileId: string): Promise<TimeClockEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIMECLOCK_EVENTS);
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, TimeClockEvent[]>;
    const events = map[profileId] ?? [];
    const compacted = compactTimeClockEvents(events);
    if (compacted.length !== events.length) {
      await runSerializedWrite(STORAGE_KEYS.TIMECLOCK_EVENTS, async () => {
        const latestRaw = await AsyncStorage.getItem(STORAGE_KEYS.TIMECLOCK_EVENTS);
        const latestMap: Record<string, TimeClockEvent[]> = latestRaw ? JSON.parse(latestRaw) : {};
        const latestEvents = latestMap[profileId] ?? [];
        const latestCompacted = compactTimeClockEvents(latestEvents);
        if (latestCompacted.length !== latestEvents.length) {
          latestMap[profileId] = latestCompacted;
          await AsyncStorage.setItem(STORAGE_KEYS.TIMECLOCK_EVENTS, JSON.stringify(latestMap));
        }
      });
    }
    return [...compacted].sort((a, b) => b.timestampISO.localeCompare(a.timestampISO));
  } catch {
    return [];
  }
}

export async function addTimeClockEvent(
  profileId: string,
  input: Omit<TimeClockEvent, 'id' | 'profileId' | 'createdAt'>
): Promise<TimeClockEvent> {
  const event: TimeClockEvent = {
    id: generateUUID(),
    profileId,
    createdAt: new Date().toISOString(),
    ...input,
  };
  try {
    await runSerializedWrite(STORAGE_KEYS.TIMECLOCK_EVENTS, async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIMECLOCK_EVENTS);
      const map: Record<string, TimeClockEvent[]> = raw ? JSON.parse(raw) : {};
      const list = map[profileId] ?? [];
      list.push(event);
      map[profileId] = list;
      await AsyncStorage.setItem(STORAGE_KEYS.TIMECLOCK_EVENTS, JSON.stringify(map));
    });
    logInfo('Storage', 'addTimeClockEvent', {
      profileId,
      eventType: event.eventType,
      shiftCode: event.shiftCode,
      dateISO: event.dateISO,
    });
  } catch (e) {
    logError('Storage', 'addTimeClockEvent failed', e);
    throw e;
  }
  return event;
}

export type TimeClockStampPhase =
  | 'awaiting_check_in'
  | 'awaiting_check_out'
  | 'completed'
  | 'anomaly';

export interface TimeClockStampState {
  phase: TimeClockStampPhase;
  allowedEventType: TimeClockEventType | null;
  openCheckInTimestampISO: string | null;
  checkInCount: number;
  checkOutCount: number;
}

function compactTimeClockEvents(events: TimeClockEvent[]): TimeClockEvent[] {
  const seen = new Set<string>();
  const compacted: TimeClockEvent[] = [];
  for (const event of events) {
    const key = `${event.dateISO}|${event.shiftCode}|${event.eventType}|${event.timestampISO}`;
    if (seen.has(key)) continue;
    seen.add(key);
    compacted.push(event);
  }
  return compacted;
}

export function deriveTimeClockStampState(events: TimeClockEvent[]): TimeClockStampState {
  const sorted = [...events].sort((a, b) => {
    const byCreated = a.createdAt.localeCompare(b.createdAt);
    if (byCreated !== 0) return byCreated;
    return a.timestampISO.localeCompare(b.timestampISO);
  });
  const checkInCount = sorted.filter((e) => e.eventType === 'check_in').length;
  const checkOutCount = sorted.filter((e) => e.eventType === 'check_out').length;

  let expected: TimeClockEventType = 'check_in';
  let completedPairs = 0;
  let openCheckInTimestampISO: string | null = null;
  let anomaly = false;

  for (const event of sorted) {
    if (event.eventType !== expected) {
      anomaly = true;
      break;
    }
    if (event.eventType === 'check_in') {
      openCheckInTimestampISO = event.timestampISO;
      expected = 'check_out';
    } else {
      openCheckInTimestampISO = null;
      completedPairs += 1;
      expected = 'check_in';
    }
  }

  if (anomaly || completedPairs > 1) {
    return {
      phase: 'anomaly',
      allowedEventType: null,
      openCheckInTimestampISO,
      checkInCount,
      checkOutCount,
    };
  }

  if (completedPairs === 1 && expected === 'check_in') {
    return {
      phase: 'completed',
      allowedEventType: null,
      openCheckInTimestampISO: null,
      checkInCount,
      checkOutCount,
    };
  }

  if (expected === 'check_out') {
    return {
      phase: 'awaiting_check_out',
      allowedEventType: 'check_out',
      openCheckInTimestampISO,
      checkInCount,
      checkOutCount,
    };
  }

  return {
    phase: 'awaiting_check_in',
    allowedEventType: 'check_in',
    openCheckInTimestampISO: null,
    checkInCount,
    checkOutCount,
  };
}

export async function updateTimeClockEvent(
  profileId: string,
  eventId: string,
  patch: Partial<Pick<TimeClockEvent, 'dateISO' | 'weekdayLabel' | 'shiftCode' | 'eventType' | 'timestampISO' | 'source'>>
): Promise<{ ok: true; event: TimeClockEvent } | { ok: false; reason: string }> {
  try {
    return await runSerializedWrite(STORAGE_KEYS.TIMECLOCK_EVENTS, async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIMECLOCK_EVENTS);
      const map: Record<string, TimeClockEvent[]> = raw ? JSON.parse(raw) : {};
      const list = map[profileId] ?? [];
      const idx = list.findIndex((e) => e.id === eventId);
      if (idx < 0) return { ok: false as const, reason: 'Stempelzeit nicht gefunden.' };

      const current = list[idx];
      const updated: TimeClockEvent = {
        ...current,
        ...patch,
        source: patch.source ?? 'manual_edit',
      };
      list[idx] = updated;
      map[profileId] = list;
      await AsyncStorage.setItem(STORAGE_KEYS.TIMECLOCK_EVENTS, JSON.stringify(map));
      return { ok: true as const, event: updated };
    });
  } catch (e) {
    logError('Storage', 'updateTimeClockEvent failed', e);
    return { ok: false, reason: 'Update fehlgeschlagen.' };
  }
}

export async function deleteTimeClockEvent(
  profileId: string,
  eventId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    return await runSerializedWrite(STORAGE_KEYS.TIMECLOCK_EVENTS, async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIMECLOCK_EVENTS);
      const map: Record<string, TimeClockEvent[]> = raw ? JSON.parse(raw) : {};
      const list = map[profileId] ?? [];
      const next = list.filter((e) => e.id !== eventId);
      if (next.length === list.length) {
        return { ok: false as const, reason: 'Stempelzeit nicht gefunden.' };
      }
      map[profileId] = next;
      await AsyncStorage.setItem(STORAGE_KEYS.TIMECLOCK_EVENTS, JSON.stringify(map));
      return { ok: true as const };
    });
  } catch (e) {
    logError('Storage', 'deleteTimeClockEvent failed', e);
    return { ok: false, reason: 'Löschen fehlgeschlagen.' };
  }
}

export interface TimeClockTestPrompt {
  shiftDateISO: string;
  shiftCode: RegularShiftCode;
  eventType: 'check_in' | 'check_out';
  createdAt: string;
}

export interface TimeClockUiState {
  settingsExpanded: boolean;
  updatedAt: string;
}

export type TimeClockQaDateType = 'holiday' | 'preholiday';

export async function getTimeClockTestPrompt(profileId: string): Promise<TimeClockTestPrompt | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIMECLOCK_TEST_PROMPT);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, TimeClockTestPrompt>;
    return map[profileId] ?? null;
  } catch {
    return null;
  }
}

export async function setTimeClockTestPrompt(
  profileId: string,
  prompt: TimeClockTestPrompt
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIMECLOCK_TEST_PROMPT);
    const map: Record<string, TimeClockTestPrompt> = raw ? JSON.parse(raw) : {};
    map[profileId] = prompt;
    await AsyncStorage.setItem(STORAGE_KEYS.TIMECLOCK_TEST_PROMPT, JSON.stringify(map));
  } catch (e) {
    logError('Storage', 'setTimeClockTestPrompt failed', e);
  }
}

export async function clearTimeClockTestPrompt(profileId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIMECLOCK_TEST_PROMPT);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, TimeClockTestPrompt>;
    delete map[profileId];
    await AsyncStorage.setItem(STORAGE_KEYS.TIMECLOCK_TEST_PROMPT, JSON.stringify(map));
  } catch (e) {
    logError('Storage', 'clearTimeClockTestPrompt failed', e);
  }
}

export async function getTimeClockUiState(profileId: string): Promise<TimeClockUiState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIMECLOCK_UI);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, TimeClockUiState>;
    return map[profileId] ?? null;
  } catch {
    return null;
  }
}

export async function setTimeClockUiState(profileId: string, state: TimeClockUiState): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIMECLOCK_UI);
    const map: Record<string, TimeClockUiState> = raw ? JSON.parse(raw) : {};
    map[profileId] = state;
    await AsyncStorage.setItem(STORAGE_KEYS.TIMECLOCK_UI, JSON.stringify(map));
  } catch (e) {
    logError('Storage', 'setTimeClockUiState failed', e);
  }
}

export async function getTimeClockQaCalendar(
  profileId: string
): Promise<Record<string, TimeClockQaDateType>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIMECLOCK_QA_CALENDAR);
    if (!raw) return {};
    const map = JSON.parse(raw) as Record<string, Record<string, TimeClockQaDateType>>;
    return map[profileId] ?? {};
  } catch {
    return {};
  }
}

export async function setTimeClockQaDateOverride(
  profileId: string,
  dateISO: string,
  type: TimeClockQaDateType
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIMECLOCK_QA_CALENDAR);
    const map: Record<string, Record<string, TimeClockQaDateType>> = raw ? JSON.parse(raw) : {};
    const existing = map[profileId] ?? {};
    map[profileId] = { ...existing, [dateISO]: type };
    await AsyncStorage.setItem(STORAGE_KEYS.TIMECLOCK_QA_CALENDAR, JSON.stringify(map));
  } catch (e) {
    logError('Storage', 'setTimeClockQaDateOverride failed', e);
  }
}

export async function clearTimeClockQaDateOverride(
  profileId: string,
  dateISO: string
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIMECLOCK_QA_CALENDAR);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, Record<string, TimeClockQaDateType>>;
    const existing = map[profileId] ?? {};
    if (!existing[dateISO]) return;
    const next = { ...existing };
    delete next[dateISO];
    map[profileId] = next;
    await AsyncStorage.setItem(STORAGE_KEYS.TIMECLOCK_QA_CALENDAR, JSON.stringify(map));
  } catch (e) {
    logError('Storage', 'clearTimeClockQaDateOverride failed', e);
  }
}

export function shiftLabelForStamp(shiftCode: RegularShiftCode): string {
  const map: Record<RegularShiftCode, string> = {
    F: 'Früh',
    S: 'Spät',
    N: 'Nacht',
    KS: 'Kurze Spät',
    KN: 'Kurze Nacht',
    T: 'Tag',
  };
  return map[shiftCode];
}

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
import type {
  SpaceRuleProfile,
  UserTimeAccountProfile,
  TimeAccountUiState,
  UserTimeBudgetProfile,
  XCompensationSource,
  XCompensationBooking,
  ShiftPatternTemplate,
} from '../types/timeAccount';
import type {
  EmployerVacationGroup,
  VacationPlanningBudgetSummary,
  VacationPlanningConflict,
  VacationPlanningMemberState,
  VacationPlanningMessage,
  VacationPlanningThread,
  VacationPlanningWish,
  VacationPlanningWishStatus,
} from '../types/vacationPlanning';
import type { SpaceStatusEvent } from '../types/spaceStatus';
import type { PreparedIdProfile } from '../types/preparedProfile';
import { getHolidayMap, type Holiday } from '../data/holidays';
import { diffDaysUTC, shiftCodeAtDate } from './shiftEngine';
import { logInfo, logWarn, logError } from './log';
import type { VacationStrategy } from './strategyTypes';
import { buildVacationStrategies, resolveOriginalShiftCodeForDate } from './strategyEngine';
import { fallbackAvatarSeed } from './avatarSeed';
import { clearSpaceDeleted, markSpaceDeleted } from './spaceDeleteTombstones';
import {
  buildVacationPlanningConflicts,
  expandVacationPlanningDateRange,
  normalizeVacationPlanningWishDates,
} from './vacationPlanningEngine';

// ─── Storage Keys ──────────────────────────────────────────────────────────────
/** All AsyncStorage keys used by YASA – exported for admin cleanup / debug */
export const STORAGE_KEYS = {
  PROFILE: 'yasa.profile.v1',
  SPACES: 'yasa.spaces.v1',
  CURRENT_SPACE_ID: 'yasa.currentSpaceId.v1',
  SHIFTS: 'yasa.shifts.v1',
  GHOSTS: 'yasa.ghosts.v1',
  VACATION: 'yasa.vacation.v1',
  VACATION_PLANNING_WISHES: 'yasa.vacationPlanning.wishes.v1',
  VACATION_PLANNING_MEMBER_STATES: 'yasa.vacationPlanning.memberStates.v1',
  VACATION_PLANNING_GROUPS: 'yasa.vacationPlanning.groups.v1',
  VACATION_PLANNING_THREADS: 'yasa.vacationPlanning.threads.v1',
  VACATION_PLANNING_MESSAGES: 'yasa.vacationPlanning.messages.v1',
  SWAPS: 'yasa.swaps.v1',
  // ── Shift Overrides (einmalige Schichtwechsel) ──
  SHIFT_OVERRIDES: 'yasa.shiftOverrides.v1',
  // ── Day Changes History (Original + Aktuell) ──
  DAY_CHANGES: 'yasa.dayChanges.v1',
  // ── Time Account (Iteration 20) ──
  TIME_ACCOUNT_SPACE_RULES: 'yasa.timeAccountSpaceRules.v1',
  TIME_ACCOUNT_USER: 'yasa.timeAccountUser.v1',
  TIME_ACCOUNT_UI: 'yasa.timeAccountUi.v1',
  TIME_ACCOUNT_BUDGET: 'yasa.timeAccountBudget.v1',
  X_COMPENSATION_BOOKINGS: 'yasa.xCompensationBookings.v1',
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
  SPACE_STATUS_EVENTS: 'yasa.spaceStatus.events.v1',
  SPACE_STATUS_SEEN: 'yasa.spaceStatus.seen.v1',
  PREPARED_ID_PROFILES: 'yasa.preparedIdProfiles.v1',
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
  await clearSpaceDeleted(space.id);
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
  await clearSpaceDeleted(spaceId);

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
  await clearSpaceDeleted(payload.spaceId);

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
  await markSpaceDeleted(spaceId);
  const existing = await getSpaces();
  await setSpaces(existing.filter((s) => s.id !== spaceId));
  const currentId = await getCurrentSpaceId();
  if (currentId === spaceId) {
    await clearCurrentSpaceId();
  }
  // Iteration 19: Robuste Ghost-Bereinigung (idempotent, inkl. Shift-Cleanup)
  await purgeSpaceGhostData(spaceId);
  await purgeLocalSpaceScopedData(spaceId);
}

async function removeSpaceKeyFromMapStorage(storageKey: string, spaceId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(map, spaceId)) return;
    delete map[spaceId];
    await AsyncStorage.setItem(storageKey, JSON.stringify(map));
  } catch (err) {
    logError('Storage', 'removeSpaceKeyFromMapStorage:error', { storageKey, spaceId, err: String(err) });
  }
}

async function purgeLocalSpaceScopedData(spaceId: string): Promise<void> {
  await Promise.all([
    removeSpaceKeyFromMapStorage(KEYS.VACATION_PLANNING_WISHES, spaceId),
    removeSpaceKeyFromMapStorage(KEYS.VACATION_PLANNING_MEMBER_STATES, spaceId),
    removeSpaceKeyFromMapStorage(KEYS.VACATION_PLANNING_GROUPS, spaceId),
    removeSpaceKeyFromMapStorage(KEYS.VACATION_PLANNING_THREADS, spaceId),
    removeSpaceKeyFromMapStorage(KEYS.VACATION_PLANNING_MESSAGES, spaceId),
    removeSpaceKeyFromMapStorage(KEYS.TIME_ACCOUNT_SPACE_RULES, spaceId),
    removeSpaceKeyFromMapStorage(KEYS.SPACE_STATUS_EVENTS, spaceId),
    removeSpaceKeyFromMapStorage(KEYS.PREPARED_ID_PROFILES, spaceId),
  ]);

  try {
    const raw = await AsyncStorage.getItem(KEYS.SWAPS);
    if (raw) {
      const swaps = JSON.parse(raw) as SwapRequest[];
      const next = Array.isArray(swaps) ? swaps.filter((swap) => swap.spaceId !== spaceId) : [];
      await AsyncStorage.setItem(KEYS.SWAPS, JSON.stringify(next));
    }
  } catch (err) {
    logError('Storage', 'purgeLocalSpaceScopedData:swaps:error', { spaceId, err: String(err) });
  }

  try {
    const raw = await AsyncStorage.getItem(KEYS.SHIFTS);
    if (raw) {
      const plans = JSON.parse(raw) as Record<string, UserShiftPlan>;
      const prefix = `${spaceId}::`;
      let changed = false;
      for (const key of Object.keys(plans)) {
        if (key.startsWith(prefix)) {
          delete plans[key];
          changed = true;
        }
      }
      if (changed) {
        await AsyncStorage.setItem(KEYS.SHIFTS, JSON.stringify(plans));
      }
    }
  } catch (err) {
    logError('Storage', 'purgeLocalSpaceScopedData:shiftPlans:error', { spaceId, err: String(err) });
  }
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

export function buildSpaceProfileKey(spaceId: string, profileId: string): string {
  return `${spaceId}::${profileId}`;
}

function spaceIncludesProfile(space: Space, profileId: string): boolean {
  return (
    space.ownerProfileId === profileId ||
    space.memberProfileIds.includes(profileId) ||
    space.memberProfiles.some((member) => member.id === profileId)
  );
}

async function isOriginalSpaceForProfile(spaceId: string, profileId: string): Promise<boolean> {
  const spaces = await getSpaces();
  const profileSpaces = spaces
    .filter((space) => spaceIncludesProfile(space, profileId))
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return profileSpaces[0]?.id === spaceId;
}

async function copyMapEntryIfMissing<T>(
  storageKey: string,
  legacyProfileId: string,
  scopedProfileId: string,
  transform: (value: T) => T = (value) => value,
): Promise<boolean> {
  let changed = false;
  await runSerializedWrite(storageKey, async () => {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, T>;
    if (map[scopedProfileId] !== undefined || map[legacyProfileId] === undefined) return;
    map[scopedProfileId] = transform(map[legacyProfileId]);
    await AsyncStorage.setItem(storageKey, JSON.stringify(map));
    changed = true;
  });
  return changed;
}

export async function ensureLegacyProfileDataForOriginalSpace(
  spaceId: string,
  profileId: string,
): Promise<void> {
  const scopedProfileId = buildSpaceProfileKey(spaceId, profileId);
  if (!(await isOriginalSpaceForProfile(spaceId, profileId))) return;

  const migrated = await Promise.all([
    copyMapEntryIfMissing<UserShiftPlan>(KEYS.SHIFTS, profileId, scopedProfileId),
    copyMapEntryIfMissing<string[]>(KEYS.VACATION, profileId, scopedProfileId),
    copyMapEntryIfMissing<Record<string, ShiftType>>(KEYS.SHIFT_OVERRIDES, profileId, scopedProfileId),
    copyMapEntryIfMissing<Record<string, DayChange>>(KEYS.DAY_CHANGES, profileId, scopedProfileId),
    copyMapEntryIfMissing<UserTimeAccountProfile>(
      KEYS.TIME_ACCOUNT_USER,
      profileId,
      scopedProfileId,
      (value) => ({ ...value, profileId: scopedProfileId }),
    ),
    copyMapEntryIfMissing<UserTimeBudgetProfile>(
      KEYS.TIME_ACCOUNT_BUDGET,
      profileId,
      scopedProfileId,
      (value) => ({ ...value, profileId: scopedProfileId }),
    ),
    copyMapEntryIfMissing<Record<string, XCompensationBooking>>(
      KEYS.X_COMPENSATION_BOOKINGS,
      profileId,
      scopedProfileId,
      (value) =>
        Object.fromEntries(
          Object.entries(value).map(([dateISO, booking]) => [
            dateISO,
            { ...booking, profileId: scopedProfileId },
          ]),
        ),
    ),
    copyMapEntryIfMissing<UserTimeClockConfig>(
      KEYS.TIMECLOCK_CONFIG,
      profileId,
      scopedProfileId,
      (value) => ({ ...value, profileId: scopedProfileId }),
    ),
    copyMapEntryIfMissing<TimeClockEvent[]>(
      KEYS.TIMECLOCK_EVENTS,
      profileId,
      scopedProfileId,
      (value) => value.map((event) => ({ ...event, profileId: scopedProfileId })),
    ),
    copyMapEntryIfMissing<TimeClockTestPrompt>(KEYS.TIMECLOCK_TEST_PROMPT, profileId, scopedProfileId),
    copyMapEntryIfMissing<TimeClockUiState>(KEYS.TIMECLOCK_UI, profileId, scopedProfileId),
    copyMapEntryIfMissing<Record<string, TimeClockQaDateType>>(KEYS.TIMECLOCK_QA_CALENDAR, profileId, scopedProfileId),
    copyMapEntryIfMissing<ShortShiftVacationReminder[]>(KEYS.VACATION_SHORTSHIFT_REMINDERS, profileId, scopedProfileId),
  ]);

  if (migrated.some(Boolean)) {
    logInfo('Storage', 'ensureLegacyProfileDataForOriginalSpace:migrated', { spaceId, profileId });
  }
}

export function getShiftPlanFromMapForSpace(
  allPlans: Record<string, UserShiftPlan>,
  spaceId: string,
  profileId: string
): UserShiftPlan | null {
  return allPlans[buildSpaceProfileKey(spaceId, profileId)] ?? null;
}

/**
 * Liest den Schichtplan für ein spezifisches Profil.
 * Gibt null zurück wenn kein Plan vorhanden.
 */
export async function getShiftPlan(profileId: string): Promise<UserShiftPlan | null> {
  const all = await getAllShiftPlans();
  return all[profileId] ?? null;
}

export async function getShiftPlanForSpace(
  spaceId: string,
  profileId: string
): Promise<UserShiftPlan | null> {
  await ensureLegacyProfileDataForOriginalSpace(spaceId, profileId);
  const all = await getAllShiftPlans();
  return getShiftPlanFromMapForSpace(all, spaceId, profileId);
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

export async function saveShiftPlanForSpace(spaceId: string, plan: UserShiftPlan): Promise<void> {
  const storageProfileId = buildSpaceProfileKey(spaceId, plan.profileId);
  const all = await getAllShiftPlans();
  all[storageProfileId] = plan;
  await AsyncStorage.setItem(KEYS.SHIFTS, JSON.stringify(all));
  try {
    const { pushShiftPlanToBackendKey } = await import('./backend/shiftSync');
    await pushShiftPlanToBackendKey(storageProfileId, plan);
  } catch (e) {
    logWarn('Backend', 'pushShiftPlanToBackendKey failed', {
      profileId: plan.profileId,
      spaceId,
      error: String(e),
    });
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
  return resolveShiftForDateFromPlan(plan, dateISO);
}

export async function getShiftForDateForSpace(
  spaceId: string,
  profileId: string,
  dateISO: string
): Promise<ShiftType | null> {
  const overrides = await getShiftOverridesForSpace(spaceId, profileId);
  if (dateISO in overrides) return overrides[dateISO] ?? null;
  const plan = await getShiftPlanForSpace(spaceId, profileId);
  return resolveShiftForDateFromPlan(plan, dateISO);
}

function resolveShiftForDateFromPlan(
  plan: UserShiftPlan | null,
  dateISO: string
): ShiftType | null {
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

// ─── Space Status / YASA Information Service ────────────────────────────────

const MAX_LOCAL_SPACE_STATUS_EVENTS = 120;

function statusEventTime(event: SpaceStatusEvent): number {
  const time = Date.parse(event.createdAt);
  return Number.isFinite(time) ? time : 0;
}

function mergeSpaceStatusEventsForStorage(
  current: SpaceStatusEvent[],
  incoming: SpaceStatusEvent[]
): SpaceStatusEvent[] {
  const byId = new Map<string, SpaceStatusEvent>();
  for (const event of current) {
    if (event?.id) byId.set(event.id, event);
  }
  for (const event of incoming) {
    if (!event?.id) continue;
    const existing = byId.get(event.id);
    if (!existing || statusEventTime(event) >= statusEventTime(existing)) {
      byId.set(event.id, event);
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => statusEventTime(b) - statusEventTime(a))
    .slice(0, MAX_LOCAL_SPACE_STATUS_EVENTS);
}

export async function getSpaceStatusEvents(spaceId: string): Promise<SpaceStatusEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SPACE_STATUS_EVENTS);
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, SpaceStatusEvent[]>;
    return mergeSpaceStatusEventsForStorage(map[spaceId] ?? [], []);
  } catch {
    return [];
  }
}

export async function upsertSpaceStatusEvents(
  spaceId: string,
  events: SpaceStatusEvent[]
): Promise<SpaceStatusEvent[]> {
  return runSerializedWrite(KEYS.SPACE_STATUS_EVENTS, async () => {
    const raw = await AsyncStorage.getItem(KEYS.SPACE_STATUS_EVENTS);
    const map: Record<string, SpaceStatusEvent[]> = raw ? JSON.parse(raw) : {};
    const next = mergeSpaceStatusEventsForStorage(map[spaceId] ?? [], events);
    map[spaceId] = next;
    await AsyncStorage.setItem(KEYS.SPACE_STATUS_EVENTS, JSON.stringify(map));
    return next;
  });
}

export async function addSpaceStatusEvent(
  input: Omit<SpaceStatusEvent, 'id' | 'createdAt'> &
    Partial<Pick<SpaceStatusEvent, 'id' | 'createdAt'>>
): Promise<SpaceStatusEvent> {
  const event: SpaceStatusEvent = {
    ...input,
    id: input.id ?? generateUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  await upsertSpaceStatusEvents(event.spaceId, [event]);
  return event;
}

export async function getSeenSpaceStatusEventIds(profileId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SPACE_STATUS_SEEN);
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, string[]>;
    return Array.isArray(map[profileId]) ? map[profileId] : [];
  } catch {
    return [];
  }
}

export async function markSpaceStatusEventSeen(profileId: string, eventId: string): Promise<void> {
  await runSerializedWrite(KEYS.SPACE_STATUS_SEEN, async () => {
    const raw = await AsyncStorage.getItem(KEYS.SPACE_STATUS_SEEN);
    const map: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    const seen = new Set(map[profileId] ?? []);
    seen.add(eventId);
    map[profileId] = Array.from(seen).slice(-240);
    await AsyncStorage.setItem(KEYS.SPACE_STATUS_SEEN, JSON.stringify(map));
  });
}

// ─── Prepared ID Profiles / Host Account Vault ─────────────────────────────

function preparedProfileTime(value: PreparedIdProfile): number {
  const time = Date.parse(value.updatedAt || value.createdAt);
  return Number.isFinite(time) ? time : 0;
}

function sanitizePreparedIdProfile(input: unknown): PreparedIdProfile | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<PreparedIdProfile>;
  const now = new Date().toISOString();
  const id = String(raw.id ?? generateUUID());
  const spaceId = String(raw.spaceId ?? '');
  const profileId = String(raw.profileId ?? '');
  const displayName = String(raw.displayName ?? '').trim();
  const avatarUrl = String(raw.avatarUrl ?? '').trim().toLowerCase();
  const createdByProfileId = String(raw.createdByProfileId ?? '');
  if (!spaceId || !profileId || !displayName || !avatarUrl || !createdByProfileId) return null;
  return {
    id,
    spaceId,
    profileId,
    displayName,
    avatarUrl,
    status: raw.status ?? 'prepared',
    assignedPattern: raw.assignedPattern,
    createdByProfileId,
    createdAt: String(raw.createdAt ?? now),
    updatedAt: String(raw.updatedAt ?? now),
    transferredAt: raw.transferredAt,
  };
}

async function getAllPreparedIdProfiles(): Promise<Record<string, PreparedIdProfile[]>> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.PREPARED_ID_PROFILES);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown[]>;
    const result: Record<string, PreparedIdProfile[]> = {};
    for (const [spaceId, items] of Object.entries(parsed)) {
      result[spaceId] = (Array.isArray(items) ? items : [])
        .map(sanitizePreparedIdProfile)
        .filter((item): item is PreparedIdProfile => item !== null)
        .sort((a, b) => preparedProfileTime(b) - preparedProfileTime(a));
    }
    return result;
  } catch {
    return {};
  }
}

export async function getPreparedIdProfiles(spaceId: string): Promise<PreparedIdProfile[]> {
  const all = await getAllPreparedIdProfiles();
  return all[spaceId] ?? [];
}

export async function replacePreparedIdProfilesForSpace(
  spaceId: string,
  profiles: PreparedIdProfile[]
): Promise<PreparedIdProfile[]> {
  return runSerializedWrite(KEYS.PREPARED_ID_PROFILES, async () => {
    const all = await getAllPreparedIdProfiles();
    all[spaceId] = profiles
      .map((profile) => sanitizePreparedIdProfile({ ...profile, spaceId }))
      .filter((item): item is PreparedIdProfile => item !== null)
      .sort((a, b) => preparedProfileTime(b) - preparedProfileTime(a));
    await AsyncStorage.setItem(KEYS.PREPARED_ID_PROFILES, JSON.stringify(all));
    return all[spaceId];
  });
}

export async function upsertPreparedIdProfile(profile: PreparedIdProfile): Promise<PreparedIdProfile[]> {
  return runSerializedWrite(KEYS.PREPARED_ID_PROFILES, async () => {
    const all = await getAllPreparedIdProfiles();
    const current = all[profile.spaceId] ?? [];
    const nextItem = sanitizePreparedIdProfile({
      ...profile,
      updatedAt: new Date().toISOString(),
    });
    if (!nextItem) return current;
    all[profile.spaceId] = [
      ...current.filter((item) => item.id !== nextItem.id),
      nextItem,
    ].sort((a, b) => preparedProfileTime(b) - preparedProfileTime(a));
    await AsyncStorage.setItem(KEYS.PREPARED_ID_PROFILES, JSON.stringify(all));
    return all[profile.spaceId];
  });
}

export async function deletePreparedIdProfile(spaceId: string, id: string): Promise<PreparedIdProfile[]> {
  return runSerializedWrite(KEYS.PREPARED_ID_PROFILES, async () => {
    const all = await getAllPreparedIdProfiles();
    all[spaceId] = (all[spaceId] ?? []).filter((item) => item.id !== id);
    await AsyncStorage.setItem(KEYS.PREPARED_ID_PROFILES, JSON.stringify(all));
    return all[spaceId];
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
  await markGhostPresentForStorageKey(ghostProfileId, ghostProfileId, dateISO, shiftCode);
}

export async function markGhostPresentForSpace(
  spaceId: string,
  ghostProfileId: string,
  dateISO: string,
  shiftCode: ShiftType
): Promise<void> {
  await markGhostPresentForStorageKey(
    buildSpaceProfileKey(spaceId, ghostProfileId),
    ghostProfileId,
    dateISO,
    shiftCode
  );
}

async function markGhostPresentForStorageKey(
  storageKey: string,
  profileId: string,
  dateISO: string,
  shiftCode: ShiftType
): Promise<void> {
  const allPlans = await getAllShiftPlans();
  const existing = allPlans[storageKey];

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
    allPlans[storageKey] = existing;
  } else {
    // Neuen "Plan" für Ghost anlegen (nur Einzeleinträge, kein Pattern)
    const ghostPlan: UserShiftPlan = {
      profileId,
      startDateISO: dateISO,
      pattern: [],
      cycleLengthDays: 0,
      generatedUntilISO: dateISO,
      entries: [{ dateISO, code: shiftCode }],
    };
    allPlans[storageKey] = ghostPlan;
  }

  await AsyncStorage.setItem(KEYS.SHIFTS, JSON.stringify(allPlans));
}

// ─── Vacation Pre-Planning (future-year wishes) ─────────────────────────────────────

type VacationPlanningWishMap = Record<string, VacationPlanningWish[]>;
type VacationPlanningMemberStateMap = Record<string, VacationPlanningMemberState[]>;
type EmployerVacationGroupMap = Record<string, EmployerVacationGroup[]>;
type VacationPlanningThreadMap = Record<string, VacationPlanningThread[]>;
type VacationPlanningMessageMap = Record<string, VacationPlanningMessage[]>;

async function readVacationPlanningWishMap(): Promise<VacationPlanningWishMap> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.VACATION_PLANNING_WISHES);
    if (!raw) return {};
    return JSON.parse(raw) as VacationPlanningWishMap;
  } catch {
    return {};
  }
}

async function readVacationPlanningMemberStateMap(): Promise<VacationPlanningMemberStateMap> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.VACATION_PLANNING_MEMBER_STATES);
    if (!raw) return {};
    return JSON.parse(raw) as VacationPlanningMemberStateMap;
  } catch {
    return {};
  }
}

async function readEmployerVacationGroupMap(): Promise<EmployerVacationGroupMap> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.VACATION_PLANNING_GROUPS);
    if (!raw) return {};
    return JSON.parse(raw) as EmployerVacationGroupMap;
  } catch {
    return {};
  }
}

async function readVacationPlanningThreadMap(): Promise<VacationPlanningThreadMap> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.VACATION_PLANNING_THREADS);
    if (!raw) return {};
    return JSON.parse(raw) as VacationPlanningThreadMap;
  } catch {
    return {};
  }
}

async function readVacationPlanningMessageMap(): Promise<VacationPlanningMessageMap> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.VACATION_PLANNING_MESSAGES);
    if (!raw) return {};
    return JSON.parse(raw) as VacationPlanningMessageMap;
  } catch {
    return {};
  }
}

export async function getVacationPlanningWishes(
  spaceId: string,
  year?: number
): Promise<VacationPlanningWish[]> {
  const map = await readVacationPlanningWishMap();
  const wishes = map[spaceId] ?? [];
  return year === undefined ? wishes : wishes.filter((wish) => wish.year === year);
}

export async function upsertVacationPlanningWish(
  input: Omit<VacationPlanningWish, 'id' | 'dateISOs' | 'createdAt' | 'updatedAt'> &
    Partial<Pick<VacationPlanningWish, 'id' | 'dateISOs' | 'createdAt' | 'updatedAt'>>
): Promise<VacationPlanningWish> {
  const now = new Date().toISOString();
  const wish: VacationPlanningWish = normalizeVacationPlanningWishDates({
    ...input,
    id: input.id ?? generateUUID(),
    dateISOs: input.dateISOs ?? expandVacationPlanningDateRange(input.startDateISO, input.endDateISO),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  });

  return runSerializedWrite(KEYS.VACATION_PLANNING_WISHES, async () => {
    const map = await readVacationPlanningWishMap();
    const current = map[wish.spaceId] ?? [];
    const next = current.filter((item) => item.id !== wish.id);
    next.push(wish);
    next.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      if (a.startDateISO !== b.startDateISO) return a.startDateISO.localeCompare(b.startDateISO);
      return a.profileId.localeCompare(b.profileId);
    });
    map[wish.spaceId] = next;
    await AsyncStorage.setItem(KEYS.VACATION_PLANNING_WISHES, JSON.stringify(map));
    return wish;
  });
}

export async function deleteVacationPlanningWish(spaceId: string, wishId: string): Promise<void> {
  await runSerializedWrite(KEYS.VACATION_PLANNING_WISHES, async () => {
    const map = await readVacationPlanningWishMap();
    map[spaceId] = (map[spaceId] ?? []).filter((wish) => wish.id !== wishId);
    await AsyncStorage.setItem(KEYS.VACATION_PLANNING_WISHES, JSON.stringify(map));
  });
}

export async function getVacationPlanningDaysForProfile(
  spaceId: string,
  profileId: string,
  year: number,
  statuses?: VacationPlanningWishStatus[]
): Promise<string[]> {
  const wishes = await getVacationPlanningWishes(spaceId, year);
  const statusFilter = statuses ? new Set(statuses) : null;
  const days = new Set<string>();
  for (const wish of wishes) {
    if (wish.profileId !== profileId) continue;
    if (statusFilter && !statusFilter.has(wish.status)) continue;
    const normalized = normalizeVacationPlanningWishDates(wish);
    for (const dateISO of normalized.dateISOs) {
      if (dateISO.startsWith(`${year}-`)) days.add(dateISO);
    }
  }
  return [...days].sort();
}

export async function getVacationPlanningMemberState(
  spaceId: string,
  profileId: string,
  year: number
): Promise<VacationPlanningMemberState | null> {
  const map = await readVacationPlanningMemberStateMap();
  return (
    (map[spaceId] ?? []).find(
      (state) => state.profileId === profileId && state.year === year
    ) ?? null
  );
}

export async function upsertVacationPlanningMemberState(
  input: Omit<VacationPlanningMemberState, 'id' | 'createdAt' | 'updatedAt'> &
    Partial<Pick<VacationPlanningMemberState, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<VacationPlanningMemberState> {
  const now = new Date().toISOString();
  const state: VacationPlanningMemberState = {
    ...input,
    id: input.id ?? `${input.spaceId}:${input.profileId}:${input.year}`,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };

  return runSerializedWrite(KEYS.VACATION_PLANNING_MEMBER_STATES, async () => {
    const map = await readVacationPlanningMemberStateMap();
    const current = map[state.spaceId] ?? [];
    const next = current.filter((item) => item.id !== state.id);
    next.push(state);
    next.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.profileId.localeCompare(b.profileId);
    });
    map[state.spaceId] = next;
    await AsyncStorage.setItem(KEYS.VACATION_PLANNING_MEMBER_STATES, JSON.stringify(map));
    return state;
  });
}

export async function getEffectiveVacationPlanningMemberState(
  spaceId: string,
  profileId: string,
  year: number
): Promise<VacationPlanningMemberState> {
  const draftDays = await getVacationPlanningDaysForProfile(spaceId, profileId, year, ['draft']);
  if (draftDays.length > 0) {
    const now = new Date().toISOString();
    return {
      id: `${spaceId}:${profileId}:${year}`,
      spaceId,
      profileId,
      year,
      status: 'drafting',
      createdAt: now,
      updatedAt: now,
    };
  }

  const explicit = await getVacationPlanningMemberState(spaceId, profileId, year);
  if (explicit) return explicit;

  const now = new Date().toISOString();
  const days = await getVacationPlanningDaysForProfile(spaceId, profileId, year);
  return {
    id: `${spaceId}:${profileId}:${year}`,
    spaceId,
    profileId,
    year,
    status: days.length > 0 ? 'drafting' : 'not-started',
    createdAt: now,
    updatedAt: now,
  };
}

export async function submitVacationPlanningDraftsForProfile(
  spaceId: string,
  profileId: string,
  year: number
): Promise<{ submittedCount: number; state: VacationPlanningMemberState }> {
  let submittedCount = 0;
  const now = new Date().toISOString();

  await runSerializedWrite(KEYS.VACATION_PLANNING_WISHES, async () => {
    const map = await readVacationPlanningWishMap();
    const next = (map[spaceId] ?? []).map((wish) => {
      if (wish.profileId !== profileId || wish.year !== year || wish.status !== 'draft') {
        return wish;
      }
      submittedCount += 1;
      return { ...wish, status: 'submitted' as const, updatedAt: now };
    });
    map[spaceId] = next;
    await AsyncStorage.setItem(KEYS.VACATION_PLANNING_WISHES, JSON.stringify(map));
  });

  const existing = await getVacationPlanningMemberState(spaceId, profileId, year);
  const state = await upsertVacationPlanningMemberState({
    ...(existing ?? {}),
    spaceId,
    profileId,
    year,
    status: 'submitted',
    submittedAt: now,
    completedAt: now,
  });

  return { submittedCount, state };
}

export async function markNoVacationPlanningWishes(
  spaceId: string,
  profileId: string,
  year: number
): Promise<VacationPlanningMemberState> {
  await runSerializedWrite(KEYS.VACATION_PLANNING_WISHES, async () => {
    const map = await readVacationPlanningWishMap();
    map[spaceId] = (map[spaceId] ?? []).filter(
      (wish) => wish.profileId !== profileId || wish.year !== year || wish.status !== 'draft'
    );
    await AsyncStorage.setItem(KEYS.VACATION_PLANNING_WISHES, JSON.stringify(map));
  });

  const now = new Date().toISOString();
  const existing = await getVacationPlanningMemberState(spaceId, profileId, year);
  return upsertVacationPlanningMemberState({
    ...(existing ?? {}),
    spaceId,
    profileId,
    year,
    status: 'no-wishes',
    completedAt: now,
  });
}

export async function getVacationPlanningBudgetSummary(
  spaceId: string,
  profileId: string,
  year: number
): Promise<VacationPlanningBudgetSummary> {
  const [wishes, budget] = await Promise.all([
    getVacationPlanningWishes(spaceId, year),
    getUserTimeBudgetProfile(profileId),
  ]);
  const ownWishes = wishes.filter((wish) => wish.profileId === profileId);
  const draftDays = new Set<string>();
  const submittedDays = new Set<string>();

  for (const wish of ownWishes) {
    const target = wish.status === 'draft' ? draftDays : submittedDays;
    for (const dateISO of normalizeVacationPlanningWishDates(wish).dateISOs) {
      if (dateISO.startsWith(`${year}-`)) target.add(dateISO);
    }
  }

  const plannedDays = new Set([...draftDays, ...submittedDays]).size;
  const vacationBalance = Math.max(0, budget.vacationDays);
  const annualEntitlement = Math.max(0, budget.annualVacationEntitlementDays);
  const budgetDays = vacationBalance > 0 ? vacationBalance : annualEntitlement;
  const budgetSource =
    vacationBalance > 0
      ? 'vacation-balance'
      : annualEntitlement > 0
        ? 'annual-entitlement'
        : 'missing';

  return {
    spaceId,
    profileId,
    year,
    budgetDays,
    budgetSource,
    plannedDays,
    draftDays: draftDays.size,
    submittedDays: submittedDays.size,
    remainingDays: budgetDays - plannedDays,
  };
}

export async function toggleVacationPlanningDay(input: {
  spaceId: string;
  profileId: string;
  dateISO: string;
}): Promise<string[]> {
  const year = Number(input.dateISO.slice(0, 4));
  if (!Number.isInteger(year)) return [];

  const wishes = await getVacationPlanningWishes(input.spaceId, year);
  const existing = wishes.find((wish) => {
    if (wish.profileId !== input.profileId) return false;
    return normalizeVacationPlanningWishDates(wish).dateISOs.includes(input.dateISO);
  });

  if (existing) {
    await deleteVacationPlanningWish(input.spaceId, existing.id);
  } else {
    await upsertVacationPlanningWish({
      spaceId: input.spaceId,
      profileId: input.profileId,
      year,
      startDateISO: input.dateISO,
      endDateISO: input.dateISO,
      status: 'draft',
    });
  }

  return getVacationPlanningDaysForProfile(input.spaceId, input.profileId, year);
}

export async function getEmployerVacationGroups(
  spaceId: string,
  year?: number
): Promise<EmployerVacationGroup[]> {
  const map = await readEmployerVacationGroupMap();
  const groups = map[spaceId] ?? [];
  return year === undefined ? groups : groups.filter((group) => group.year === year);
}

export async function upsertEmployerVacationGroup(
  input: Omit<EmployerVacationGroup, 'id' | 'createdAt' | 'updatedAt'> &
    Partial<Pick<EmployerVacationGroup, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<EmployerVacationGroup> {
  const now = new Date().toISOString();
  const group: EmployerVacationGroup = {
    ...input,
    id: input.id ?? generateUUID(),
    memberProfileIds: [...new Set(input.memberProfileIds)].sort(),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };

  return runSerializedWrite(KEYS.VACATION_PLANNING_GROUPS, async () => {
    const map = await readEmployerVacationGroupMap();
    const current = map[group.spaceId] ?? [];
    const next = current.filter((item) => item.id !== group.id);
    next.push(group);
    next.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.name.localeCompare(b.name);
    });
    map[group.spaceId] = next;
    await AsyncStorage.setItem(KEYS.VACATION_PLANNING_GROUPS, JSON.stringify(map));
    return group;
  });
}

export async function deleteEmployerVacationGroup(spaceId: string, groupId: string): Promise<void> {
  await runSerializedWrite(KEYS.VACATION_PLANNING_GROUPS, async () => {
    const map = await readEmployerVacationGroupMap();
    map[spaceId] = (map[spaceId] ?? []).filter((group) => group.id !== groupId);
    await AsyncStorage.setItem(KEYS.VACATION_PLANNING_GROUPS, JSON.stringify(map));
  });
}

export async function getVacationPlanningConflicts(
  spaceId: string,
  year: number
): Promise<VacationPlanningConflict[]> {
  const [wishes, groups] = await Promise.all([
    getVacationPlanningWishes(spaceId, year),
    getEmployerVacationGroups(spaceId, year),
  ]);
  return buildVacationPlanningConflicts({ wishes, groups, spaceId, year });
}

export async function getVacationPlanningThreads(
  spaceId: string,
  year?: number
): Promise<VacationPlanningThread[]> {
  const map = await readVacationPlanningThreadMap();
  const threads = map[spaceId] ?? [];
  return year === undefined ? threads : threads.filter((thread) => thread.year === year);
}

export async function upsertVacationPlanningThread(
  input: Omit<VacationPlanningThread, 'id' | 'messageIds' | 'createdAt' | 'updatedAt'> &
    Partial<Pick<VacationPlanningThread, 'id' | 'messageIds' | 'createdAt' | 'updatedAt'>>
): Promise<VacationPlanningThread> {
  const now = new Date().toISOString();
  const thread: VacationPlanningThread = {
    ...input,
    id: input.id ?? generateUUID(),
    messageIds: input.messageIds ?? [],
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };

  return runSerializedWrite(KEYS.VACATION_PLANNING_THREADS, async () => {
    const map = await readVacationPlanningThreadMap();
    const current = map[thread.spaceId] ?? [];
    const next = current.filter((item) => item.id !== thread.id);
    next.push(thread);
    next.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    map[thread.spaceId] = next;
    await AsyncStorage.setItem(KEYS.VACATION_PLANNING_THREADS, JSON.stringify(map));
    return thread;
  });
}

export async function addVacationPlanningMessage(
  input: Omit<VacationPlanningMessage, 'id' | 'createdAt'> &
    Partial<Pick<VacationPlanningMessage, 'id' | 'createdAt'>>
): Promise<VacationPlanningMessage> {
  const message: VacationPlanningMessage = {
    ...input,
    id: input.id ?? generateUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  await runSerializedWrite(KEYS.VACATION_PLANNING_MESSAGES, async () => {
    const map = await readVacationPlanningMessageMap();
    const current = map[message.spaceId] ?? [];
    current.push(message);
    current.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    map[message.spaceId] = current;
    await AsyncStorage.setItem(KEYS.VACATION_PLANNING_MESSAGES, JSON.stringify(map));
  });

  await runSerializedWrite(KEYS.VACATION_PLANNING_THREADS, async () => {
    const map = await readVacationPlanningThreadMap();
    const threads = map[message.spaceId] ?? [];
    const thread = threads.find((item) => item.id === message.threadId);
    if (thread && !thread.messageIds.includes(message.id)) {
      thread.messageIds = [...thread.messageIds, message.id];
      thread.updatedAt = message.createdAt;
      await AsyncStorage.setItem(KEYS.VACATION_PLANNING_THREADS, JSON.stringify(map));
    }
  });

  return message;
}

export async function getVacationPlanningMessages(
  spaceId: string,
  threadId?: string
): Promise<VacationPlanningMessage[]> {
  const map = await readVacationPlanningMessageMap();
  const messages = map[spaceId] ?? [];
  return threadId === undefined
    ? messages
    : messages.filter((message) => message.threadId === threadId);
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

export async function getVacationDaysForSpace(spaceId: string, profileId: string): Promise<string[]> {
  await ensureLegacyProfileDataForOriginalSpace(spaceId, profileId);
  return getVacationDays(buildSpaceProfileKey(spaceId, profileId));
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

export async function toggleVacationDayForSpace(
  spaceId: string,
  profileId: string,
  dateISO: string
): Promise<string[]> {
  const storageProfileId = buildSpaceProfileKey(spaceId, profileId);
  const days = await getVacationDays(storageProfileId);
  const exists = days.includes(dateISO);
  const originalCode = await getShiftForDateForSpace(spaceId, profileId, dateISO);

  let newDays: string[];
  if (exists) {
    newDays = days.filter((d) => d !== dateISO);
    await clearDayChange(storageProfileId, dateISO);
    await clearShortShiftVacationReminderForDate(storageProfileId, dateISO);
  } else {
    newDays = [...days, dateISO].sort();
    await setDayChange(storageProfileId, dateISO, originalCode, 'U', 'vacation');
    if (originalCode === 'KS' || originalCode === 'KN') {
      await ensureShortShiftVacationReminder(storageProfileId, dateISO, originalCode);
    }
  }

  await saveVacationDays(storageProfileId, newDays);
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

export async function getShiftOverridesForSpace(
  spaceId: string,
  profileId: string
): Promise<Record<string, ShiftType>> {
  await ensureLegacyProfileDataForOriginalSpace(spaceId, profileId);
  return getShiftOverrides(buildSpaceProfileKey(spaceId, profileId));
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

export async function setShiftOverrideForSpace(
  spaceId: string,
  profileId: string,
  dateISO: string,
  overrideCode: ShiftType | null
): Promise<Record<string, ShiftType>> {
  const storageProfileId = buildSpaceProfileKey(spaceId, profileId);
  if (overrideCode === 'U') {
    logWarn('Storage', 'setShiftOverrideForSpace:reject', { reason: 'U not allowed as override', spaceId, profileId });
    return getShiftOverrides(storageProfileId);
  }

  const overrides = await getShiftOverrides(storageProfileId);
  const originalCode = await getShiftForDateForSpace(spaceId, profileId, dateISO);

  if (overrideCode === null) {
    delete overrides[dateISO];
    await clearDayChange(storageProfileId, dateISO);
  } else {
    overrides[dateISO] = overrideCode;
    await setDayChange(storageProfileId, dateISO, originalCode, overrideCode, 'override');
  }

  await saveShiftOverrides(storageProfileId, overrides);
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

export async function getDayChangesForSpace(
  spaceId: string,
  profileId: string
): Promise<Record<string, DayChange>> {
  await ensureLegacyProfileDataForOriginalSpace(spaceId, profileId);
  return getDayChanges(buildSpaceProfileKey(spaceId, profileId));
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
    
    const plan = getShiftPlanFromMapForSpace(allPlans, spaceId, member.id);
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
    if (raw) {
      const map = JSON.parse(raw) as Record<string, SpaceRuleProfile>;
      if (map[spaceId]) {
        logInfo('RULESYNC', 'getSpaceRuleProfile from dedicated map', { spaceId });
        return map[spaceId];
      }
    }
    // Fallback: aus Space-Objekt lesen (falls über TeamSync angekommen)
    const spaces = await getSpaces();
    const space = spaces.find((s) => s.id === spaceId);
    const profile = space?.spaceRuleProfile ?? null;
    logInfo('RULESYNC', 'getSpaceRuleProfile fallback to Space object', {
      spaceId,
      found: profile != null,
    });
    return profile;
  } catch (e) {
    logError('RULESYNC', 'getSpaceRuleProfile error', e);
    return null;
  }
}

/**
 * Persist a rule profile received via TeamSync into the dedicated storage map.
 * This ensures the profile survives offline scenarios where the Space object
 * might be overwritten without a rule profile.
 */
export async function persistSyncedRuleProfile(profile: SpaceRuleProfile): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIME_ACCOUNT_SPACE_RULES);
    const map: Record<string, SpaceRuleProfile> = raw ? JSON.parse(raw) : {};
    const existing = map[profile.spaceId];
    const mergedVault = mergeShiftPatternVaultForStorage(
      existing?.shiftPatternVault,
      profile.shiftPatternVault
    );
    const existingUpdatedAt = timestampForRuleProfileMerge(existing?.updatedAt);
    const incomingUpdatedAt = timestampForRuleProfileMerge(profile.updatedAt);
    const base = existing && existingUpdatedAt > incomingUpdatedAt ? existing : profile;
    map[profile.spaceId] = {
      ...base,
      shiftPatternVault: mergedVault,
      updatedAt: new Date(Math.max(existingUpdatedAt, incomingUpdatedAt)).toISOString(),
    };
    await AsyncStorage.setItem(STORAGE_KEYS.TIME_ACCOUNT_SPACE_RULES, JSON.stringify(map));
    logInfo('RULESYNC', 'persistSyncedRuleProfile OK', {
      spaceId: profile.spaceId,
      vaultCount: mergedVault.length,
    });
  } catch (e) {
    logError('RULESYNC', 'persistSyncedRuleProfile failed', e);
  }
}

export async function setSpaceRuleProfile(profile: SpaceRuleProfile): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIME_ACCOUNT_SPACE_RULES);
    const map: Record<string, SpaceRuleProfile> = raw ? JSON.parse(raw) : {};
    map[profile.spaceId] = profile;
    await AsyncStorage.setItem(STORAGE_KEYS.TIME_ACCOUNT_SPACE_RULES, JSON.stringify(map));

    // Zusätzlich im Space-Objekt spiegeln, damit TeamSync mittransportieren kann.
    const spaces = await getSpaces();
    const nextSpaces = spaces.map((s) =>
      s.id === profile.spaceId ? { ...s, spaceRuleProfile: profile } : s
    );
    await setSpaces(nextSpaces);

    logInfo('Storage', 'setSpaceRuleProfile', { spaceId: profile.spaceId });
  } catch (e) {
    logError('Storage', 'setSpaceRuleProfile failed', e);
  }
}

function timestampForRuleProfileMerge(value: string | undefined): number {
  const time = value ? Date.parse(value) : 0;
  return Number.isFinite(time) ? time : 0;
}

function mergeShiftPatternVaultForStorage(
  localVault: ShiftPatternTemplate[] | undefined,
  remoteVault: ShiftPatternTemplate[] | undefined
): ShiftPatternTemplate[] {
  const byId = new Map<string, ShiftPatternTemplate>();
  for (const item of remoteVault ?? []) {
    if (item?.id) byId.set(item.id, item);
  }
  for (const item of localVault ?? []) {
    if (!item?.id) continue;
    const existing = byId.get(item.id);
    if (
      !existing ||
      timestampForRuleProfileMerge(item.updatedAt) >= timestampForRuleProfileMerge(existing.updatedAt)
    ) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => timestampForRuleProfileMerge(b.updatedAt) - timestampForRuleProfileMerge(a.updatedAt)
  );
}

function createDefaultSpaceRuleProfile(spaceId: string): SpaceRuleProfile {
  const now = new Date().toISOString();
  return {
    spaceId,
    bundesland: 'NW',
    branche: '',
    ruleProfileName: 'Space-Regelprofil',
    sourceLabel: 'YASA Default',
    codeRules: {
      W: { enabled: false },
      T: { enabled: false },
    },
    holidayCredit: {
      enabled: false,
      hoursPerHolidayShift: 0,
    },
    preHolidayCredit: {
      enabled: false,
      hoursPerOccurrence: 0,
    },
    schoolHolidaysEnabledByDefault: false,
    shiftPatternVault: [],
    updatedAt: now,
  };
}

function sanitizeShiftPatternVault(input: unknown): ShiftPatternTemplate[] {
  if (!Array.isArray(input)) return [];
  const now = new Date().toISOString();
  return input
    .filter((item) => item && typeof item === 'object')
    .map((raw) => {
      const item = raw as Partial<ShiftPatternTemplate>;
      return {
        id: String(item.id ?? generateUUID()),
        name: String(item.name ?? '').trim(),
        pattern: Array.isArray(item.pattern) ? item.pattern.map((v) => String(v)) : [],
        cycleLengthDays: Math.max(1, Number(item.cycleLengthDays ?? 1)),
        createdByProfileId: String(item.createdByProfileId ?? ''),
        createdByDisplayName: String(item.createdByDisplayName ?? ''),
        createdAt: String(item.createdAt ?? now),
        updatedAt: String(item.updatedAt ?? now),
      };
    })
    .filter((item) => item.name.length > 0 && item.pattern.length > 0);
}

export async function getSpaceShiftPatternVault(spaceId: string): Promise<ShiftPatternTemplate[]> {
  const profile = await getSpaceRuleProfile(spaceId);
  return sanitizeShiftPatternVault(profile?.shiftPatternVault ?? []);
}

export async function upsertSpaceShiftPatternTemplate(
  spaceId: string,
  template: {
    id?: string;
    name: string;
    pattern: string[];
    cycleLengthDays: number;
    createdByProfileId: string;
    createdByDisplayName: string;
  }
): Promise<ShiftPatternTemplate[]> {
  const now = new Date().toISOString();
  const existingProfile = (await getSpaceRuleProfile(spaceId)) ?? createDefaultSpaceRuleProfile(spaceId);
  const currentVault = sanitizeShiftPatternVault(existingProfile.shiftPatternVault ?? []);
  const nextId = template.id ?? generateUUID();
  const nextItem: ShiftPatternTemplate = {
    id: nextId,
    name: template.name.trim(),
    pattern: template.pattern.map((code) => String(code)),
    cycleLengthDays: Math.max(1, Math.round(template.cycleLengthDays)),
    createdByProfileId: template.createdByProfileId,
    createdByDisplayName: template.createdByDisplayName,
    createdAt: currentVault.find((item) => item.id === nextId)?.createdAt ?? now,
    updatedAt: now,
  };

  const withoutCurrent = currentVault.filter((item) => item.id !== nextId);
  const nextVault = [...withoutCurrent, nextItem].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  await setSpaceRuleProfile({
    ...existingProfile,
    shiftPatternVault: nextVault,
    updatedAt: now,
  });
  return nextVault;
}

export async function deleteSpaceShiftPatternTemplate(
  spaceId: string,
  templateId: string
): Promise<ShiftPatternTemplate[]> {
  const existingProfile = await getSpaceRuleProfile(spaceId);
  if (!existingProfile) return [];
  const currentVault = sanitizeShiftPatternVault(existingProfile.shiftPatternVault ?? []);
  const nextVault = currentVault.filter((item) => item.id !== templateId);
  await setSpaceRuleProfile({
    ...existingProfile,
    shiftPatternVault: nextVault,
    updatedAt: new Date().toISOString(),
  });
  return nextVault;
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

export async function getUserTimeAccountProfileForSpace(
  spaceId: string,
  profileId: string
): Promise<UserTimeAccountProfile | null> {
  await ensureLegacyProfileDataForOriginalSpace(spaceId, profileId);
  const scoped = await getUserTimeAccountProfile(buildSpaceProfileKey(spaceId, profileId));
  return scoped ? { ...scoped, profileId } : null;
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

export async function setUserTimeAccountProfileForSpace(
  spaceId: string,
  profile: UserTimeAccountProfile
): Promise<void> {
  await setUserTimeAccountProfile({
    ...profile,
    profileId: buildSpaceProfileKey(spaceId, profile.profileId),
  });
}

function normalizeNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100) / 100);
}

function normalizeSigned(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function defaultTimeBudget(profileId: string): UserTimeBudgetProfile {
  return {
    profileId,
    annualVacationEntitlementDays: 0,
    vacationDays: 0,
    wDays: 0,
    glzHours: 0,
    fzgaHours: 0,
    vzgaHours: 0,
    updatedAt: new Date().toISOString(),
  };
}

function sanitizeTimeBudget(input: UserTimeBudgetProfile): UserTimeBudgetProfile {
  return {
    profileId: input.profileId,
    annualVacationEntitlementDays: normalizeNonNegative(input.annualVacationEntitlementDays),
    vacationDays: normalizeNonNegative(input.vacationDays),
    wDays: normalizeNonNegative(input.wDays),
    // GLZ darf bewusst auch negativ sein.
    glzHours: normalizeSigned(input.glzHours),
    fzgaHours: normalizeNonNegative(input.fzgaHours),
    vzgaHours: normalizeNonNegative(input.vzgaHours),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

export async function getUserTimeBudgetProfile(profileId: string): Promise<UserTimeBudgetProfile> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIME_ACCOUNT_BUDGET);
    if (!raw) return defaultTimeBudget(profileId);
    const map = JSON.parse(raw) as Record<string, UserTimeBudgetProfile>;
    const found = map[profileId];
    if (!found) return defaultTimeBudget(profileId);
    return sanitizeTimeBudget(found);
  } catch {
    return defaultTimeBudget(profileId);
  }
}

export async function setUserTimeBudgetProfile(profile: UserTimeBudgetProfile): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIME_ACCOUNT_BUDGET);
    const map: Record<string, UserTimeBudgetProfile> = raw ? JSON.parse(raw) : {};
    const sanitized = sanitizeTimeBudget({
      ...profile,
      updatedAt: new Date().toISOString(),
    });
    map[sanitized.profileId] = sanitized;
    await AsyncStorage.setItem(STORAGE_KEYS.TIME_ACCOUNT_BUDGET, JSON.stringify(map));
    logInfo('Storage', 'setUserTimeBudgetProfile', { profileId: sanitized.profileId });
  } catch (e) {
    logError('Storage', 'setUserTimeBudgetProfile failed', e);
  }
}

type XCompensationStore = Record<string, Record<string, XCompensationBooking>>;

async function getAllXCompensationBookings(): Promise<XCompensationStore> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.X_COMPENSATION_BOOKINGS);
    if (!raw) return {};
    return JSON.parse(raw) as XCompensationStore;
  } catch {
    return {};
  }
}

async function saveXCompensationBookingsForProfile(
  profileId: string,
  bookings: Record<string, XCompensationBooking>
): Promise<void> {
  await runSerializedWrite(STORAGE_KEYS.X_COMPENSATION_BOOKINGS, async () => {
    const all = await getAllXCompensationBookings();
    all[profileId] = { ...bookings };
    await AsyncStorage.setItem(STORAGE_KEYS.X_COMPENSATION_BOOKINGS, JSON.stringify(all));
  });
}

export async function getXCompensationBookings(
  profileId: string
): Promise<Record<string, XCompensationBooking>> {
  const all = await getAllXCompensationBookings();
  return all[profileId] ?? {};
}

export async function getXCompensationBooking(
  profileId: string,
  dateISO: string
): Promise<XCompensationBooking | null> {
  const bookings = await getXCompensationBookings(profileId);
  return bookings[dateISO] ?? null;
}

function restoreBudgetSource(
  budget: UserTimeBudgetProfile,
  source: XCompensationSource,
  requiredHours: number
): UserTimeBudgetProfile {
  const hours = normalizeNonNegative(requiredHours);
  if (source === 'U') return { ...budget, vacationDays: normalizeNonNegative(budget.vacationDays + 1) };
  if (source === 'W') return { ...budget, wDays: normalizeNonNegative(budget.wDays + 1) };
  if (source === 'GLZ') return { ...budget, glzHours: normalizeSigned(budget.glzHours + hours) };
  if (source === 'FZGA') return { ...budget, fzgaHours: normalizeNonNegative(budget.fzgaHours + hours) };
  return { ...budget, vzgaHours: normalizeNonNegative(budget.vzgaHours + hours) };
}

function consumeBudgetSource(
  budget: UserTimeBudgetProfile,
  source: XCompensationSource,
  requiredHours: number
): { ok: true; budget: UserTimeBudgetProfile } | { ok: false; reason: string } {
  const hours = normalizeNonNegative(requiredHours);
  if (source === 'U') {
    if (budget.vacationDays < 1) return { ok: false, reason: 'Nicht genug Urlaubstage (U).' };
    return { ok: true, budget: { ...budget, vacationDays: normalizeNonNegative(budget.vacationDays - 1) } };
  }
  if (source === 'W') {
    if (budget.wDays < 1) return { ok: false, reason: 'Nicht genug W-Tage.' };
    return { ok: true, budget: { ...budget, wDays: normalizeNonNegative(budget.wDays - 1) } };
  }
  if (source === 'GLZ') {
    return { ok: true, budget: { ...budget, glzHours: normalizeSigned(budget.glzHours - hours) } };
  }
  if (source === 'FZGA') {
    if (budget.fzgaHours < hours) return { ok: false, reason: 'Nicht genug Feiertagsstunden (FZGA).' };
    return { ok: true, budget: { ...budget, fzgaHours: normalizeNonNegative(budget.fzgaHours - hours) } };
  }
  if (budget.vzgaHours < hours) return { ok: false, reason: 'Nicht genug Vorfeststunden (VZGA).' };
  return { ok: true, budget: { ...budget, vzgaHours: normalizeNonNegative(budget.vzgaHours - hours) } };
}

async function readTimeBudgetMap(): Promise<Record<string, UserTimeBudgetProfile>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIME_ACCOUNT_BUDGET);
    return raw ? JSON.parse(raw) as Record<string, UserTimeBudgetProfile> : {};
  } catch {
    return {};
  }
}

async function saveVacationDayForXCompensation(profileId: string, dateISO: string): Promise<void> {
  const days = await getVacationDays(profileId);
  if (days.includes(dateISO)) return;
  await saveVacationDays(profileId, [...days, dateISO].sort());
}

async function removeVacationDayForXCompensation(profileId: string, dateISO: string): Promise<void> {
  const days = await getVacationDays(profileId);
  if (!days.includes(dateISO)) return;
  await saveVacationDays(profileId, days.filter((day) => day !== dateISO));
}

async function resolveOriginalCodeForDayChange(profileId: string, dateISO: string): Promise<ShiftType | null> {
  const changes = await getDayChanges(profileId);
  if (dateISO in changes) return changes[dateISO].originalCode;
  const plan = await getShiftPlan(profileId);
  if (!plan) return null;
  return resolveOriginalShiftCodeForDate(plan, dateISO);
}

export async function applyXCompensationForDate(input: {
  profileId: string;
  dateISO: string;
  source: XCompensationSource;
  requiredHours: number;
  originalCode?: ShiftType | null;
}): Promise<{ ok: true; budget: UserTimeBudgetProfile; booking: XCompensationBooking } | { ok: false; reason: string; budget: UserTimeBudgetProfile }> {
  const requiredHours = normalizeNonNegative(input.requiredHours);
  const existing = await getXCompensationBooking(input.profileId, input.dateISO);
  let nextBudget: UserTimeBudgetProfile | null = null;

  const budgetResult = await runSerializedWrite(STORAGE_KEYS.TIME_ACCOUNT_BUDGET, async () => {
    const map = await readTimeBudgetMap();
    const current = sanitizeTimeBudget(map[input.profileId] ?? defaultTimeBudget(input.profileId));
    const restored = existing
      ? restoreBudgetSource(current, existing.source, existing.requiredHours)
      : current;
    const consumed = consumeBudgetSource(restored, input.source, requiredHours);
    if (!consumed.ok) {
      return { ok: false as const, reason: consumed.reason, budget: current };
    }
    const sanitized = sanitizeTimeBudget({
      ...consumed.budget,
      updatedAt: new Date().toISOString(),
    });
    map[input.profileId] = sanitized;
    await AsyncStorage.setItem(STORAGE_KEYS.TIME_ACCOUNT_BUDGET, JSON.stringify(map));
    nextBudget = sanitized;
    return { ok: true as const, budget: sanitized };
  });

  if (!budgetResult.ok) return budgetResult;

  const now = new Date().toISOString();
  const bookings = await getXCompensationBookings(input.profileId);
  const booking: XCompensationBooking = {
    profileId: input.profileId,
    dateISO: input.dateISO,
    source: input.source,
    requiredHours,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  bookings[input.dateISO] = booking;
  await saveXCompensationBookingsForProfile(input.profileId, bookings);

  const originalCode = input.originalCode ?? await resolveOriginalCodeForDayChange(input.profileId, input.dateISO);
  if (existing?.source === 'U' && input.source !== 'U') {
    await removeVacationDayForXCompensation(input.profileId, input.dateISO);
  }
  if (input.source === 'U') {
    await saveVacationDayForXCompensation(input.profileId, input.dateISO);
    await setDayChange(input.profileId, input.dateISO, originalCode, 'U', 'vacation');
  } else {
    await setDayChange(input.profileId, input.dateISO, originalCode, 'X', 'override');
  }

  return { ok: true, budget: nextBudget ?? budgetResult.budget, booking };
}

export async function clearXCompensationForDate(
  profileId: string,
  dateISO: string
): Promise<UserTimeBudgetProfile> {
  const existing = await getXCompensationBooking(profileId, dateISO);
  if (!existing) return getUserTimeBudgetProfile(profileId);

  const restoredBudget = await runSerializedWrite(STORAGE_KEYS.TIME_ACCOUNT_BUDGET, async () => {
    const map = await readTimeBudgetMap();
    const current = sanitizeTimeBudget(map[profileId] ?? defaultTimeBudget(profileId));
    const restored = sanitizeTimeBudget({
      ...restoreBudgetSource(current, existing.source, existing.requiredHours),
      updatedAt: new Date().toISOString(),
    });
    map[profileId] = restored;
    await AsyncStorage.setItem(STORAGE_KEYS.TIME_ACCOUNT_BUDGET, JSON.stringify(map));
    return restored;
  });

  const bookings = await getXCompensationBookings(profileId);
  delete bookings[dateISO];
  await saveXCompensationBookingsForProfile(profileId, bookings);
  if (existing.source === 'U') {
    await removeVacationDayForXCompensation(profileId, dateISO);
  }
  return restoredBudget;
}

export async function consumeTimeBudgetForX(input: {
  profileId: string;
  source: XCompensationSource;
  requiredHours: number;
}): Promise<{ ok: true; budget: UserTimeBudgetProfile } | { ok: false; reason: string; budget: UserTimeBudgetProfile }> {
  const current = await getUserTimeBudgetProfile(input.profileId);
  const requiredHours = normalizeNonNegative(input.requiredHours);
  const next: UserTimeBudgetProfile = { ...current };

  if (input.source === 'U') {
    if (current.vacationDays < 1) return { ok: false, reason: 'Nicht genug Urlaubstage (U).', budget: current };
    next.vacationDays = normalizeNonNegative(current.vacationDays - 1);
  } else if (input.source === 'W') {
    if (current.wDays < 1) return { ok: false, reason: 'Nicht genug W-Tage.', budget: current };
    next.wDays = normalizeNonNegative(current.wDays - 1);
  } else if (input.source === 'GLZ') {
    // GLZ darf ins Minus laufen.
    next.glzHours = normalizeSigned(current.glzHours - requiredHours);
  } else if (input.source === 'FZGA') {
    if (current.fzgaHours < requiredHours) return { ok: false, reason: 'Nicht genug Feiertagsstunden (FZGA).', budget: current };
    next.fzgaHours = normalizeNonNegative(current.fzgaHours - requiredHours);
  } else if (input.source === 'VZGA') {
    if (current.vzgaHours < requiredHours) return { ok: false, reason: 'Nicht genug Vorfeststunden (VZGA).', budget: current };
    next.vzgaHours = normalizeNonNegative(current.vzgaHours - requiredHours);
  }

  next.updatedAt = new Date().toISOString();
  await setUserTimeBudgetProfile(next);
  return { ok: true, budget: next };
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

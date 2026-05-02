import { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  BackHandler,
  Modal,
  PanResponder,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  getProfile,
  getSpaces,
  getCurrentSpaceId,
  getAllShiftPlans,
  buildSpaceProfileKey,
  getShiftPlanFromMapForSpace,
  saveShiftPlanForSpace,
  setSpaces,
  listGhosts,
  markGhostPresentForSpace,
  mergeRemoteGhosts,
  getShiftForDateForSpace,
  getPreparedIdProfiles,
  setShiftOverrideForSpace,
  getTimeClockConfigOrDefault,
  getUserTimeBudgetProfile,
  applyXCompensationForDate,
  clearXCompensationForDate,
  getXCompensationBookings,
  addSpaceStatusEvent,
  todayISO,
  isValidISODate,
} from '../../lib/storage';
import { pullShiftPlansByStorageKeys, pushShiftPlanToBackendKey } from '../../lib/backend/shiftSync';
import { pullGhostsForSpace } from '../../lib/backend/ghostSync';
import { syncTeamSpaces } from '../../lib/backend/teamSync';
import { pushSpaceStatusEvent } from '../../lib/backend/spaceStatusSync';
import { buildDayStatusMessage } from '../../lib/spaceStatusRelevance';
import { buildPreparedShiftpalEntries } from '../../lib/preparedProfilesShiftpals';
import { colors, SHIFT_META, SHIFT_SEQUENCE } from '../../constants/theme';
import { MultiavatarView } from '../../components/MultiavatarView';
import { resolveAvatarSeed } from '../../lib/avatarSeed';
import type { UserProfile, Space, MemberSnapshot, ShiftType, UserShiftPlan } from '../../types';
import type { UserTimeBudgetProfile, XCompensationBooking, XCompensationSource } from '../../types/timeAccount';

interface DayMemberEntry {
  member: MemberSnapshot;
  code: ShiftType | null;
  sameShift: boolean;
  isPrepared?: boolean;
  preparedProfileId?: string;
}

interface DayGhostEntry {
  member: MemberSnapshot;
  code: ShiftType;
}

const OVERRIDE_CODES: ShiftType[] = ['F', 'S', 'N', 'T', 'KS', 'KN', 'K', 'EK', 'U', 'R', 'X'];
const X_SOURCES: XCompensationSource[] = ['U', 'GLZ', 'FZGA', 'VZGA', 'W'];
const REGULAR_SHIFT_CODES: ShiftType[] = ['F', 'S', 'N', 'T', 'KS', 'KN'];

function isRegularShiftCode(code: ShiftType | null): code is ShiftType {
  return !!code && REGULAR_SHIFT_CODES.includes(code);
}

function addDaysISO(dateISO: string, deltaDays: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d + deltaDays);
  const date = new Date(utc);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

async function countConsecutiveStatusDays(
  spaceId: string,
  profileId: string,
  startDateISO: string,
  statusCode: ShiftType,
  maxDays = 30
): Promise<number> {
  let count = 0;
  for (let offset = 0; offset < maxDays; offset += 1) {
    const dateISO = addDaysISO(startDateISO, offset);
    const code = await getShiftForDateForSpace(spaceId, profileId, dateISO);
    if (code !== statusCode) break;
    count += 1;
  }
  return Math.max(1, count);
}

function formatGerman(dateISO: string): string {
  const [y, m, d] = dateISO.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function resolvePlanCode(plan: UserShiftPlan | undefined, dateISO: string): ShiftType | null {
  if (!plan) return null;
  const entry = plan.entries.find((e) => e.dateISO === dateISO);
  if (entry) return entry.code;
  return null;
}

function sourceLabel(source: XCompensationSource): string {
  if (source === 'U') return 'Urlaubstage (U)';
  if (source === 'W') return 'W-Tage (W)';
  if (source === 'GLZ') return 'Gleitzeitstunden (GLZ)';
  if (source === 'FZGA') return 'Feiertagsstunden (FZGA)';
  return 'Vorfeststunden (VZGA)';
}

function fmtHoursSigned(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(2).replace('.', ',')} h`;
}

function plannedHoursForShiftCode(
  shiftCode: ShiftType | null,
  cfg: Awaited<ReturnType<typeof getTimeClockConfigOrDefault>> | null
): number {
  if (!shiftCode || !cfg) return 8;
  if (!['F', 'S', 'N', 'KS', 'KN', 'T'].includes(shiftCode)) return 8;
  const window = cfg.shiftSettings[shiftCode as 'F' | 'S' | 'N' | 'KS' | 'KN' | 'T'];
  if (!window) return 8;
  const [sh, sm] = window.startTime.split(':').map(Number);
  const [eh, em] = window.endTime.split(':').map(Number);
  const start = (Number.isFinite(sh) ? sh : 0) * 60 + (Number.isFinite(sm) ? sm : 0);
  let end = (Number.isFinite(eh) ? eh : 0) * 60 + (Number.isFinite(em) ? em : 0);
  if (end <= start) end += 24 * 60;
  return Math.max(0, Math.round(((end - start) / 60) * 100) / 100);
}

export default function ShiftDayDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    dateISO?: string;
    returnTo?: string;
    returnDate?: string;
    returnMonthKey?: string;
  }>();

  const initialDate = typeof params.dateISO === 'string' && isValidISODate(params.dateISO)
    ? params.dateISO
    : todayISO();

  const returnTo = params.returnTo;
  const returnMonthKey = params.returnMonthKey;

  const [selectedDateISO, setSelectedDateISO] = useState(initialDate);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [isMember, setIsMember] = useState(true);
  const [myShift, setMyShift] = useState<ShiftType | null>(null);
  const [members, setMembers] = useState<DayMemberEntry[]>([]);
  const [ghostsPresent, setGhostsPresent] = useState<DayGhostEntry[]>([]);
  const [availableGhosts, setAvailableGhosts] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateError, setDateError] = useState(false);
  const [savingShift, setSavingShift] = useState(false);
  const [timeBudget, setTimeBudget] = useState<UserTimeBudgetProfile | null>(null);
  const [xCompensations, setXCompensations] = useState<Record<string, XCompensationBooking>>({});
  const [budgetExpanded, setBudgetExpanded] = useState(false);
  const [showXBudgetModal, setShowXBudgetModal] = useState(false);
  const [pendingXRequiredHours, setPendingXRequiredHours] = useState(0);
  const [pendingXFromShift, setPendingXFromShift] = useState<ShiftType | null>(null);
  const [selectedXSource, setSelectedXSource] = useState<XCompensationSource | null>(null);

  const [showGhostModal, setShowGhostModal] = useState(false);
  const [selectedGhost, setSelectedGhost] = useState<UserProfile | null>(null);
  const [selectedGhostShiftCode, setSelectedGhostShiftCode] = useState<ShiftType | null>(null);
  const [savingGhost, setSavingGhost] = useState(false);

  const navigatingBackRef = useRef(false);

  const handleBack = useCallback(() => {
    if (navigatingBackRef.current) return;
    navigatingBackRef.current = true;

    if (returnTo) {
      const out: {
        dateISO?: string;
        returnMonthKey?: string;
        suppressTaModal?: string;
        returnToken?: string;
      } = {};

      out.dateISO = selectedDateISO;
      out.returnMonthKey = selectedDateISO.slice(0, 7);
      if (returnTo === '/(shift)/calendar') out.suppressTaModal = '1';
      out.returnToken = String(Date.now());
      router.replace({ pathname: returnTo, params: out });
    } else {
      router.replace('/(shift)/calendar');
    }

    setTimeout(() => {
      navigatingBackRef.current = false;
    }, 350);
  }, [returnTo, router, selectedDateISO]);

  const loadData = useCallback(async (allowCachedSync = false) => {
    if (!isValidISODate(selectedDateISO)) {
      setDateError(true);
      setLoading(false);
      return;
    }

    const p = await getProfile();
    setProfile(p);
    if (!p) {
      setSpace(null);
      setTimeBudget(null);
      setLoading(false);
      return;
    }
    const currentSpaceId = await getCurrentSpaceId();
    if (!currentSpaceId) {
      setSpace(null);
      setLoading(false);
      return;
    }
    const scopedProfileId = buildSpaceProfileKey(currentSpaceId, p.id);
    const budget = await getUserTimeBudgetProfile(scopedProfileId);
    setTimeBudget(budget);
    setXCompensations(await getXCompensationBookings(scopedProfileId));

    const localSpaces = await getSpaces();
    let spaces = localSpaces;
    try {
      const syncResult = await syncTeamSpaces(
        p.id,
        localSpaces,
        allowCachedSync ? { allowCached: true } : {}
      );
      spaces = syncResult.spaces;
      await setSpaces(spaces);
    } catch {
      // best effort
    }

    const activeSpace = spaces.find((s) => s.id === currentSpaceId) ?? null;
    setSpace(activeSpace);
    if (!activeSpace) {
      setLoading(false);
      return;
    }

    const memberOk = activeSpace.memberProfiles.some((m) => m.id === p.id);
    setIsMember(memberOk);
    if (!memberOk) {
      setLoading(false);
      return;
    }

    let ghosts: UserProfile[] = [];
    try {
      const remoteGhosts = await pullGhostsForSpace(currentSpaceId);
      if (remoteGhosts.length > 0) {
        await mergeRemoteGhosts(currentSpaceId, remoteGhosts);
      }
    } catch {
      // best effort
    }
    ghosts = await listGhosts(currentSpaceId);
    setAvailableGhosts(ghosts);

    const allPlans = await getAllShiftPlans();
    let resolvedPlans = allPlans;
    try {
      const memberIds = activeSpace.memberProfiles.map((m) => buildSpaceProfileKey(currentSpaceId, m.id));
      const ghostIds = ghosts.map((g) => buildSpaceProfileKey(currentSpaceId, g.id));
      const remotePlans = await pullShiftPlansByStorageKeys([...memberIds, ...ghostIds]);
      if (Object.keys(remotePlans).length > 0) {
        resolvedPlans = { ...allPlans, ...remotePlans };
        await Promise.all(Object.values(remotePlans).map((plan) => saveShiftPlanForSpace(currentSpaceId, plan)));
      }
    } catch {
      // best effort
    }

    const ownCode = await getShiftForDateForSpace(currentSpaceId, p.id, selectedDateISO);
    setMyShift(ownCode);

    const memberRows: DayMemberEntry[] = [];
    for (const member of activeSpace.memberProfiles) {
      if (member.id === p.id) continue;
      const code = await getShiftForDateForSpace(currentSpaceId, member.id, selectedDateISO);
      memberRows.push({
        member,
        code,
        sameShift: ownCode !== null && code === ownCode,
      });
    }
    const preparedProfiles = await getPreparedIdProfiles(currentSpaceId);
    const preparedRows: DayMemberEntry[] = buildPreparedShiftpalEntries(
      preparedProfiles,
      selectedDateISO,
      ownCode,
      activeSpace.memberProfiles.map((member) => member.id)
    ).map((entry) => ({
      ...entry,
      sameShift: true,
      isPrepared: true,
    }));
    memberRows.push(...preparedRows);
    memberRows.sort((a, b) => Number(b.sameShift) - Number(a.sameShift));
    setMembers(memberRows);

    const ghostRows: DayGhostEntry[] = [];
    for (const ghost of ghosts) {
      const code = resolvePlanCode(getShiftPlanFromMapForSpace(resolvedPlans, currentSpaceId, ghost.id) ?? undefined, selectedDateISO);
      if (!code) continue;
      ghostRows.push({
        member: {
          id: ghost.id,
          displayName: ghost.ghostLabel ?? ghost.displayName,
          avatarUrl: ghost.avatarUrl,
        },
        code,
      });
    }
    setGhostsPresent(ghostRows);
    setLoading(false);
  }, [selectedDateISO]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setDateError(false);
      loadData(true).finally(() => {
        if (!active) return;
      });
      return () => {
        active = false;
      };
    }, [loadData])
  );

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack])
  );

  const goPrevDay = useCallback(() => {
    setSelectedDateISO((prev) => addDaysISO(prev, -1));
  }, []);

  const goNextDay = useCallback(() => {
    setSelectedDateISO((prev) => addDaysISO(prev, 1));
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx <= -45) {
            goNextDay();
          } else if (gesture.dx >= 45) {
            goPrevDay();
          }
        },
      }),
    [goNextDay, goPrevDay]
  );

  async function handleSetShift(overrideCode: ShiftType | null) {
    if (!profile || !space) return;
    const activeSpace = space;
    const previousVisibleCode = xCompensations[selectedDateISO]?.source === 'U' ? 'U' : myShift;
    if (overrideCode === 'U') {
      if (!timeBudget) {
        Alert.alert('Zeitguthaben fehlt', 'Bitte pflege zuerst dein Urlaubsguthaben im Freizeitkonto.');
        return;
      }
      const cfg = await getTimeClockConfigOrDefault(buildSpaceProfileKey(activeSpace.id, profile.id));
      const existing = xCompensations[selectedDateISO];
      const requiredHours = existing?.requiredHours ?? plannedHoursForShiftCode(
        myShift === 'X' ? null : myShift,
        cfg
      );
      if (requiredHours > 0 && requiredHours < 8) {
        const altHours = timeBudget.glzHours + timeBudget.fzgaHours + timeBudget.vzgaHours;
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Prüfhinweis',
            `Willst du wirklich für ${requiredHours.toFixed(2).replace('.', ',')} Dienststunden einen ganzen Urlaubstag einsetzen?\n\nDu hast noch ${altHours.toFixed(2).replace('.', ',')} Stunden in GLZ/FZGA/VZGA.`,
            [
              { text: 'Abbrechen', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Urlaub einsetzen', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        });
        if (!proceed) return;
      }

      setSavingShift(true);
      try {
        const wasAlreadyX = myShift === 'X';
        if (!wasAlreadyX) {
          await setShiftOverrideForSpace(activeSpace.id, profile.id, selectedDateISO, 'X');
        }
        const consume = await applyXCompensationForDate({
          profileId: buildSpaceProfileKey(activeSpace.id, profile.id),
          dateISO: selectedDateISO,
          source: 'U',
          requiredHours,
          originalCode: wasAlreadyX ? undefined : myShift,
        });
        if (!consume.ok) {
          Alert.alert('Nicht genug Urlaub', consume.reason);
          if (!wasAlreadyX) {
            await setShiftOverrideForSpace(activeSpace.id, profile.id, selectedDateISO, null);
          }
          return;
        }
        setTimeBudget(consume.budget);
        await loadData();
        if (!existing) {
          await publishDayStatusEvent(previousVisibleCode, 'X', 'Frei genommen gesetzt');
        }
        Alert.alert('Urlaub gesetzt', 'Urlaubsguthaben wurde belastet und der Tag als Urlaub markiert.');
      } finally {
        setSavingShift(false);
      }
      return;
    }

    if (overrideCode === 'X') {
      const cfg = await getTimeClockConfigOrDefault(buildSpaceProfileKey(activeSpace.id, profile.id));
      const existing = xCompensations[selectedDateISO];
      const requiredHours = existing?.requiredHours ?? plannedHoursForShiftCode(
        existing ? pendingXFromShift : myShift,
        cfg
      );
      setPendingXRequiredHours(requiredHours);
      setPendingXFromShift(myShift === 'X' ? null : myShift);
      setSelectedXSource(existing?.source ?? null);
      setShowXBudgetModal(true);
      return;
    }
    setSavingShift(true);
    try {
      if (myShift === 'X') {
      const restored = await clearXCompensationForDate(buildSpaceProfileKey(activeSpace.id, profile.id), selectedDateISO);
      setTimeBudget(restored);
      }
      await setShiftOverrideForSpace(activeSpace.id, profile.id, selectedDateISO, overrideCode);
      await loadData();
      const durationDays =
        overrideCode === 'K'
          ? await countConsecutiveStatusDays(activeSpace.id, profile.id, selectedDateISO, 'K')
          : undefined;
      await publishDayStatusEvent(previousVisibleCode, overrideCode, 'Tagesstatus geändert', {
        durationDays,
      });
    } finally {
      setSavingShift(false);
    }
  }

  async function publishDayStatusEvent(
    oldCode: ShiftType | null,
    newCode: ShiftType | null,
    title: string,
    options: { durationDays?: number } = {}
  ): Promise<void> {
    if (!profile || !space) return;
    const today = todayISO();
    if (selectedDateISO < today) return;
    const targetShiftCode = isRegularShiftCode(oldCode)
      ? oldCode
      : isRegularShiftCode(pendingXFromShift)
        ? pendingXFromShift
        : isRegularShiftCode(myShift)
          ? myShift
          : null;
    const message = buildDayStatusMessage(
      profile.displayName,
      selectedDateISO,
      today,
      targetShiftCode ?? oldCode,
      newCode,
      options
    );
    const event = await addSpaceStatusEvent({
      spaceId: space.id,
      type: 'day_status_changed',
      audience: 'shiftpals',
      actorProfileId: profile.id,
      actorDisplayName: profile.displayName,
      title: message.title || title,
      body: message.body,
      dateISO: selectedDateISO,
      targetShiftCode,
      oldShiftCode: oldCode,
      newShiftCode: newCode,
      metadata: {
        source: 'shift-day-detail',
        fallbackTitle: title,
        durationDays: options.durationDays ?? null,
      },
    });
    try {
      await pushSpaceStatusEvent(event);
    } catch {
      // best effort; local status history remains available and next iterations can retry
    }
  }

  async function handleConfirmXSource() {
    if (!profile || !space || !selectedXSource || !timeBudget) return;
    const activeSpace = space;

    const isDaySource = selectedXSource === 'U' || selectedXSource === 'W';
    if (isDaySource && pendingXRequiredHours > 0 && pendingXRequiredHours < 8) {
      const altHours =
        timeBudget.glzHours + timeBudget.fzgaHours + timeBudget.vzgaHours;
      const proceed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Prüfhinweis',
          `Willst du wirklich für ${pendingXRequiredHours.toFixed(2).replace('.', ',')} Dienststunden einen ganzen Urlaubstag oder W-Tag einsetzen?\n\nDu hast noch ${altHours.toFixed(2).replace('.', ',')} Stunden in GLZ/FZGA/VZGA. Das wäre sinnvoller.`,
          [
            { text: 'Abbrechen', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Trotzdem fortfahren', style: 'destructive', onPress: () => resolve(true) },
          ]
        );
      });
      if (!proceed) return;
    }

    setSavingShift(true);
    try {
      const wasAlreadyX = myShift === 'X';
      const hadExistingCompensation = Boolean(xCompensations[selectedDateISO]);
      if (!wasAlreadyX) {
        await setShiftOverrideForSpace(activeSpace.id, profile.id, selectedDateISO, 'X');
      }
      const consume = await applyXCompensationForDate({
        profileId: buildSpaceProfileKey(activeSpace.id, profile.id),
        dateISO: selectedDateISO,
        source: selectedXSource,
        requiredHours: pendingXRequiredHours,
        originalCode: pendingXFromShift,
      });
      if (!consume.ok) {
        Alert.alert('Nicht genug Guthaben', consume.reason);
        if (!wasAlreadyX) {
          await setShiftOverrideForSpace(activeSpace.id, profile.id, selectedDateISO, null);
        }
        return;
      }
      setTimeBudget(consume.budget);

      setShowXBudgetModal(false);
      setSelectedXSource(null);
      await loadData();
      if (!hadExistingCompensation) {
        await publishDayStatusEvent(myShift, 'X', 'Frei genommen gesetzt');
      }
      Alert.alert(
        hadExistingCompensation ? 'Ausgleich geändert' : 'Frei genommen gesetzt',
        `${sourceLabel(selectedXSource)} wurde belastet.`
      );
    } finally {
      setSavingShift(false);
    }
  }

  async function handleConfirmGhostPresence() {
    if (!selectedGhost || !selectedGhostShiftCode) return;
    if (!space) return;
    const activeSpace = space;
    setSavingGhost(true);
    try {
      await markGhostPresentForSpace(activeSpace.id, selectedGhost.id, selectedDateISO, selectedGhostShiftCode);
      try {
        const allPlans = await getAllShiftPlans();
        const ghostPlan = getShiftPlanFromMapForSpace(allPlans, activeSpace.id, selectedGhost.id);
        if (ghostPlan) {
          await pushShiftPlanToBackendKey(buildSpaceProfileKey(activeSpace.id, ghostPlan.profileId), ghostPlan);
        }
      } catch {
        // best effort
      }
      setShowGhostModal(false);
      setSelectedGhost(null);
      setSelectedGhostShiftCode(null);
      await loadData();
    } finally {
      setSavingGhost(false);
    }
  }

  if (dateError) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Ungültiges Datum</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(shift)/calendar')}>
          <Text style={styles.primaryBtnText}>Zurück zum Kalender</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Profil benötigt</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(auth)/create-profile')}>
          <Text style={styles.primaryBtnText}>Profil erstellen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!space) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Kein Space aktiv</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(space)/choose')}>
          <Text style={styles.primaryBtnText}>Space wählen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!isMember) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Kein Mitglied im aktiven Space</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(space)/choose')}>
          <Text style={styles.primaryBtnText}>Space wechseln</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const selectedDateLabel = formatGerman(selectedDateISO);
  const selectedXCompensation = xCompensations[selectedDateISO];
  const effectiveMyShift: ShiftType | null = selectedXCompensation?.source === 'U'
    ? 'U'
    : selectedXCompensation?.source === 'W'
      ? 'X'
      : myShift;
  const myMeta = effectiveMyShift ? SHIFT_META[effectiveMyShift] : null;
  const sameShiftCount = members.filter((m) => m.sameShift).length;

  return (
    <View style={styles.screen} {...panResponder.panHandlers}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Shiftpals Tagesdetails</Text>
        <Text style={styles.subtitle}>{selectedDateLabel}</Text>
        <Text style={styles.spaceHint}>
          Space: <Text style={styles.spaceName}>{space.name}</Text>
        </Text>

        <View style={styles.navRow}>
          <TouchableOpacity style={styles.navBtn} onPress={goPrevDay}>
            <Text style={styles.navBtnText}>‹ Vorheriger Tag</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={goNextDay}>
            <Text style={styles.navBtnText}>Nächster Tag ›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Deine Schicht am gewählten Tag</Text>
          <View style={styles.meRow}>
            <MultiavatarView
              seed={resolveAvatarSeed(profile.id, profile.displayName, profile.avatarUrl)}
              size={44}
            />
            <View style={styles.meTextWrap}>
              <Text style={styles.meName}>{profile.displayName}</Text>
              {myMeta ? (
                <View style={[styles.shiftPill, { backgroundColor: myMeta.bg }]}>
                  <Text style={[styles.shiftPillText, { color: myMeta.fg }]}>
                    {myMeta.label} · {myMeta.desc}
                  </Text>
                </View>
              ) : (
                <Text style={styles.muted}>Kein Dienstplan-Eintrag vorhanden.</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Shiftpals ({members.length})</Text>
          <Text style={styles.muted}>Gleiche Schicht wie du: {sameShiftCount}</Text>
          {members.length === 0 ? (
            <Text style={styles.muted}>Keine weiteren Mitglieder im Space.</Text>
          ) : (
            members.map((entry) => {
              const code = entry.code;
              const meta = code ? SHIFT_META[code] : null;
              return (
                <View
                  key={entry.isPrepared ? `prepared:${entry.preparedProfileId ?? entry.member.id}` : entry.member.id}
                  style={[styles.memberRow, entry.isPrepared && styles.preparedMemberRow]}
                >
                  <MultiavatarView
                    seed={resolveAvatarSeed(entry.member.id, entry.member.displayName, entry.member.avatarUrl)}
                    size={38}
                  />
                  <View style={styles.memberTextWrap}>
                    <Text style={styles.memberName}>{entry.member.displayName}</Text>
                    <Text style={styles.memberSub}>
                      {entry.isPrepared
                        ? 'Vorbereitet'
                        : entry.sameShift
                          ? 'Gleiche Schicht'
                          : 'Andere Schicht'}
                    </Text>
                  </View>
                  {meta ? (
                    <View style={[styles.memberShiftBadge, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.memberShiftText, { color: meta.fg }]}>{meta.label}</Text>
                    </View>
                  ) : (
                    <View style={styles.memberNoShift}>
                      <Text style={styles.memberNoShiftText}>—</Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Schicht ändern</Text>
          <Text style={styles.muted}>
            Optional: Tagesstatus anpassen oder einen Ausgleich über Guthaben buchen.
          </Text>
          {timeBudget ? (
            <View style={styles.budgetBox}>
              <TouchableOpacity
                style={styles.budgetHeader}
                onPress={() => setBudgetExpanded((prev) => !prev)}
                activeOpacity={0.75}
              >
                <Text style={styles.budgetTitle}>Guthaben</Text>
                <Text style={styles.budgetToggle}>{budgetExpanded ? '▾' : '▸'}</Text>
              </TouchableOpacity>
              {budgetExpanded ? (
                <>
                  <View style={styles.budgetSection}>
                    <Text style={styles.budgetSectionTitle}>Urlaubsguthaben</Text>
                    <Text style={styles.budgetLine}>
                      U: {timeBudget.vacationDays.toFixed(0)} Tage · W: {timeBudget.wDays.toFixed(0)} Tage
                    </Text>
                  </View>
                  <View style={styles.budgetSection}>
                    <Text style={styles.budgetSectionTitle}>Zeitguthaben</Text>
                    <Text style={styles.budgetLine}>
                      GLZ: {fmtHoursSigned(timeBudget.glzHours)} · FZGA: {timeBudget.fzgaHours.toFixed(2).replace('.', ',')} h · VZGA: {timeBudget.vzgaHours.toFixed(2).replace('.', ',')} h
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={styles.budgetLine}>
                  U {timeBudget.vacationDays.toFixed(0)} · GLZ {fmtHoursSigned(timeBudget.glzHours)}
                </Text>
              )}
            </View>
          ) : null}
          <View style={styles.codeGrid}>
            {OVERRIDE_CODES.map((code) => {
              const meta = SHIFT_META[code];
              const active = effectiveMyShift === code || (code === 'X' && myShift === 'X' && selectedXCompensation?.source !== 'U');
              return (
                <TouchableOpacity
                  key={code}
                  style={[
                    styles.codeBtn,
                    { backgroundColor: meta.bg },
                    active && styles.codeBtnActive,
                  ]}
                  onPress={() => handleSetShift(code)}
                  disabled={savingShift}
                >
                  <Text style={[styles.codeBtnCode, { color: meta.fg }]}>{meta.label}</Text>
                  <Text style={[styles.codeBtnDesc, { color: meta.fg }]}>{meta.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => handleSetShift(null)}
            disabled={savingShift}
          >
            <Text style={styles.resetBtnText}>Override entfernen (Originalplan)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ghosts am gewählten Tag ({ghostsPresent.length})</Text>
          {ghostsPresent.length === 0 ? (
            <Text style={styles.muted}>Keine Ghost-Einträge für diesen Tag.</Text>
          ) : (
            ghostsPresent.map((entry) => {
              const meta = SHIFT_META[entry.code];
              return (
                <View key={entry.member.id} style={styles.memberRow}>
                  <MultiavatarView
                    seed={resolveAvatarSeed(entry.member.id, entry.member.displayName, entry.member.avatarUrl)}
                    size={38}
                  />
                  <View style={styles.memberTextWrap}>
                    <Text style={styles.memberName}>{entry.member.displayName}</Text>
                    <Text style={styles.memberSub}>Ghost</Text>
                  </View>
                  <View style={[styles.memberShiftBadge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.memberShiftText, { color: meta.fg }]}>{meta.label}</Text>
                  </View>
                </View>
              );
            })
          )}

          {availableGhosts.length > 0 && (
            <TouchableOpacity
              style={styles.ghostMarkBtn}
              onPress={() => {
                setSelectedGhost(null);
                setSelectedGhostShiftCode(null);
                setShowGhostModal(true);
              }}
            >
              <Text style={styles.ghostMarkBtnText}>👻 Ghost als anwesend markieren</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.cancelBtn} onPress={handleBack}>
          <Text style={styles.cancelBtnText}>Abbrechen</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={showXBudgetModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowXBudgetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>X = Frei genommen</Text>
            <Text style={styles.muted}>
              Aus welchem Zeitguthaben soll ausgeglichen werden?
            </Text>
            <Text style={styles.muted}>
              Dienst: {pendingXFromShift ?? '—'} · Bedarf: {pendingXRequiredHours.toFixed(2).replace('.', ',')} h
            </Text>
            <View style={styles.xSourceList}>
              {X_SOURCES.map((source) => {
                const selected = selectedXSource === source;
                const available = timeBudget
                  ? source === 'U'
                    ? `${timeBudget.vacationDays.toFixed(0)} Tage`
                    : source === 'W'
                        ? `${timeBudget.wDays.toFixed(0)} Tage`
                      : source === 'GLZ'
                        ? fmtHoursSigned(timeBudget.glzHours)
                        : source === 'FZGA'
                          ? `${timeBudget.fzgaHours.toFixed(2).replace('.', ',')} h`
                          : `${timeBudget.vzgaHours.toFixed(2).replace('.', ',')} h`
                  : '—';
                return (
                  <TouchableOpacity
                    key={source}
                    style={[styles.xSourceBtn, selected && styles.xSourceBtnActive]}
                    onPress={() => setSelectedXSource(source)}
                  >
                    <Text style={[styles.xSourceLabel, selected && styles.xSourceLabelActive]}>
                      {sourceLabel(source)}
                    </Text>
                    <Text style={styles.xSourceAvailable}>Verfügbar: {available}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowXBudgetModal(false)}>
                <Text style={styles.modalCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, (!selectedXSource || savingShift) && styles.modalSaveBtnDisabled]}
                onPress={handleConfirmXSource}
                disabled={!selectedXSource || savingShift}
              >
                <Text style={styles.modalSaveText}>{savingShift ? 'Speichere…' : 'X setzen'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showGhostModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGhostModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ghost markieren ({selectedDateISO})</Text>

            <Text style={styles.modalStep}>1. Ghost auswählen</Text>
            <ScrollView style={styles.modalGhostList} nestedScrollEnabled>
              {availableGhosts.map((ghost) => {
                const selected = selectedGhost?.id === ghost.id;
                return (
                  <TouchableOpacity
                    key={ghost.id}
                    style={[styles.modalGhostItem, selected && styles.modalGhostItemActive]}
                    onPress={() => setSelectedGhost(ghost)}
                  >
                    <MultiavatarView
                      seed={resolveAvatarSeed(ghost.id, ghost.ghostLabel ?? ghost.displayName, ghost.avatarUrl)}
                      size={30}
                    />
                    <Text style={[styles.modalGhostName, selected && styles.modalGhostNameActive]}>
                      {ghost.ghostLabel ?? ghost.displayName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {!!selectedGhost && (
              <>
                <Text style={styles.modalStep}>2. Schicht auswählen</Text>
                <View style={styles.modalShiftGrid}>
                  {SHIFT_SEQUENCE.map((code) => {
                    if (code === 'U') return null;
                    const meta = SHIFT_META[code];
                    const selected = selectedGhostShiftCode === code;
                    return (
                      <TouchableOpacity
                        key={code}
                        style={[
                          styles.modalShiftBtn,
                          { backgroundColor: meta.bg },
                          selected && styles.modalShiftBtnActive,
                        ]}
                        onPress={() => setSelectedGhostShiftCode(code)}
                      >
                        <Text style={[styles.modalShiftCode, { color: meta.fg }]}>{meta.label}</Text>
                        <Text style={[styles.modalShiftDesc, { color: meta.fg }]}>{meta.desc}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowGhostModal(false)}>
                <Text style={styles.modalCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSaveBtn,
                  (!selectedGhost || !selectedGhostShiftCode || savingGhost) && styles.modalSaveBtnDisabled,
                ]}
                disabled={!selectedGhost || !selectedGhostShiftCode || savingGhost}
                onPress={handleConfirmGhostPresence}
              >
                <Text style={styles.modalSaveText}>{savingGhost ? 'Speichere…' : 'Bestätigen'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: 20,
    paddingTop: 58,
    paddingBottom: 42,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  spaceHint: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  spaceName: {
    color: colors.secondaryDark,
    fontWeight: '600',
  },
  navRow: {
    flexDirection: 'row',
    gap: 10,
  },
  navBtn: {
    flex: 1,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  navBtnText: {
    color: colors.secondaryDark,
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  budgetBox: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    padding: 8,
    gap: 2,
  },
  budgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 28,
  },
  budgetTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  budgetToggle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
    lineHeight: 18,
  },
  budgetSection: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 8,
    marginTop: 6,
    gap: 2,
  },
  budgetSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  budgetLine: {
    fontSize: 12,
    color: colors.textPrimary,
  },
  meRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  meTextWrap: {
    flex: 1,
    gap: 4,
  },
  meName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  muted: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  shiftPill: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  shiftPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  codeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  codeBtn: {
    minWidth: 75,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  codeBtnActive: {
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  codeBtnCode: {
    fontSize: 14,
    fontWeight: '800',
  },
  codeBtnDesc: {
    fontSize: 10,
    fontWeight: '500',
  },
  resetBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  preparedMemberRow: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  memberTextWrap: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  memberSub: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  memberShiftBadge: {
    borderRadius: 8,
    minWidth: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  memberShiftText: {
    fontSize: 13,
    fontWeight: '800',
  },
  memberNoShift: {
    borderRadius: 8,
    minWidth: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundTertiary,
  },
  memberNoShiftText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textTertiary,
  },
  ghostMarkBtn: {
    borderWidth: 1,
    borderColor: colors.purple,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.purpleLight + '25',
    marginTop: 6,
  },
  ghostMarkBtnText: {
    color: colors.purple,
    fontSize: 13,
    fontWeight: '700',
  },
  cancelBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
    marginTop: 4,
  },
  cancelBtnText: {
    color: colors.secondaryDark,
    fontSize: 15,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginTop: 12,
  },
  primaryBtnText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 14,
    padding: 16,
    maxHeight: '82%',
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalStep: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  modalGhostList: {
    maxHeight: 160,
  },
  modalGhostItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  modalGhostItemActive: {
    backgroundColor: colors.primaryBackground,
    borderWidth: 1,
    borderColor: colors.primaryVariant,
  },
  modalGhostName: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  modalGhostNameActive: {
    fontWeight: '700',
  },
  modalShiftGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  xSourceList: {
    gap: 8,
    marginTop: 6,
  },
  xSourceBtn: {
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 3,
  },
  xSourceBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBackground,
  },
  xSourceLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  xSourceLabelActive: {
    color: colors.primary,
  },
  xSourceAvailable: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  modalShiftBtn: {
    minWidth: 72,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  modalShiftBtnActive: {
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  modalShiftCode: {
    fontSize: 14,
    fontWeight: '800',
  },
  modalShiftDesc: {
    fontSize: 10,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
  },
  modalCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  modalSaveBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  modalSaveBtnDisabled: {
    opacity: 0.45,
  },
  modalSaveText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '700',
  },
});

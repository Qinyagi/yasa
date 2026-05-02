import { useState, useCallback, useEffect, useRef } from 'react';
import {
  colors, typography, spacing, borderRadius, accessibility,
  SHIFT_META, SHIFT_SEQUENCE, WEEKDAY_LABELS, MONTH_LABELS,
} from '../../constants/theme';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  getProfile,
  generateShiftEntries,
  saveShiftPlanForSpace,
  getShiftPlan,
  getShiftPlanForSpace,
  getShiftColorOverrides,
  formatDateISO,
  todayISO,
  isValidISODate,
  getCurrentSpaceId,
  getSpaceRuleProfile,
  getSpaceShiftPatternVault,
  upsertSpaceShiftPatternTemplate,
  deleteSpaceShiftPatternTemplate,
  getSpaces,
  setSpaces,
  persistSyncedRuleProfile,
} from '../../lib/storage';
import { weekdayIndexUTC, detectSubPattern, diffDaysUTC } from '../../lib/shiftEngine';
import { buildShiftMetaWithOverrides } from '../../lib/shiftColors';
import type { UserProfile, ShiftType, UserShiftPlan } from '../../types';
import type { ShiftPatternTemplate } from '../../types/timeAccount';
import { pullSpacesForProfile, syncTeamSpaces } from '../../lib/backend/teamSync';

// ─── Konstanten ────────────────────────────────────────────────────────────────

const CYCLE_PRESETS = [7, 14, 21, 28] as const;
const MIN_CYCLE = 1;
const MAX_CYCLE = 120;
const VAULT_REFRESH_MS = 8000;

type PatternFitCandidate = {
  key: string;
  patternIndex: number;
  startDateISO: string;
  matches: number;
  mismatches: number;
  knownCount: number;
  scorePct: number;
  preview: { dateISO: string; code: ShiftType }[];
};

type PatternFitGuideDay = {
  dateISO: string;
  offset: number;
  code: ShiftType | null;
};

// ─── Helper ────────────────────────────────────────────────────────────────────

function formatGerman(dateISO: string): string {
  const [y, m, d] = dateISO.split('-');
  return `${d}.${m}.${y}`;
}

function weekdayShort(dateISO: string): string {
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const [y, m, d] = dateISO.split('-').map(Number);
  return days[new Date(y, m - 1, d).getDay()];
}

function clampCycle(n: number): number {
  return Math.max(MIN_CYCLE, Math.min(MAX_CYCLE, Math.round(n)));
}

function addDaysISO(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDateISO(date);
}

function startOfPreviousYearISO(reference = new Date()): string {
  return `${reference.getFullYear() - 1}-01-01`;
}

function endOfNextYearISO(reference = new Date()): string {
  return `${reference.getFullYear() + 1}-12-31`;
}

function buildPlanWindowLabel(reference = new Date()): string {
  return `${formatGerman(startOfPreviousYearISO(reference))} bis ${formatGerman(endOfNextYearISO(reference))}`;
}

function buildShiftPlanEntriesForPlanningWindow(input: {
  anchorDateISO: string;
  pattern: ShiftType[];
  cycleLengthDays: number;
  windowStartISO?: string;
  windowEndISO?: string;
}): { effectiveStartISO: string; generatedUntilISO: string; entries: Array<{ dateISO: string; code: ShiftType }> } {
  const windowStartISO = input.windowStartISO ?? startOfPreviousYearISO();
  const windowEndISO = input.windowEndISO ?? endOfNextYearISO();
  let effectiveStartISO = input.anchorDateISO;

  if (input.cycleLengthDays > 0) {
    const backSpan = Math.max(0, diffDaysUTC(windowStartISO, input.anchorDateISO));
    if (backSpan > 0) {
      const cyclesBack = Math.ceil(backSpan / input.cycleLengthDays);
      effectiveStartISO = addDaysISO(input.anchorDateISO, -(cyclesBack * input.cycleLengthDays));
    }
  }

  const totalDays = Math.max(1, diffDaysUTC(effectiveStartISO, windowEndISO) + 1);
  const weeksNeeded = Math.ceil(totalDays / 7);
  const entries = generateShiftEntries(effectiveStartISO, input.pattern, weeksNeeded).filter(
    (entry) => entry.dateISO >= windowStartISO && entry.dateISO <= windowEndISO
  );
  const generatedUntilISO = entries.length > 0 ? entries[entries.length - 1].dateISO : windowEndISO;

  return { effectiveStartISO, generatedUntilISO, entries };
}

function buildDefaultFitGuide(centerDateISO = todayISO()): PatternFitGuideDay[] {
  return Array.from({ length: 11 }).map((_, index) => {
    const offset = index - 5;
    return {
      dateISO: addDaysISO(centerDateISO, offset),
      offset,
      code: null,
    };
  });
}

function fitOffsetLabel(offset: number): string {
  if (offset === 0) return 'Heute';
  if (offset === -1) return 'Gestern';
  if (offset === 1) return 'Morgen';
  return offset > 0 ? `+${offset}` : String(offset);
}

function timestampOf(value: string | undefined): number {
  const time = value ? Date.parse(value) : 0;
  return Number.isFinite(time) ? time : 0;
}

function mergePatternVaults(
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
    if (!existing || timestampOf(item.updatedAt) >= timestampOf(existing.updatedAt)) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort((a, b) => timestampOf(b.updatedAt) - timestampOf(a.updatedAt));
}

// ─── Calendar Helper ──────────────────────────────────────────────────────────

/** Returns days for a calendar grid (includes leading/trailing days from adjacent months) */
function getCalendarDays(year: number, month: number): { dateISO: string; inMonth: boolean }[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // getDay(): 0=So → wir wollen 0=Mo
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6; // Sonntag → 6

  const days: { dateISO: string; inMonth: boolean }[] = [];

  // Vortage auffüllen
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ dateISO: formatDateISO(d), inMonth: false });
  }

  // Monatstage
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ dateISO: formatDateISO(new Date(year, month, d)), inMonth: true });
  }

  // Nachtage bis Zeile voll (max 42 Zellen = 6 Zeilen)
  while (days.length % 7 !== 0) {
    const next = new Date(year, month + 1, days.length - startOffset - lastDay.getDate() + 1);
    days.push({ dateISO: formatDateISO(next), inMonth: false });
  }

  return days;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SetupScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(services)');
  }, [navigation, router]);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentSpaceId, setCurrentSpaceIdState] = useState<string | null>(null);
  const [patternVault, setPatternVault] = useState<ShiftPatternTemplate[]>([]);
  const [vaultName, setVaultName] = useState('');
  const [vaultBusy, setVaultBusy] = useState(false);
  const [fitModalVisible, setFitModalVisible] = useState(false);
  const [fitTemplate, setFitTemplate] = useState<ShiftPatternTemplate | null>(null);
  const [fitGuideDays, setFitGuideDays] = useState<PatternFitGuideDay[]>(() => buildDefaultFitGuide());
  const [selectedFitDateISO, setSelectedFitDateISO] = useState<string>(todayISO());
  const [selectedPatternTodayIndex, setSelectedPatternTodayIndex] = useState<number | null>(null);

  // Eingaben
  const [startDate, setStartDate] = useState(todayISO());
  const [cycleLength, setCycleLength] = useState(100);
  const [cycleLengthInput, setCycleLengthInput] = useState('100');
  const [pattern, setPattern] = useState<ShiftType[]>(Array(100).fill('R') as ShiftType[]);
  const [shiftMeta, setShiftMeta] = useState(SHIFT_META);

  // Dirty-Tracking: Ursprungswerte nach letztem Speichern
  const [savedState, setSavedState] = useState<{
    startDate: string;
    cycleLength: number;
      pattern: ShiftType[];
  } | null>(null);

  // Button ist deaktiviert wenn keine ungespeicherten Änderungen
  const hasUnsavedChanges = savedState
    ? startDate !== savedState.startDate ||
      cycleLength !== savedState.cycleLength ||
      JSON.stringify(pattern.slice(0, cycleLength)) !== JSON.stringify(savedState.pattern.slice(0, savedState.cycleLength))
    : true;

  // Vorschau
  const [preview, setPreview] = useState<{ dateISO: string; code: ShiftType }[] | null>(null);
  const [dateError, setDateError] = useState('');

  // Sub-Pattern-Erkennung: merkt sich, für welche cycleLength der Hinweis
  // bereits weggeklickt wurde. Ändert sich cycleLength, erscheint der
  // Hinweis bei einem neuen Treffer wieder (da dismissedHintLen ≠ cycleLength).
  const [dismissedHintLen, setDismissedHintLen] = useState<number | null>(null);

  // Kalender-Popup States
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // ── Pulse-Animation: blinkt auf Pattern[0]-Zelle (= Startdatum) ──────
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Blink-Führung: aktiv solange Pattern[0] noch 'R' (unbelegt) ist.
  // Reagiert automatisch auf handleAllOff (setzt pattern[0] → 'R') und
  // toggleCell (setzt pattern[0] → non-'R'). Kein separates Ref nötig.
  const showBlinkEffect = pattern[0] === 'R';

  useEffect(() => {
    if (!showBlinkEffect) {
      // Pattern[0] wurde belegt → Animation stoppen, Opacity zurücksetzen
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      return;
    }
    // Pattern[0] ist noch 'R' → Pulse starten / fortführen
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [showBlinkEffect, pulseAnim]);

  // Lade Profil + bestehenden Plan
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      getProfile().then(async (p) => {
        if (!active) return;
        setProfile(p);
        const activeSpaceId = await getCurrentSpaceId();
        if (!active) return;
        setCurrentSpaceIdState(activeSpaceId);
        if (activeSpaceId) {
          let vault: ShiftPatternTemplate[] = [];
          try {
            vault = p
              ? await pullLatestPatternVault(p.id, activeSpaceId)
              : await getSpaceShiftPatternVault(activeSpaceId);
          } catch {
            vault = await getSpaceShiftPatternVault(activeSpaceId);
          }
          if (!active) return;
          setPatternVault(vault);
        } else {
          setPatternVault([]);
        }
        if (p) {
          const overrides = await getShiftColorOverrides(p.id);
          setShiftMeta(buildShiftMetaWithOverrides(overrides));
          const existing = activeSpaceId
            ? await getShiftPlanForSpace(activeSpaceId, p.id)
            : await getShiftPlan(p.id);
          if (existing) {
            const anchor = existing.anchorDateISO ?? existing.startDateISO;
            setStartDate(anchor);
            const cl = existing.cycleLengthDays || existing.pattern.length;
            setCycleLength(cl);
            setCycleLengthInput(String(cl));
            setPattern(existing.pattern);
            // Initialisiere savedState für Dirty-Tracking
            setSavedState({
              startDate: anchor,
              cycleLength: cl,
              pattern: existing.pattern,
            });
          } else {
            // Default: cycleLength 100, alles Ruhe
            setCycleLength(100);
            setCycleLengthInput('100');
            setPattern(Array(100).fill('R') as ShiftType[]);
          }
        }
        setPreview(null);
        setLoading(false);
      });
      return () => { active = false; };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      if (!profile?.id || !currentSpaceId) return () => {};
      let active = true;
      const refresh = async () => {
        try {
          const vault = await pullLatestPatternVault(profile.id, currentSpaceId);
          if (active) setPatternVault(vault);
        } catch {
          // Offline/Backend-Probleme dürfen den lokalen Schichtprofil-Screen nicht blockieren.
        }
      };
      const intervalId = setInterval(refresh, VAULT_REFRESH_MS);
      return () => {
        active = false;
        clearInterval(intervalId);
      };
    }, [currentSpaceId, profile?.id])
  );

  async function pullLatestPatternVault(profileId: string, spaceId: string): Promise<ShiftPatternTemplate[]> {
    const remoteSpaces = await pullSpacesForProfile(profileId);
    const remoteSpace = remoteSpaces.find((space) => space.id === spaceId);
    const remoteRuleProfile = remoteSpace?.spaceRuleProfile ?? null;
    if (!remoteRuleProfile) {
      return getSpaceShiftPatternVault(spaceId);
    }

    const localRuleProfile = await getSpaceRuleProfile(spaceId);
    const mergedVault = mergePatternVaults(
      localRuleProfile?.shiftPatternVault,
      remoteRuleProfile.shiftPatternVault
    );
    const mergedRuleProfile = {
      ...remoteRuleProfile,
      ...(localRuleProfile && timestampOf(localRuleProfile.updatedAt) > timestampOf(remoteRuleProfile.updatedAt)
        ? localRuleProfile
        : {}),
      shiftPatternVault: mergedVault,
      updatedAt: new Date(
        Math.max(timestampOf(localRuleProfile?.updatedAt), timestampOf(remoteRuleProfile.updatedAt))
      ).toISOString(),
    };

    await persistSyncedRuleProfile(mergedRuleProfile);

    const localSpaces = await getSpaces();
    const hasLocalSpace = localSpaces.some((space) => space.id === spaceId);
    const nextSpaces = hasLocalSpace
      ? localSpaces.map((space) =>
          space.id === spaceId ? { ...space, spaceRuleProfile: mergedRuleProfile } : space
        )
      : [...localSpaces, { ...remoteSpace!, spaceRuleProfile: mergedRuleProfile }];
    await setSpaces(nextSpaces);

    return mergedVault;
  }

  async function pushLatestPatternVault(profileId: string, spaceId: string): Promise<ShiftPatternTemplate[]> {
    const localSpaces = await getSpaces();
    const syncResult = await syncTeamSpaces(profileId, localSpaces);
    await setSpaces(syncResult.spaces);

    const syncedSpace = syncResult.spaces.find((space) => space.id === spaceId);
    if (syncedSpace?.spaceRuleProfile) {
      await persistSyncedRuleProfile(syncedSpace.spaceRuleProfile);
      return syncedSpace.spaceRuleProfile.shiftPatternVault ?? [];
    }

    return getSpaceShiftPatternVault(spaceId);
  }

  async function refreshPatternVault(spaceId: string) {
    const vault = await getSpaceShiftPatternVault(spaceId);
    setPatternVault(vault);
  }

  async function handleSavePatternTemplate() {
    if (!profile) return;
    if (!currentSpaceId) {
      Alert.alert('Kein aktiver Space', 'Bitte aktiviere zuerst einen Space, bevor du dein Schichtmuster speicherst.');
      return;
    }
    const activeSpaceId = currentSpaceId;
    if (!currentSpaceId) {
      Alert.alert('Hinweis', 'Du brauchst einen aktiven Space, um ein Schichtmuster im Vault zu speichern.');
      return;
    }
    const cleanName = vaultName.trim();
    if (!cleanName) {
      Alert.alert('Fehler', 'Bitte gib einen Namen für das Schichtmuster ein.');
      return;
    }
    const patternSlice = pattern.slice(0, cycleLength);
    if (patternSlice.every((code) => code === 'R')) {
      Alert.alert('Fehler', 'Das Muster enthält nur Ruhetage. Bitte zuerst ein Schichtmuster eintragen.');
      return;
    }
    setVaultBusy(true);
    try {
      try {
        await pullLatestPatternVault(profile.id, currentSpaceId);
      } catch {
        // Speichern bleibt auch bei transientem Pull-Fehler möglich.
      }
      await upsertSpaceShiftPatternTemplate(currentSpaceId, {
        name: cleanName,
        pattern: patternSlice,
        cycleLengthDays: cycleLength,
        createdByProfileId: profile.id,
        createdByDisplayName: profile.displayName,
      });
      const vault = await pushLatestPatternVault(profile.id, currentSpaceId);
      setPatternVault(vault);
      setVaultName('');
      Alert.alert('Gespeichert', 'Schichtmuster wurde im Space-Vault gespeichert.');
    } catch (e) {
      Alert.alert('Fehler', 'Schichtmuster konnte nicht gespeichert werden.');
    } finally {
      setVaultBusy(false);
    }
  }

  function normalizeTemplatePattern(template: ShiftPatternTemplate): ShiftType[] {
    const normalizedLength = clampCycle(template.cycleLengthDays);
    return template.pattern
      .slice(0, normalizedLength)
      .map((code) => (SHIFT_SEQUENCE.includes(code as ShiftType) ? (code as ShiftType) : 'R'));
  }

  function buildFitCandidates(template: ShiftPatternTemplate): PatternFitCandidate[] {
    const normalizedLength = clampCycle(template.cycleLengthDays);
    const normalizedPattern = normalizeTemplatePattern(template);
    const centerDateISO = todayISO();
    const knownDays = fitGuideDays.filter((day) => day.code != null);
    if (knownDays.length === 0) return [];

    return normalizedPattern
      .map((_, index) => {
        const candidateStart = addDaysISO(centerDateISO, -index);
        let matches = 0;
        let mismatches = 0;
        for (const knownDay of knownDays) {
          const diff = diffDaysUTC(candidateStart, knownDay.dateISO);
          const patternIndex = ((diff % normalizedLength) + normalizedLength) % normalizedLength;
          if (normalizedPattern[patternIndex] === knownDay.code) {
            matches += 1;
          } else {
            mismatches += 1;
          }
        }
        const preview = fitGuideDays.map((day) => {
          const dateISO = day.dateISO;
          const diff = diffDaysUTC(candidateStart, dateISO);
          const patternIndex = ((diff % normalizedLength) + normalizedLength) % normalizedLength;
          return { dateISO, code: normalizedPattern[patternIndex] };
        });
        return {
          key: `${template.id}-${index}-${candidateStart}`,
          patternIndex: index,
          startDateISO: candidateStart,
          matches,
          mismatches,
          knownCount: knownDays.length,
          scorePct: Math.round((matches / knownDays.length) * 100),
          preview,
        };
      })
      .sort((a, b) =>
        b.scorePct - a.scorePct ||
        a.mismatches - b.mismatches ||
        b.matches - a.matches ||
        a.patternIndex - b.patternIndex
      )
      .slice(0, 8);
  }

  function openPatternFitModal(template: ShiftPatternTemplate) {
    const centerDateISO = todayISO();
    setFitTemplate(template);
    setFitGuideDays(buildDefaultFitGuide(centerDateISO));
    setSelectedFitDateISO(centerDateISO);
    setSelectedPatternTodayIndex(null);
    setFitModalVisible(true);
  }

  function cycleFitGuideDay(dateISO: string) {
    const cycle: Array<ShiftType | null> = [null, ...SHIFT_SEQUENCE];
    setSelectedFitDateISO(dateISO);
    setFitGuideDays((prev) =>
      prev.map((day) => {
        if (day.dateISO !== dateISO) return day;
        const currentIndex = cycle.findIndex((code) => code === day.code);
        const nextCode = cycle[(currentIndex + 1) % cycle.length];
        return { ...day, code: nextCode };
      })
    );
  }

  function setFitGuideDay(dateISO: string, code: ShiftType | null) {
    setSelectedFitDateISO(dateISO);
    setFitGuideDays((prev) =>
      prev.map((day) => (day.dateISO === dateISO ? { ...day, code } : day))
    );
  }

  function handleApplyPatternTemplate(template: ShiftPatternTemplate, candidate: PatternFitCandidate) {
    const normalizedLength = clampCycle(template.cycleLengthDays);
    const normalizedPattern = normalizeTemplatePattern(template);
    setCycleLength(normalizedLength);
    setCycleLengthInput(String(normalizedLength));
    setPattern(() => {
      const base = normalizedPattern.length > 0 ? normalizedPattern : Array(normalizedLength).fill('R');
      if (base.length >= normalizedLength) return base.slice(0, normalizedLength) as ShiftType[];
      return [...base, ...Array(normalizedLength - base.length).fill('R')] as ShiftType[];
    });
    setStartDate(candidate.startDateISO);
    setDateError('');
    setPreview(candidate.preview);
    setFitModalVisible(false);
  }

  function handleApplyPatternTemplateByTodayIndex() {
    if (!fitTemplate || selectedPatternTodayIndex == null) return;
    const normalizedLength = clampCycle(fitTemplate.cycleLengthDays);
    const normalizedPattern = normalizeTemplatePattern(fitTemplate);
    const today = todayISO();
    const anchorDateISO = addDaysISO(today, -selectedPatternTodayIndex);
    const preview = buildDefaultFitGuide(today).map((day) => {
      const diff = diffDaysUTC(anchorDateISO, day.dateISO);
      const patternIndex = ((diff % normalizedLength) + normalizedLength) % normalizedLength;
      return { dateISO: day.dateISO, code: normalizedPattern[patternIndex] };
    });

    handleApplyPatternTemplate(fitTemplate, {
      key: `${fitTemplate.id}-manual-today-${selectedPatternTodayIndex}`,
      patternIndex: selectedPatternTodayIndex,
      startDateISO: anchorDateISO,
      matches: 1,
      mismatches: 0,
      knownCount: 1,
      scorePct: 100,
      preview,
    });
  }

  function handleAutoAnchorPatternTemplate() {
    if (!fitTemplate) return;
    const bestCandidate = buildFitCandidates(fitTemplate)[0];
    if (!bestCandidate) {
      Alert.alert(
        'Noch keine Dienste gewählt',
        'Bitte trage mindestens einen sicheren Dienst im Zeitraum Heute +/- 5 Tage ein.'
      );
      return;
    }

    if (bestCandidate.mismatches > 0) {
      Alert.alert(
        'Kein perfekter Treffer',
        `YASA findet ${bestCandidate.matches}/${bestCandidate.knownCount} passende Tage. Bitte prüfe die eingetragenen Dienste oder übernimm den besten Treffer.`,
        [
          { text: 'Prüfen', style: 'cancel' },
          {
            text: 'Besten Treffer übernehmen',
            onPress: () => handleApplyPatternTemplate(fitTemplate, bestCandidate),
          },
        ]
      );
      return;
    }

    handleApplyPatternTemplate(fitTemplate, bestCandidate);
  }

  async function handleDeletePatternTemplate(template: ShiftPatternTemplate) {
    if (!profile || !currentSpaceId) return;
    setVaultBusy(true);
    try {
      try {
        await pullLatestPatternVault(profile.id, currentSpaceId);
      } catch {
        // Löschen arbeitet notfalls mit dem lokalen Stand weiter.
      }
      await deleteSpaceShiftPatternTemplate(currentSpaceId, template.id);
      const vault = await pushLatestPatternVault(profile.id, currentSpaceId);
      setPatternVault(vault);
    } finally {
      setVaultBusy(false);
    }
  }

  // Wenn cycleLength sich ändert, Pattern anpassen
  function handleCycleChange(len: number) {
    const clamped = clampCycle(len);
    setCycleLength(clamped);
    setCycleLengthInput(String(clamped));
    setPattern((prev) => {
      if (clamped === prev.length) return prev;
      if (clamped < prev.length) return prev.slice(0, clamped);
      // Erweitern: restliche mit R füllen
      return [...prev, ...Array(clamped - prev.length).fill('R')] as ShiftType[];
    });
    setPreview(null);
  }

  // Freie Zykluslänge – TextInput Handler
  function handleCycleLengthInput(raw: string) {
    // Nur Ziffern erlauben
    const cleaned = raw.replace(/[^0-9]/g, '');
    setCycleLengthInput(cleaned);
    if (cleaned.length > 0) {
      const num = parseInt(cleaned, 10);
      if (!isNaN(num) && num >= MIN_CYCLE && num <= MAX_CYCLE) {
        handleCycleChange(num);
      }
    }
  }

  // Beim Verlassen des Inputs: Wert korrigieren
  function handleCycleLengthBlur() {
    const num = parseInt(cycleLengthInput, 10);
    if (isNaN(num) || num < MIN_CYCLE) {
      handleCycleChange(MIN_CYCLE);
    } else if (num > MAX_CYCLE) {
      handleCycleChange(MAX_CYCLE);
    } else {
      handleCycleChange(num);
    }
  }

  // Toggle Schicht-Code beim Tippen auf ein Feld
  function toggleCell(index: number) {
    setPattern((prev) => {
      const next = [...prev] as ShiftType[];
      const currentIdx = SHIFT_SEQUENCE.indexOf(next[index]);
      // Legacy-Altcode "K" war nicht mehr Teil der neuen Sequenz.
      // Bei Tap direkt auf "KS" überführen statt auf "F" zurückzufallen.
      if (currentIdx === -1 && next[index] === 'K') {
        next[index] = 'KS';
      } else {
        next[index] = SHIFT_SEQUENCE[(currentIdx + 1) % SHIFT_SEQUENCE.length];
      }
      return next;
    });
    setPreview(null);
  }

  // Alle auf Ruhe setzen
  function handleAllOff() {
    setPattern(Array(cycleLength).fill('R') as ShiftType[]);
    setPreview(null);
  }

  // Woche 1 auf alle weiteren Wochen kopieren (nur bei > 7 Tagen)
  function handleCopyWeek() {
    if (cycleLength <= 7) return;
    setPattern((prev) => {
      const week1 = prev.slice(0, 7);
      const next: ShiftType[] = [];
      for (let i = 0; i < cycleLength; i++) {
        next.push(week1[i % 7]);
      }
      return next;
    });
    setPreview(null);
  }

  // Muster auf erkannten vollständigen Zyklus erweitern
  function handleCompletePattern(hint: NonNullable<ReturnType<typeof detectSubPattern>>) {
    setCycleLength(hint.completedLength);
    setCycleLengthInput(String(hint.completedLength));
    // Hänge die berechneten Füll-Zellen ans bestehende Pattern an.
    // hint.extension = pattern[n..completedLength-1] via pattern[i % period]
    setPattern((prev) => [...prev.slice(0, cycleLength), ...hint.extension] as ShiftType[]);
    setDismissedHintLen(null);
    setPreview(null);
  }

  // Vorschau berechnen
  function handlePreview() {
    setDateError('');
    if (!isValidISODate(startDate)) {
      setDateError('Ungültiges Datum. Format: YYYY-MM-DD');
      return;
    }
    const patternSlice = pattern.slice(0, cycleLength);
    const { entries } = buildShiftPlanEntriesForPlanningWindow({
      anchorDateISO: startDate,
      pattern: patternSlice,
      cycleLengthDays: cycleLength,
    });
    // Zeige nur die nächsten 14 ab heute
    const today = todayISO();
    const future = entries.filter((e) => e.dateISO >= today).slice(0, 14);
    setPreview(future.length > 0 ? future : entries.slice(0, 14));
  }

  // Speichern
  async function handleSave() {
    setDateError('');
    if (!isValidISODate(startDate)) {
      setDateError('Ungültiges Datum. Format: YYYY-MM-DD');
      return;
    }
    if (!profile) return;
    if (!currentSpaceId) {
      Alert.alert('Kein aktiver Space', 'Bitte aktiviere zuerst einen Space, bevor du dein Schichtmuster speicherst.');
      return;
    }
    const activeSpaceId = currentSpaceId;
    setSaving(true);
    try {
      const patternSlice = pattern.slice(0, cycleLength);
      const { effectiveStartISO, generatedUntilISO, entries } = buildShiftPlanEntriesForPlanningWindow({
        anchorDateISO: startDate,
        pattern: patternSlice,
        cycleLengthDays: cycleLength,
      });
      const plan: UserShiftPlan = {
        profileId: profile.id,
        startDateISO: effectiveStartISO,
        anchorDateISO: startDate,
        pattern: patternSlice,
        cycleLengthDays: cycleLength,
        generatedUntilISO,
        entries,
      };
      await saveShiftPlanForSpace(activeSpaceId, plan);
      // Update savedState nach erfolgreichem Speichern
    setSavedState({
      startDate,
      cycleLength,
      pattern: patternSlice,
    });
    router.replace('/(shift)/calendar');
    } catch {
      Alert.alert('Fehler', 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
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
        <Text style={styles.errorText}>Kein Profil gefunden. Bitte zuerst ein Profil erstellen.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/')}>
          <Text style={styles.btnText}>Zum Start</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Grid-Rendering: Muster-Felder
  const patternSlice = pattern.slice(0, cycleLength);

  // Offset-Grid: Pattern[0] liegt in der Wochentags-Spalte des Startdatums.
  // weekdayIndexUTC → 0 = Mo … 6 = So (UTC-stabil, kein DST-Problem).
  // validOffset = 0  → Startdatum ist Montag (identisch zu vorherigem Verhalten).
  // validOffset = 2  → Startdatum ist Mittwoch, Mi-Spalte blinkt, Mo/Di leer.
  const startWeekday  = isValidISODate(startDate) ? weekdayIndexUTC(startDate) : 0;
  const validOffset   = Math.max(0, startWeekday);
  const totalVisCells = validOffset + cycleLength;
  const weeks         = Math.ceil(totalVisCells / 7);

  // Prüfe ob ein Preset aktiv ist
  const isCustomCycle = !CYCLE_PRESETS.includes(cycleLength as typeof CYCLE_PRESETS[number]);

  // Sub-Pattern-Erkennung: wird null wenn der Nutzer den Hinweis für diese
  // Zykluslänge weggeklickt hat oder kein Muster erkannt wurde.
  const subPatternHint =
    dismissedHintLen === cycleLength ? null : detectSubPattern(patternSlice);
  const selectedFitDay = fitGuideDays.find((day) => day.dateISO === selectedFitDateISO) ?? fitGuideDays[5];
  const selectedFitMeta = selectedFitDay?.code ? shiftMeta[selectedFitDay.code] : null;
  const knownFitGuideCount = fitGuideDays.filter((day) => day.code != null).length;
  const canAutoAnchorPattern = knownFitGuideCount > 0;
  const fitTemplatePattern = fitTemplate ? normalizeTemplatePattern(fitTemplate) : [];
  const selectedPatternTodayCode =
    selectedPatternTodayIndex == null ? null : fitTemplatePattern[selectedPatternTodayIndex] ?? null;
  const selectedPatternTodayMeta = selectedPatternTodayCode ? shiftMeta[selectedPatternTodayCode] : null;
  const canApplyPatternByTodayIndex = fitTemplate != null && selectedPatternTodayIndex != null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Mein Schichtmuster</Text>
      <Text style={styles.subtitle}>{profile.displayName}</Text>

      {/* ── Startdatum ─────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Startdatum</Text>
        <View style={styles.dateRow}>
          <TextInput
            style={[styles.dateInput, dateError ? styles.dateInputError : null]}
            value={startDate}
            onChangeText={(t) => { setStartDate(t); setDateError(''); setPreview(null); }}
            placeholder="YYYY-MM-DD"
            keyboardType="numeric"
            maxLength={10}
          />
          <TouchableOpacity
            style={styles.todayBtn}
            onPress={() => { setStartDate(todayISO()); setDateError(''); setPreview(null); }}
          >
            <Text style={styles.todayBtnText}>Heute</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.todayBtn, styles.calendarBtn]}
            onPress={() => {
              // Initialisiere Kalender-Monat vom aktuellen Startdatum
              if (isValidISODate(startDate)) {
                const [y, m] = startDate.split('-').map(Number);
                setCalendarMonth(new Date(y, m - 1, 1));
              } else {
                setCalendarMonth(new Date());
              }
              setShowCalendar(true);
            }}
          >
            <Text style={styles.calendarBtnText}>📅</Text>
          </TouchableOpacity>
        </View>
        {!!dateError && <Text style={styles.errorText}>{dateError}</Text>}
      </View>

      {/* ── Zykluslänge ────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Zykluslänge (Tage)</Text>

        {/* Preset-Buttons */}
        <View style={styles.optionRow}>
          {CYCLE_PRESETS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.optionBtn, cycleLength === opt && styles.optionBtnActive]}
              onPress={() => handleCycleChange(opt)}
            >
              <Text style={[styles.optionBtnText, cycleLength === opt && styles.optionBtnTextActive]}>
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Freie Eingabe */}
        <View style={styles.cycleInputRow}>
          <Text style={styles.cycleInputLabel}>Eigene Länge:</Text>
          <TextInput
            style={[styles.cycleInput, isCustomCycle && styles.cycleInputActive]}
            value={cycleLengthInput}
            onChangeText={handleCycleLengthInput}
            onBlur={handleCycleLengthBlur}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="1–56"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={styles.cycleInputSuffix}>Tage</Text>
        </View>
      </View>

      {/* ── Legende ─────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Legende</Text>
        <View style={styles.legendGrid}>
          {SHIFT_SEQUENCE.map((code) => {
            const meta = shiftMeta[code];
            return (
              <View key={code} style={styles.legendItem}>
                <View style={[styles.legendBadge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.legendBadgeText, { color: meta.fg }]}>{meta.label}</Text>
                </View>
                <Text style={styles.legendDesc}>{meta.desc}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* ── Pattern Editor ─────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Schichtmuster</Text>
        
        {/* UX-Führung: Vorab-Hinweis zur Zykluslänge */}
        <View style={styles.cycleGuidanceBanner}>
          <Text style={styles.cycleGuidanceText}>
            📌 <Text style={styles.cycleGuidanceEmphasis}>Tipp:</Text> Lege zuerst die Zykluslänge fest (oben), bevor du das Muster eingibst. So weißt du, wie viele Tage in deinem Schichtzyklus sind.
          </Text>
        </View>
        
        <Text style={styles.hintText}>Tippen zum Wechseln: F → S → N → T → KS → KN → R → U → X</Text>

        {/* Grid: 7 Spalten, N Zeilen */}
        <View style={styles.gridHeader}>
          {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
            <Text key={d} style={styles.gridHeaderCell}>{d}</Text>
          ))}
        </View>
        {cycleLength > 56 && (
          <Text style={styles.scrollHintText}>
            ↕ Scrollen erforderlich – {cycleLength} Tage im Zyklus
          </Text>
        )}
        {Array.from({ length: weeks }).map((_, weekIdx) => (
          <View key={weekIdx} style={styles.gridRow}>
            {Array.from({ length: 7 }).map((_, dayIdx) => {
              // visIdx: absolute Position im Offset-Grid (0 = Mo Woche 1)
              // patIdx: Index ins Pattern-Array (negativ = vor Startdatum)
              const visIdx = weekIdx * 7 + dayIdx;
              const patIdx = visIdx - validOffset;

              // Leerzellen: vor Startdatum (patIdx < 0) oder nach Pattern-Ende
              if (patIdx < 0 || patIdx >= cycleLength) {
                return <View key={dayIdx} style={styles.gridCellEmpty} />;
              }

              const code = patternSlice[patIdx];
              const meta = shiftMeta[code];
              // Blink-Ziel: immer Pattern[0] = die dem Startdatum zugeordnete Zelle.
              // patIdx === 0 liegt in der Spalte des Wochentags von startDate.
              const showPulse = patIdx === 0 && showBlinkEffect;

              const CellInner = (
                <TouchableOpacity
                  style={[styles.gridCell, { backgroundColor: meta.bg }, showPulse && styles.gridCellPulse]}
                  onPress={() => toggleCell(patIdx)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.gridCellText, { color: meta.fg }]}>{meta.label}</Text>
                </TouchableOpacity>
              );

              if (showPulse) {
                return (
                  <Animated.View key={dayIdx} style={[{ flex: 1 }, { opacity: pulseAnim }]}>
                    {CellInner}
                  </Animated.View>
                );
              }
              return <View key={dayIdx} style={{ flex: 1 }}>{CellInner}</View>;
            })}
          </View>
        ))}

        {/* Schnellaktionen */}
        <View style={styles.quickRow}>
          <TouchableOpacity style={styles.quickBtn} onPress={handleAllOff}>
            <Text style={styles.quickBtnText}>Alles Ruhe</Text>
          </TouchableOpacity>
          {cycleLength > 7 && (
            <TouchableOpacity style={styles.quickBtn} onPress={handleCopyWeek}>
              <Text style={styles.quickBtnText}>Woche 1 kopieren</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Sub-Pattern-Hinweis ──────────────────────────────────────── */}
        {subPatternHint !== null && (
          <View style={styles.subPatternBanner}>
            <Text style={styles.subPatternTitle}>🔄 Wiederholungsmuster erkannt</Text>
            <Text style={styles.subPatternBody}>
              Dein Muster wiederholt sich alle{' '}
              <Text style={styles.subPatternEmphasis}>{subPatternHint.period} Tage</Text>.
              Du hast {cycleLength} von{' '}
              <Text style={styles.subPatternEmphasis}>{subPatternHint.completedLength} Tagen</Text>{' '}
              eingegeben – der Zyklus scheint unvollständig zu sein.
            </Text>
            {/* Ergänzungssequenz: zeigt die fehlenden Zellen als Badge-Reihe */}
            {subPatternHint.extension.length > 0 && (
              <View style={styles.subPatternExtensionRow}>
                <Text style={styles.subPatternExtensionLabel}>+ </Text>
                {subPatternHint.extension.map((code, idx) => {
                  const meta = shiftMeta[code];
                  return (
                    <View
                      key={`${code}-${idx}`}
                      style={[styles.subPatternExtensionBadge, { backgroundColor: meta.bg }]}
                    >
                      <Text style={[styles.subPatternExtensionBadgeText, { color: meta.fg }]}>
                        {meta.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
            <View style={styles.subPatternBtns}>
              <TouchableOpacity
                style={styles.subPatternCompleteBtn}
                onPress={() => handleCompletePattern(subPatternHint)}
                activeOpacity={0.75}
              >
                <Text style={styles.subPatternCompleteBtnText}>
                  Auf {subPatternHint.completedLength} Tage vervollständigen
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.subPatternIgnoreBtn}
                onPress={() => setDismissedHintLen(cycleLength)}
                activeOpacity={0.75}
              >
                <Text style={styles.subPatternIgnoreBtnText}>Ignorieren</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* ── Planungszeitraum ───────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Planungszeitraum</Text>
        <View style={styles.planWindowCard}>
          <Text style={styles.planWindowTitle}>{buildPlanWindowLabel()}</Text>
          <Text style={styles.planWindowText}>
            YASA rollt dein Muster automatisch vom Anfang des vergangenen Jahres bis zum Ende des nächsten Jahres aus.
          </Text>
        </View>
        <Text style={styles.optionHint}>
          Damit ist das komplette nächste Jahr für Urlaubsvorplanung sichtbar.
        </Text>
      </View>

      {/* ── Schichtmuster-Vault ───────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Schichtmuster</Text>
        <View style={styles.vaultCard}>
          <Text style={styles.vaultTitle}>Space-Schichtmuster Vault</Text>
          <Text style={styles.vaultHint}>
            Host und Mitglieder können Muster hinterlegen. Neue User wählen ein Muster und setzen nur noch das Startdatum.
          </Text>
          {!currentSpaceId ? (
            <Text style={styles.vaultOffline}>Kein aktiver Space – Vault aktuell nicht verfügbar.</Text>
          ) : null}

          <View style={styles.vaultInputRow}>
            <TextInput
              style={styles.vaultInput}
              value={vaultName}
              onChangeText={setVaultName}
              placeholder="Name für aktuelles Muster (z. B. AOCC Standard N)"
              placeholderTextColor={colors.textTertiary}
            />
            <TouchableOpacity
              style={[styles.vaultSaveBtn, (vaultBusy || !currentSpaceId) && styles.saveBtnDisabled]}
              onPress={handleSavePatternTemplate}
              disabled={vaultBusy || !currentSpaceId}
            >
              <Text style={styles.vaultSaveBtnText}>Speichern</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.vaultList}>
            {patternVault.length === 0 ? (
              <Text style={styles.vaultEmpty}>Noch kein Schichtmuster im Vault.</Text>
            ) : (
              patternVault.map((item) => (
                <View key={item.id} style={styles.vaultItem}>
                  <TouchableOpacity
                    style={styles.vaultApplyBtn}
                    onPress={() => openPatternFitModal(item)}
                    disabled={vaultBusy}
                  >
                    <Text style={styles.vaultItemTitle}>{item.name}</Text>
                    <Text style={styles.vaultItemMeta}>
                      {item.cycleLengthDays} Tage · von {item.createdByDisplayName || 'Unbekannt'}
                    </Text>
                    <Text style={styles.vaultItemPattern}>
                      {item.pattern.join(' · ')}
                    </Text>
                    <Text style={styles.vaultApplyHint}>Tippen zum geführten Einrasten</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.vaultDeleteBtn}
                    onPress={() => handleDeletePatternTemplate(item)}
                    disabled={vaultBusy}
                  >
                    <Text style={styles.vaultDeleteText}>Löschen</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </View>
      </View>

      {/* ── Vorschau-Button ────────────────────────────────────────── */}
      <TouchableOpacity style={styles.previewBtn} onPress={handlePreview}>
        <Text style={styles.previewBtnText}>Vorschau erzeugen</Text>
      </TouchableOpacity>

      {/* ── Vorschau ───────────────────────────────────────────────── */}
      {preview !== null && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Nächste 14 Tage</Text>
          {preview.map((entry) => {
            const meta = shiftMeta[entry.code];
            return (
              <View key={entry.dateISO} style={styles.previewRow}>
                <Text style={styles.previewWeekday}>{weekdayShort(entry.dateISO)}</Text>
                <Text style={styles.previewDate}>{formatGerman(entry.dateISO)}</Text>
                <View style={[styles.previewBadge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.previewBadgeText, { color: meta.fg }]}>{meta.label}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Speichern mit Dirtiness-Status ───────────────────────────────── */}
      <View style={styles.saveSection}>
        <View style={styles.saveStatusRow}>
          <Text style={styles.saveStatusText}>
            {savedState ? (hasUnsavedChanges ? '● Ungespeicherte Änderungen' : '✓ Gespeichert') : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.saveBtn,
            (saving || !hasUnsavedChanges) && styles.saveBtnDisabled
          ]}
          onPress={handleSave}
          disabled={saving || !hasUnsavedChanges}
        >
          {saving ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.saveBtnText}>
              {hasUnsavedChanges ? 'Speichern' : 'Gespeichert'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.backBtn}
        onPress={handleBack}
      >
        <Text style={styles.backBtnText}>Abbrechen</Text>
      </TouchableOpacity>

      {/* ── Schichtmuster einrasten ───────────────────────────────── */}
      <Modal
        visible={fitModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFitModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setFitModalVisible(false)}>
          <Pressable style={styles.fitModal} onPress={() => {}}>
            <ScrollView
              contentContainerStyle={styles.fitModalContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={styles.fitTitle}>Muster einrasten</Text>
              <Text style={styles.fitSubtitle}>
                {fitTemplate?.name ?? 'Schichtmuster'}
              </Text>
              <Text style={styles.fitBody}>
                Tippe im ausgewaehlten Muster auf den Chip, der deinem heutigen Dienst entspricht.
                YASA setzt genau diese Musterposition auf heute und fuellt den Kalender daraus.
              </Text>

              <Text style={styles.fitLabel}>Vollständiges Schichtmuster</Text>
              <Text style={styles.fitMiniHint}>
                Die Nummer zeigt die Position im Muster. Markiere genau einen Chip als „Heute“.
              </Text>
              <View style={styles.fitPatternGrid}>
                {fitTemplatePattern.map((code, index) => {
                  const meta = shiftMeta[code];
                  const isSelected = selectedPatternTodayIndex === index;
                  return (
                    <TouchableOpacity
                      key={`${code}-${index}`}
                      style={[
                        styles.fitPatternChip,
                        isSelected && styles.fitPatternChipSelected,
                        { backgroundColor: meta.bg, borderColor: isSelected ? colors.primary : meta.bg },
                      ]}
                      onPress={() => setSelectedPatternTodayIndex(index)}
                    >
                      <Text style={[styles.fitPatternChipIndex, { color: meta.fg }]}>
                        {index + 1}
                      </Text>
                      <Text style={[styles.fitPatternChipText, { color: meta.fg }]}>
                        {meta.label}
                      </Text>
                      {isSelected && <Text style={styles.fitPatternTodayFlag}>Heute</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.fitSelectedPanel}>
                <Text style={styles.fitSelectedTitle}>
                  Heute im Muster
                </Text>
                <Text style={styles.fitSelectedMeta}>
                  {selectedPatternTodayIndex == null
                    ? 'Noch nicht markiert. Bitte tippe oben auf den heutigen Muster-Chip.'
                    : `Position ${selectedPatternTodayIndex + 1} · ${selectedPatternTodayMeta?.label ?? selectedPatternTodayCode}`}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.fitAnchorBtn, !canApplyPatternByTodayIndex && styles.fitAnchorBtnDisabled]}
                onPress={handleApplyPatternTemplateByTodayIndex}
                disabled={!canApplyPatternByTodayIndex}
              >
                <Text style={styles.fitAnchorBtnText}>Dienstplan-Muster anwenden</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.calCloseBtn}
                onPress={() => setFitModalVisible(false)}
              >
                <Text style={styles.calCloseBtnText}>Abbrechen</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Kalender-Modal ──────────────────────────────────────────── */}
      <Modal visible={showCalendar} transparent animationType="fade" onRequestClose={() => setShowCalendar(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowCalendar(false)}>
          <Pressable style={styles.calendarModal} onPress={() => {}}>
            {/* Monat-Header */}
            <View style={styles.calMonthRow}>
              <TouchableOpacity
                onPress={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                style={styles.calArrowBtn}
              >
                <Text style={styles.calArrowText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.calMonthLabel}>
                {MONTH_LABELS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
              </Text>
              <TouchableOpacity
                onPress={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                style={styles.calArrowBtn}
              >
                <Text style={styles.calArrowText}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Wochentage */}
            <View style={styles.calWeekRow}>
              {WEEKDAY_LABELS.map((d) => (
                <Text key={d} style={styles.calWeekCell}>{d}</Text>
              ))}
            </View>

            {/* Tage-Grid */}
            {(() => {
              const days = getCalendarDays(calendarMonth.getFullYear(), calendarMonth.getMonth());
              const rows = Math.ceil(days.length / 7);
              const todayStr = todayISO();
              return Array.from({ length: rows }).map((_, rowIdx) => (
                <View key={rowIdx} style={styles.calDayRow}>
                  {days.slice(rowIdx * 7, rowIdx * 7 + 7).map((day) => {
                    const isSelected = day.dateISO === startDate;
                    const isToday = day.dateISO === todayStr;
                    return (
                      <TouchableOpacity
                        key={day.dateISO}
                        style={[
                          styles.calDayCell,
                          !day.inMonth && styles.calDayCellOutside,
                          isSelected && styles.calDayCellSelected,
                          isToday && !isSelected && styles.calDayCellToday,
                        ]}
                        onPress={() => {
                          setStartDate(day.dateISO);
                          setDateError('');
                          setPreview(null);
                          setShowCalendar(false);
                        }}
                        activeOpacity={0.6}
                      >
                        <Text
                          style={[
                            styles.calDayText,
                            !day.inMonth && styles.calDayTextOutside,
                            isSelected && styles.calDayTextSelected,
                          ]}
                        >
                          {parseInt(day.dateISO.split('-')[2], 10)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ));
            })()}

            {/* Heute-Button */}
            <TouchableOpacity
              style={styles.calTodayBtn}
              onPress={() => {
                const now = new Date();
                setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                setStartDate(todayISO());
                setDateError('');
                setPreview(null);
                setShowCalendar(false);
              }}
            >
              <Text style={styles.calTodayBtnText}>Heute wählen</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.calCloseBtn} onPress={() => setShowCalendar(false)}>
              <Text style={styles.calCloseBtnText}>Schließen</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: 24,
    paddingTop: 60,
    paddingBottom: 48,
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: 28,
  },
  section: {
    width: '100%',
    marginBottom: 24,
  },
  vaultCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.backgroundSecondary,
    padding: 12,
    gap: 10,
  },
  vaultTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  vaultHint: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  vaultOffline: {
    fontSize: 12,
    color: colors.warningDark,
    fontWeight: '600',
  },
  vaultInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  vaultInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 13,
  },
  vaultSaveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  vaultSaveBtnText: {
    color: colors.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
  vaultList: {
    gap: 8,
  },
  vaultEmpty: {
    fontSize: 12,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  vaultItem: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  vaultApplyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  vaultItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  vaultItemMeta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  vaultItemPattern: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  vaultApplyHint: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  vaultDeleteBtn: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
  },
  vaultDeleteText: {
    fontSize: 12,
    color: colors.error,
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  hintText: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 8,
  },
  // UX-Führung: Vorab-Hinweis zur Zykluslänge
  cycleGuidanceBanner: {
    backgroundColor: '#EFF6FF', // Blue-50
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  cycleGuidanceText: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  cycleGuidanceEmphasis: {
    fontWeight: '700',
    color: colors.primary,
  },
  scrollHintText: {
    fontSize: 11,
    color: colors.warningDark,
    textAlign: 'center',
    marginBottom: 6,
    fontWeight: '500',
  },
  // Datum
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.grayLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundTertiary,
  },
  dateInputError: {
    borderColor: colors.error,
  },
  todayBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  todayBtnText: {
    color: colors.textInverse,
    fontWeight: '600',
    fontSize: 14,
  },
  calendarBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  calendarBtnText: {
    fontSize: 16,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    marginTop: 6,
  },
  // Option-Row
  optionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  optionRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionHint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 6,
  },
  planWindowCard: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    backgroundColor: colors.primaryBackground,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  planWindowTitle: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '700',
    marginBottom: 4,
  },
  planWindowText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  retroToggleBtn: {
    borderWidth: 1,
    borderColor: colors.grayLight,
    borderRadius: 10,
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  retroToggleBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBackground,
  },
  retroToggleText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  retroToggleTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  optionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.grayLight,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
  },
  optionBtnSmall: {
    borderWidth: 1,
    borderColor: colors.grayLight,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
  },
  optionBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBackground,
  },
  optionBtnText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  optionBtnTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  // Zykluslänge – freie Eingabe
  cycleInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cycleInputLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  cycleInput: {
    width: 56,
    borderWidth: 1,
    borderColor: colors.grayLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundTertiary,
    textAlign: 'center',
  },
  cycleInputActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBackground,
  },
  cycleInputSuffix: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  // Legende
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 4,
  },
  legendBadge: {
    width: 24,
    height: 24,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  legendDesc: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  // Grid
  gridHeader: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  gridHeaderCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  gridRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  gridCell: {
    aspectRatio: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  gridCellEmpty: {
    flex: 1,
    aspectRatio: 1,
    minHeight: 36,
  },
  gridCellText: {
    fontSize: 14,
    fontWeight: '700',
  },
  // Schnellaktionen
  quickRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  quickBtn: {
    borderWidth: 1,
    borderColor: colors.grayLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.backgroundTertiary,
  },
  quickBtnText: {
    fontSize: 13,
    color: colors.secondaryDark,
    fontWeight: '500',
  },
  // Vorschau
  previewBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
    backgroundColor: colors.primaryBackground,
  },
  previewBtnText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.backgroundTertiary,
    gap: 10,
  },
  previewWeekday: {
    width: 28,
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  previewDate: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
  previewBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  previewBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  // Buttons
  saveBtn: {
    backgroundColor: colors.success,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  // Save Section
  saveSection: {
    width: '100%',
    marginBottom: 12,
  },
  saveStatusRow: {
    marginBottom: 8,
    alignItems: 'center',
  },
  saveStatusText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  backBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    width: '100%',
    backgroundColor: colors.backgroundTertiary,
    marginBottom: 24,
  },
  backBtnText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 16,
  },
  btnText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '600',
  },
  // ── Pulse Animation ──────────────────────────────────────────────
  gridCellPulse: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  // ── Kalender-Modal Styles ────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarModal: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 360,
  },
  fitModal: {
    backgroundColor: colors.background,
    borderRadius: 16,
    width: '92%',
    maxWidth: 390,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  fitModalContent: {
    padding: 18,
    paddingBottom: 20,
  },
  fitTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  fitSubtitle: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '700',
    marginBottom: 8,
  },
  fitBody: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: 12,
  },
  fitLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 7,
    marginTop: 8,
  },
  fitMiniHint: {
    fontSize: 12,
    color: colors.textTertiary,
    lineHeight: 17,
    marginBottom: 8,
  },
  fitGuideList: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 12,
    backgroundColor: colors.backgroundSecondary,
    marginBottom: 10,
  },
  fitGuideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  fitGuideRowToday: {
    backgroundColor: colors.primaryBackground,
  },
  fitGuideRowSelected: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    backgroundColor: colors.background,
  },
  fitGuideDateCol: {
    flex: 1,
  },
  fitGuideOffset: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  fitGuideOffsetToday: {
    color: colors.primary,
  },
  fitGuideDate: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 2,
  },
  fitGuideCodeBtn: {
    minWidth: 54,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  fitGuideCodeBtnSelected: {
    borderWidth: 2,
  },
  fitGuideCodeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  fitGuideClearBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fitGuideClearText: {
    fontSize: 13,
    color: colors.textTertiary,
    fontWeight: '800',
  },
  fitShiftGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  fitSelectedPanel: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 12,
    backgroundColor: colors.backgroundSecondary,
    padding: 10,
    marginBottom: 10,
  },
  fitSelectedTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  fitSelectedMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  fitPatternGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  fitPatternChip: {
    width: 58,
    minHeight: 54,
    borderWidth: 1.5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  fitPatternChipSelected: {
    borderWidth: 3,
    transform: [{ scale: 1.04 }],
  },
  fitPatternChipIndex: {
    fontSize: 10,
    fontWeight: '800',
    opacity: 0.72,
    marginBottom: 2,
  },
  fitPatternChipText: {
    fontSize: 14,
    fontWeight: '900',
  },
  fitPatternTodayFlag: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '900',
    color: colors.primary,
    backgroundColor: colors.background,
    borderRadius: 7,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  fitShiftBtn: {
    borderWidth: 1.5,
    borderRadius: 8,
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  fitShiftBtnActive: {
    backgroundColor: colors.primaryBackground,
  },
  fitShiftText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  fitShiftTextActive: {
    color: colors.primary,
  },
  fitProgressText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 2,
    fontWeight: '700',
  },
  fitEmpty: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    backgroundColor: colors.backgroundTertiary,
    padding: 10,
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
    marginBottom: 8,
  },
  fitAnchorBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  fitAnchorBtnDisabled: {
    opacity: 0.5,
  },
  fitAnchorBtnText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '800',
  },
  fitCandidateList: {
    maxHeight: 300,
    marginTop: 4,
  },
  fitCandidate: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    backgroundColor: colors.backgroundSecondary,
    padding: 10,
    marginBottom: 8,
  },
  fitCandidateBest: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBackground,
  },
  fitCandidateTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  fitCandidateMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  fitPreviewScroller: {
    marginBottom: 8,
  },
  fitPreviewRow: {
    flexDirection: 'row',
    gap: 5,
  },
  fitPreviewDay: {
    width: 42,
    alignItems: 'center',
    gap: 3,
    borderRadius: 7,
    padding: 3,
  },
  fitPreviewDayMismatch: {
    backgroundColor: '#FEE2E2',
  },
  fitPreviewDate: {
    fontSize: 10,
    color: colors.textTertiary,
    fontWeight: '700',
  },
  fitPreviewBadge: {
    width: '100%',
    minHeight: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fitPreviewBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  fitApplyText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
    textAlign: 'center',
  },
  calMonthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calArrowBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.backgroundTertiary,
  },
  calArrowText: {
    fontSize: 22,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  calMonthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  calWeekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calWeekCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  calDayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calDayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    maxHeight: 40,
  },
  calDayCellOutside: {
    opacity: 0.3,
  },
  calDayCellSelected: {
    backgroundColor: colors.primary,
  },
  calDayCellToday: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  calDayText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  calDayTextOutside: {
    color: colors.textTertiary,
  },
  calDayTextSelected: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  calTodayBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 12,
  },
  calTodayBtnText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },
  calCloseBtn: {
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: colors.backgroundTertiary,
  },
  calCloseBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  // ── Sub-Pattern-Hinweis ───────────────────────────────────────────
  subPatternBanner: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: colors.warning,
    borderRadius: 10,
    backgroundColor: '#FFFBEB', // Amber-50 – warmer Hintergrund, visually distinct
    padding: 14,
    gap: 10,
  },
  subPatternTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E', // Amber-800
  },
  subPatternBody: {
    fontSize: 13,
    color: colors.warningDark,
    lineHeight: 19,
  },
  subPatternEmphasis: {
    fontWeight: '700',
  },
  subPatternBtns: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  subPatternCompleteBtn: {
    flex: 1,
    backgroundColor: colors.warning,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  subPatternCompleteBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  subPatternIgnoreBtn: {
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  subPatternIgnoreBtnText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '600',
  },
  // Ergänzungssequenz-Zeile
  subPatternExtensionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  subPatternExtensionLabel: {
    fontSize: 13,
    color: colors.warningDark,
    fontWeight: '700',
  },
  subPatternExtensionBadge: {
    width: 26,
    height: 26,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subPatternExtensionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  colors, typography, spacing, borderRadius, accessibility,
  SHIFT_META, WEEKDAY_LABELS, MONTH_LABELS,
} from '../../constants/theme';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
  BackHandler,
  Animated,
  InteractionManager,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from '../../components/Button';
import { BottomActionBar } from '../../components/BottomActionBar';
import {
  getProfile,
  getShiftPlanForSpace,
  getAllShiftPlans,
  getShiftPlanFromMapForSpace,
  getShiftColorOverrides,
  getCurrentSpaceId,
  listGhosts,
  todayISO,
  getVacationDaysForSpace,
  getVacationPlanningBudgetSummary,
  toggleVacationDayForSpace,
  getVacationPlanningDaysForProfile,
  toggleVacationPlanningDay,
  getSpaceRuleProfile,
  getUserTimeAccountProfileForSpace,
  getTimeAccountUiState,
  setTimeAccountUiState,
  getShiftOverridesForSpace,
  setShiftOverrideForSpace,
  getDayChangesForSpace,
  buildSpaceProfileKey,
  isValidISODate,
  type DayChange,
} from '../../lib/storage';
import { buildShiftMetaWithOverrides } from '../../lib/shiftColors';
import { diffDaysUTC, shiftCodeAtDate } from '../../lib/shiftEngine';
import { getHolidayMap, type Holiday } from '../../data/holidays';
import {
  getSchoolHolidayMapForRange,
  isBundeslandSupported,
  type SchoolHolidayPeriod,
} from '../../data/schoolHolidays';
import {
  computeTimeAccountSummary,
  computeSummaryVersion,
  hasSufficientData,
  defaultTimeRange,
} from '../../lib/timeAccount';
import type {
  SpaceRuleProfile,
  UserTimeAccountProfile,
  TimeAccountSummary,
} from '../../types/timeAccount';
import type { VacationPlanningBudgetSummary } from '../../types/vacationPlanning';
import type { UserProfile, UserShiftPlan, ShiftType } from '../../types';

// ─── Konstanten ──────────────────────────────────────────────────────────────

const CALENDAR_WINDOW_NOW = new Date();
const MONTHS_BEFORE = CALENDAR_WINDOW_NOW.getMonth() + 12;
const MONTHS_AFTER = 23 - CALENDAR_WINDOW_NOW.getMonth();
const TOTAL_MONTHS = MONTHS_BEFORE + 1 + MONTHS_AFTER;
const TODAY_INDEX = MONTHS_BEFORE;

const SCREEN_WIDTH = Dimensions.get('window').width;
const PAGE_PADDING = 24;
const PAGE_WIDTH = SCREEN_WIDTH;
const GRID_WIDTH = SCREEN_WIDTH - PAGE_PADDING * 2;
const CELL_SIZE = Math.floor(GRID_WIDTH / 7);

// Session-Start nur im RAM: nach App-Neustart wird diese Zeit neu gesetzt.
const APP_SESSION_STARTED_AT = Date.now();
let suppressTaModalNextAutoShow = false;

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function padTwo(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${padTwo(m)}-${padTwo(d)}`;
}

function getMonthKey(offset: number): { year: number; month: number; key: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const targetDate = new Date(y, m + offset, 1);
  const ty = targetDate.getFullYear();
  const tm = targetDate.getMonth() + 1;
  return { year: ty, month: tm, key: `${ty}-${padTwo(tm)}` };
}

interface DayCell {
  dateISO: string;
  day: number;
  inMonth: boolean;
}

function generateMonthGrid(year: number, month: number): DayCell[] {
  const cells: DayCell[] = [];
  const firstDay = new Date(year, month - 1, 1);
  let startWeekday = firstDay.getDay() - 1;
  if (startWeekday < 0) startWeekday = 6;

  const daysInMonth = new Date(year, month, 0).getDate();
  const prevMonthDate = new Date(year, month - 1, 0);
  const prevMonthDays = prevMonthDate.getDate();
  const prevYear = prevMonthDate.getFullYear();
  const prevMonth = prevMonthDate.getMonth() + 1;

  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    cells.push({ dateISO: toISO(prevYear, prevMonth, d), day: d, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dateISO: toISO(year, month, d), day: d, inMonth: true });
  }
  const nextMonthDate = new Date(year, month, 1);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth() + 1;
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({ dateISO: toISO(nextYear, nextMonth, nextDay), day: nextDay, inMonth: false });
    nextDay++;
  }
  return cells;
}

function weekdayIndexMondayFirst(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  return weekday === 0 ? 6 : weekday - 1;
}

function plusDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const next = new Date(y, m - 1, d);
  next.setDate(next.getDate() + days);
  return toISO(next.getFullYear(), next.getMonth() + 1, next.getDate());
}

function isPreHolidayDate(
  dateISO: string,
  holidayMap: Record<string, Holiday>
): boolean {
  return !!holidayMap[plusDaysISO(dateISO, 1)];
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channels = [rgb.r, rgb.g, rgb.b].map((value) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function pickReadableTextColor(background: string): string {
  const dark = '#111827';
  const light = '#FFFFFF';
  return contrastRatio(dark, background) >= contrastRatio(light, background) ? dark : light;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface GhostDayEntry {
  ghostId: string;
  ghostLabel: string;
  code: ShiftType;
}

interface MonthData {
  key: string;
  year: number;
  month: number;
  offset: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    dateISO?: string;
    preselectAction?: string;
    returnMonthKey?: string;
    suppressTaModal?: string;
    returnToken?: string;
    returnTo?: string;
  }>();
  const flatListRef = useRef<FlatList>(null);
  const pendingTargetIndexRef = useRef<number | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [plan, setPlan] = useState<UserShiftPlan | null>(null);
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(TODAY_INDEX);

  const [shiftMap, setShiftMap] = useState<Record<string, ShiftType>>({});
  const [shiftMeta, setShiftMeta] = useState(SHIFT_META);
  const [ghostMap, setGhostMap] = useState<Record<string, GhostDayEntry[]>>({});

  // Vacation planning
  const [vacationMode, setVacationMode] = useState(false);
  const [vacationDays, setVacationDays] = useState<Set<string>>(new Set());
  const [vacationPlanningDays, setVacationPlanningDays] = useState<Set<string>>(new Set());
  const [vacationPlanningBudget, setVacationPlanningBudget] =
    useState<VacationPlanningBudgetSummary | null>(null);
  const planningBudgetPulse = useRef(new Animated.Value(0)).current;

  // Shift Override (einmalige Änderungen)
  const [overrideMode, setOverrideMode] = useState(false);
  const [shiftOverrides, setShiftOverrides] = useState<Record<string, ShiftType>>({});

  // Day Changes History (Original + Aktuell)
  const [dayChanges, setDayChanges] = useState<Record<string, DayChange>>({});
  const [blinkDateISO, setBlinkDateISO] = useState<string | null>(null);
  // Animated.Value für chip-lokale Blink-Animation (kein page-weites setState-Toggling)
  const blinkAnim = useRef(new Animated.Value(0)).current;

  // Time Account & School Holidays
  const [spaceRuleProfile,  setSpaceRuleProfile]  = useState<SpaceRuleProfile | null>(null);
  const [userTaProfile,     setUserTaProfile]     = useState<UserTimeAccountProfile | null>(null);
  const [taSummary,         setTaSummary]         = useState<TimeAccountSummary | null>(null);
  const [showTaModal,       setShowTaModal]       = useState(false);
  const [showActionsModal,  setShowActionsModal]  = useState(false);
  const [showCalendarSignals, setShowCalendarSignals] = useState(false);
  const [showWDays, setShowWDays] = useState(false);
  const [showHolidaySignals, setShowHolidaySignals] = useState(false);
  const [showPreHolidaySignals, setShowPreHolidaySignals] = useState(false);

  // Holiday map (computed once)
  const holidayMap = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const result: Record<string, Holiday> = {};
    // Load holidays for past year, current year, and next 2 years
    for (let y = currentYear - 1; y <= currentYear + 2; y++) {
      const yearMap = getHolidayMap(y);
      for (const [dateISO, holiday] of Object.entries(yearMap)) {
        result[dateISO] = holiday;
      }
    }
    return result;
  }, []);

  // ── Schulferien-Map ────────────────────────────────────────────────────────
  const schoolHolidayMap = useMemo<Record<string, SchoolHolidayPeriod> | null>(() => {
    if (!spaceRuleProfile) return null;

    // Schulferien zeigen? User-Override > Space-Default
    const showSchool = userTaProfile?.schoolHolidaysEnabled !== undefined &&
                       userTaProfile?.schoolHolidaysEnabled !== null
      ? userTaProfile.schoolHolidaysEnabled
      : spaceRuleProfile.schoolHolidaysEnabledByDefault;

    if (!showSchool) return null;
    if (!isBundeslandSupported(spaceRuleProfile.bundesland)) return null;

    const now = new Date();
    return getSchoolHolidayMapForRange(
      spaceRuleProfile.bundesland,
      now.getFullYear() - 1,
      now.getFullYear() + 2,
    );
  }, [spaceRuleProfile, userTaProfile]);

  const months = useMemo<MonthData[]>(() => {
    const result: MonthData[] = [];
    for (let i = -MONTHS_BEFORE; i <= MONTHS_AFTER; i++) {
      const { year, month, key } = getMonthKey(i);
      result.push({ key, year, month, offset: i });
    }
    return result;
  }, []);

  const calendarReturnTarget =
    typeof params.returnTo === 'string' && params.returnTo.startsWith('/')
      ? params.returnTo
      : '/';
  const calendarReturnLabel =
    calendarReturnTarget === '/(services)/vacation-planning'
      ? 'Zurück zur Urlaubsvorplanung'
      : 'Zurück zum Start';
  const shouldPreselectVacationPlanning =
    params.preselectAction === 'vacationPlanning' &&
    calendarReturnTarget === '/(services)/vacation-planning';

  function handleCalendarBack() {
    if (shouldPreselectVacationPlanning) {
      setVacationMode(false);
    }
    router.replace(calendarReturnTarget as `/${string}`);
  }

  function getTargetIndexFromParams(): number | null {
    const focusDateISO = typeof params.dateISO === 'string' ? params.dateISO : undefined;
    const monthKey = typeof params.returnMonthKey === 'string' ? params.returnMonthKey : undefined;

    let year: number | null = null;
    let month: number | null = null;

    if (focusDateISO && isValidISODate(focusDateISO)) {
      const parts = focusDateISO.split('-').map(Number);
      year = parts[0];
      month = parts[1];
    } else if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) {
      const parts = monthKey.split('-').map(Number);
      year = parts[0];
      month = parts[1];
    }

    if (!year || !month) return null;
    const now = new Date();
    const monthOffset = (year - now.getFullYear()) * 12 + (month - (now.getMonth() + 1));
    return Math.min(TOTAL_MONTHS - 1, Math.max(0, TODAY_INDEX + monthOffset));
  }

  function scrollToMonthIndex(index: number, animated = false) {
    pendingTargetIndexRef.current = index;
    setCurrentIndex(index);
    flatListRef.current?.scrollToIndex({ index, animated });
  }

  // Beim Fokus: Zielmonat aus Rücksprung-Parametern merken und direkt anfahren.
  useFocusEffect(
    useCallback(() => {
      if (params.suppressTaModal === '1') {
        suppressTaModalNextAutoShow = true;
      }
      if (shouldPreselectVacationPlanning) {
        setVacationMode(true);
        setOverrideMode(false);
      }
      const targetIndex = getTargetIndexFromParams();
      if (targetIndex === null) return;
      scrollToMonthIndex(targetIndex, false);
      requestAnimationFrame(() => {
        if (pendingTargetIndexRef.current !== null) {
          scrollToMonthIndex(pendingTargetIndexRef.current, false);
        }
      });
    }, [
      params.dateISO,
      params.returnMonthKey,
      params.suppressTaModal,
      params.returnToken,
      shouldPreselectVacationPlanning,
    ])
  );

  // Falls FlatList beim Fokus noch nicht bereit war: nach Loading erneut versuchen.
  useEffect(() => {
    if (loading) return;
    if (pendingTargetIndexRef.current === null) return;
    const idx = pendingTargetIndexRef.current;
    requestAnimationFrame(() => scrollToMonthIndex(idx, false));
  }, [loading]);

  // Orientierung nach Return aus Swap-Kandidaten:
  // geklicktes Datum blinkt 5x – chip-lokal via Animated.Value (kein page-Re-Render während Animation).
  useEffect(() => {
    const focusDateISO = typeof params.dateISO === 'string' ? params.dateISO : undefined;
    // Nur bei echtem Return-Token starten (nicht beim ersten Laden)
    if (!focusDateISO || !isValidISODate(focusDateISO) || !params.returnToken) return;

    blinkAnim.setValue(0);
    setBlinkDateISO(focusDateISO);

    // 5 Pulse: opacity 0→1→0, via native driver (kein JS-Bridge-Overhead)
    const pulseIn  = Animated.timing(blinkAnim, { toValue: 1, duration: 200, useNativeDriver: true });
    const pulseOut = Animated.timing(blinkAnim, { toValue: 0, duration: 180, useNativeDriver: true });
    const animation = Animated.sequence([
      Animated.delay(150),
      Animated.loop(Animated.sequence([pulseIn, pulseOut]), { iterations: 5 }),
    ]);

    animation.start(() => {
      blinkAnim.setValue(0);
      setBlinkDateISO(null);
    });

    return () => {
      animation.stop();
      blinkAnim.setValue(0);
      setBlinkDateISO(null);
    };
  }, [params.returnToken, params.dateISO]);

  // Hardware-Back auf Kalender: zurück zum passenden Einstiegspunkt.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleCalendarBack();
        return true;
      });
      return () => sub.remove();
    }, [calendarReturnTarget, router])
  );

  // Daten laden
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        setLoading(true);
        try {
          const p = await getProfile();
          if (!active) return;
          setProfile(p);
          if (!p) {
            setLoading(false);
            return;
          }

          const colorOverrides = await getShiftColorOverrides(p.id);
          if (!active) return;
          setShiftMeta(buildShiftMetaWithOverrides(colorOverrides));

          const spaceId = await getCurrentSpaceId();
          if (!active) return;
          setCurrentSpaceId(spaceId);

          // Stage 1: nur Shiftplan fuer schnellen First Paint
          const shiftPlan = spaceId ? await getShiftPlanForSpace(spaceId, p.id) : null;
          if (!active) return;

          setPlan(shiftPlan);
          const map: Record<string, ShiftType> = {};
          if (shiftPlan) {
            for (const entry of shiftPlan.entries) {
              map[entry.dateISO] = entry.code;
            }
          }
          setShiftMap(map);
          setLoading(false);

          // Stage 2: weitere Kalenderdaten parallel nachladen
          const [vDays, overrides, changes, ur] = await Promise.all([
            spaceId ? getVacationDaysForSpace(spaceId, p.id) : Promise.resolve([]),
            spaceId ? getShiftOverridesForSpace(spaceId, p.id) : Promise.resolve({}),
            spaceId ? getDayChangesForSpace(spaceId, p.id) : Promise.resolve({}),
            spaceId ? getUserTimeAccountProfileForSpace(spaceId, p.id) : Promise.resolve(null),
          ]);
          if (!active) return;

          setVacationDays(new Set(vDays));
          setShiftOverrides(overrides);
          setDayChanges(changes);
          setUserTaProfile(ur);

          if (spaceId) {
            const planningYears = [...new Set(months.map((month) => month.year).filter((year) => year > new Date().getFullYear()))];
            const planningDaysByYear = await Promise.all(
              planningYears.map((year) => getVacationPlanningDaysForProfile(spaceId, p.id, year))
            );
            if (!active) return;
            setVacationPlanningDays(new Set(planningDaysByYear.flat()));
          } else {
            setVacationPlanningDays(new Set());
          }

          if (!spaceId) {
            setGhostMap({});
            setSpaceRuleProfile(null);

            if (shiftPlan && ur && hasSufficientData(shiftPlan, ur)) {
              const { fromISO, toISO } = defaultTimeRange();
              const version = computeSummaryVersion(shiftPlan, ur, null, fromISO, toISO);
              const storageProfileId = spaceId ? buildSpaceProfileKey(spaceId, p.id) : p.id;
              const uiState = await getTimeAccountUiState(storageProfileId);
              if (!active) return;
              const dismissedInCurrentSession =
                !!uiState &&
                uiState.dismissedForVersion === version &&
                !!uiState.dismissedAt &&
                new Date(uiState.dismissedAt).getTime() >= APP_SESSION_STARTED_AT;

              if (!dismissedInCurrentSession && !suppressTaModalNextAutoShow) {
                const autoSummary = computeTimeAccountSummary({
                  plan: shiftPlan,
                  userProfile: ur,
                  spaceProfile: null,
                  holidayMap,
                  vacationDaySet: new Set(vDays),
                  fromISO,
                  toISO,
                });
                setTaSummary(autoSummary);
                setShowTaModal(true);
              }
              suppressTaModalNextAutoShow = false;
            }
            return;
          }

          // Stage 3: Schwergewichte erst nach UI-Interaktionen laden
          InteractionManager.runAfterInteractions(async () => {
            const [ghosts, allPlans, sr] = await Promise.all([
              listGhosts(spaceId),
              getAllShiftPlans(),
              getSpaceRuleProfile(spaceId),
            ]);
            if (!active) return;

            const gMap: Record<string, GhostDayEntry[]> = {};
            for (const ghost of ghosts) {
              const ghostPlan = getShiftPlanFromMapForSpace(allPlans, spaceId, ghost.id);
              if (!ghostPlan) continue;
              for (const entry of ghostPlan.entries) {
                if (!gMap[entry.dateISO]) gMap[entry.dateISO] = [];
                gMap[entry.dateISO].push({
                  ghostId: ghost.id,
                  ghostLabel: ghost.ghostLabel ?? ghost.displayName,
                  code: entry.code,
                });
              }
            }
            setGhostMap(gMap);
            setSpaceRuleProfile(sr);

            if (shiftPlan && ur && hasSufficientData(shiftPlan, ur)) {
              const { fromISO, toISO } = defaultTimeRange();
              const version = computeSummaryVersion(shiftPlan, ur, sr, fromISO, toISO);
              const storageProfileId = buildSpaceProfileKey(spaceId, p.id);
              const uiState = await getTimeAccountUiState(storageProfileId);
              if (!active) return;
              const dismissedInCurrentSession =
                !!uiState &&
                uiState.dismissedForVersion === version &&
                !!uiState.dismissedAt &&
                new Date(uiState.dismissedAt).getTime() >= APP_SESSION_STARTED_AT;

              if (!dismissedInCurrentSession && !suppressTaModalNextAutoShow) {
                const autoSummary = computeTimeAccountSummary({
                  plan: shiftPlan,
                  userProfile: ur,
                  spaceProfile: sr,
                  holidayMap,
                  vacationDaySet: new Set(vDays),
                  fromISO,
                  toISO,
                });
                setTaSummary(autoSummary);
                setShowTaModal(true);
              }
              suppressTaModalNextAutoShow = false;
            }
          });
        } catch {
          if (active) setLoading(false);
        }
      };

      void load();
      return () => { active = false; };
    }, [])
  );

  const currentMonth = months[currentIndex];
  const headerText = currentMonth
    ? `${MONTH_LABELS[currentMonth.month - 1]} ${currentMonth.year}`
    : '';

  // Vacation counter for displayed year
  const currentYear = currentMonth?.year ?? new Date().getFullYear();
  const realCurrentYear = new Date().getFullYear();
  const isVacationPlanningYear = currentYear > realCurrentYear;
  const vacationActionLabel = isVacationPlanningYear ? '🌴 Urlaubsvorplanung' : '🏖️ Urlaub';
  const vacationCounterLabel = isVacationPlanningYear
    ? `Urlaubsvorplanung ${currentYear}`
    : `Urlaubstage ${currentYear}`;
  const activeSignalCount = Number(showWDays) + Number(showHolidaySignals) + Number(showPreHolidaySignals);
  const actionButtonSummary = [
    vacationMode ? (isVacationPlanningYear ? 'Vorplanung aktiv' : 'Urlaub aktiv') : null,
    overrideMode ? 'Ändern aktiv' : null,
    showCalendarSignals ? `${activeSignalCount} Signale` : null,
  ].filter(Boolean).join(' · ');
  const vacationCountForYear = useMemo(() => {
    let count = 0;
    const daySet = isVacationPlanningYear ? vacationPlanningDays : vacationDays;
    daySet.forEach((d) => {
      if (d.startsWith(`${currentYear}-`)) count++;
    });
    return count;
  }, [vacationDays, vacationPlanningDays, currentYear, isVacationPlanningYear]);
  const planningBudgetDays =
    isVacationPlanningYear && vacationPlanningBudget?.year === currentYear
      ? vacationPlanningBudget.budgetDays
      : 0;
  const planningRemainingDays = planningBudgetDays - vacationCountForYear;
  const planningBudgetPercent =
    planningBudgetDays > 0
      ? Math.min(100, Math.max(0, (vacationCountForYear / planningBudgetDays) * 100))
      : 0;
  const planningBudgetPulseStyle = {
    transform: [
      {
        scale: planningBudgetPulse.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.035],
        }),
      },
    ],
    shadowOpacity: planningBudgetPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.08, 0.22],
    }),
  };

  useEffect(() => {
    let active = true;
    if (!isVacationPlanningYear || !profile || !currentSpaceId) {
      setVacationPlanningBudget(null);
      return () => {
        active = false;
      };
    }
    getVacationPlanningBudgetSummary(currentSpaceId, profile.id, currentYear).then((summary) => {
      if (active) setVacationPlanningBudget(summary);
    });
    return () => {
      active = false;
    };
  }, [currentSpaceId, currentYear, isVacationPlanningYear, profile]);

  useEffect(() => {
    if (!vacationMode || !isVacationPlanningYear) return;
    planningBudgetPulse.stopAnimation();
    planningBudgetPulse.setValue(0);
    Animated.sequence([
      Animated.timing(planningBudgetPulse, { toValue: 1, duration: 160, useNativeDriver: false }),
      Animated.timing(planningBudgetPulse, { toValue: 0, duration: 260, useNativeDriver: false }),
    ]).start();
  }, [isVacationPlanningYear, planningBudgetPulse, vacationCountForYear, vacationMode]);

  function scrollToToday() {
    flatListRef.current?.scrollToIndex({ index: TODAY_INDEX, animated: true });
    setCurrentIndex(TODAY_INDEX);
  }

  function goToPrev() {
    const next = Math.max(0, currentIndex - 1);
    flatListRef.current?.scrollToIndex({ index: next, animated: true });
    setCurrentIndex(next);
  }

  function goToNext() {
    const next = Math.min(TOTAL_MONTHS - 1, currentIndex + 1);
    flatListRef.current?.scrollToIndex({ index: next, animated: true });
    setCurrentIndex(next);
  }

  const handleMomentumScrollEnd = useCallback((event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const idx = Math.round(offsetX / PAGE_WIDTH);
    if (idx >= 0 && idx < TOTAL_MONTHS) {
      setCurrentIndex(idx);
    }
  }, []);

  const getItemLayout = useCallback((_: unknown, index: number) => ({
    length: PAGE_WIDTH,
    offset: PAGE_WIDTH * index,
    index,
  }), []);

  // Vacation toggle handler
  async function handleDayPress(dateISO: string, inMonth: boolean) {
    if (!inMonth) return;

    // ── DEV Debug: Datum-Tap mit Pattern-Index ───────────────────────────
    if (__DEV__ && plan) {
      const cycleLen = plan.cycleLengthDays || plan.pattern.length;
      const diff     = diffDaysUTC(plan.startDateISO, dateISO);
      const patIdx   = diff >= 0 ? diff % cycleLen : -1;
      console.log('[YASA Debug] Calendar tap:', {
        startDate:    plan.startDateISO,
        cycleLength:  cycleLen,
        tappedDate:   dateISO,
        diffDays:     diff,
        patternIndex: patIdx,
        shift:        patIdx >= 0 ? shiftCodeAtDate(plan.startDateISO, plan.pattern, dateISO) : null,
      });
    }
    // ────────────────────────────────────────────────────────────────────

    if (vacationMode && profile) {
      const targetYear = Number(dateISO.slice(0, 4));
      const isPlanningDate = targetYear > new Date().getFullYear();

      if (isPlanningDate) {
        if (!currentSpaceId) return;
        const updated = await toggleVacationPlanningDay({
          spaceId: currentSpaceId,
          profileId: profile.id,
          dateISO,
        });
        setVacationPlanningDays((prev) => {
          const next = new Set([...prev].filter((day) => !day.startsWith(`${targetYear}-`)));
          updated.forEach((day) => next.add(day));
          return next;
        });
      } else {
        // Urlaub-Modus: Urlaub setzen (hat Priorität)
        if (!currentSpaceId) return;
        const updated = await toggleVacationDayForSpace(currentSpaceId, profile.id, dateISO);
        setVacationDays(new Set(updated));
        const changes = await getDayChangesForSpace(currentSpaceId, profile.id);
        setDayChanges(changes);
      }
    } else if (overrideMode && profile) {
      // Override-Modus: einmalige Schichtänderung
      if (!currentSpaceId) return;
      const sequence: ShiftType[] = ['F', 'S', 'N', 'T', 'KS', 'KN', 'R', 'X'];
      const current = shiftOverrides[dateISO];
      const idx = current ? sequence.indexOf(current) : -1;
      const nextCode = !current ? sequence[0] : idx < 0 || idx === sequence.length - 1 ? null : sequence[idx + 1];
      const updated = await setShiftOverrideForSpace(currentSpaceId, profile.id, dateISO, nextCode);
      setShiftOverrides(updated);
      const changes = await getDayChangesForSpace(currentSpaceId, profile.id);
      setDayChanges(changes);
    } else {
      router.push({
        pathname: '/(shift)/day-detail',
        params: {
          dateISO,
          returnTo: '/(shift)/calendar',
          returnDate: dateISO,
          returnMonthKey: dateISO.slice(0, 7),
        },
      });
    }
  }

  const today = todayISO();

  // ── Render: Einzelne Monatsseite ──────────────────────────────────────────

  const renderMonthPage = useCallback(({ item }: { item: MonthData }) => {
    const grid = generateMonthGrid(item.year, item.month);
    const weekRows: DayCell[][] = [];
    for (let i = 0; i < grid.length; i += 7) {
      weekRows.push(grid.slice(i, i + 7));
    }

    return (
      <View style={[styles.monthPage, { width: PAGE_WIDTH }]}>
        <View style={styles.weekdayHeaderRow}>
          {WEEKDAY_LABELS.map((day) => (
            <View key={day} style={styles.weekdayHeaderCell}>
              <Text style={styles.weekdayHeaderText}>{day}</Text>
            </View>
          ))}
        </View>

        {weekRows.map((week, weekIdx) => (
          <View key={weekIdx} style={styles.weekRow}>
            {week.map((cell) => {
              const isToday = cell.dateISO === today;
              const shift = shiftMap[cell.dateISO];
              const meta = shift ? shiftMeta[shift] : null;
              const dayGhosts = ghostMap[cell.dateISO];
              const hasGhost = dayGhosts && dayGhosts.length > 0;
              const isHoliday = !!holidayMap[cell.dateISO];
              const isWeekdayHoliday = isHoliday && weekdayIndexMondayFirst(cell.dateISO) <= 4;
              const isPreHoliday = isPreHolidayDate(cell.dateISO, holidayMap);
              const isPlanningCell = item.year > new Date().getFullYear();
              const isVacation = isPlanningCell
                ? vacationPlanningDays.has(cell.dateISO)
                : vacationDays.has(cell.dateISO);
              const isSchoolHoliday = !!schoolHolidayMap?.[cell.dateISO];
              const overrideCode = shiftOverrides[cell.dateISO];
              const overrideMeta = overrideCode ? shiftMeta[overrideCode] : null;
              
              // Day Change History
              const dayChange = dayChanges[cell.dateISO];
              const hasDayChange = !!dayChange;
              
              // Original-Code: aus dem Shift-Plan (shiftMap)
              const originalCode = shift && cell.inMonth ? shift : null;
              const originalMeta = originalCode ? shiftMeta[originalCode] : null;
              
              // Priorität: U > Override > Plan (für Aktuell-Code)
              let currentCode: ShiftType | null = null;
              if (isVacation && cell.inMonth) {
                currentCode = 'U';
              } else if (overrideCode && cell.inMonth) {
                currentCode = overrideCode;
              } else if (shift && cell.inMonth) {
                currentCode = shift;
              }

              const currentMeta = currentCode ? shiftMeta[currentCode] : null;
              const isWDay =
                cell.inMonth &&
                !!spaceRuleProfile?.codeRules.W?.enabled &&
                isWeekdayHoliday &&
                currentCode === 'R';
              // Aktive Signale: Grundbedingung + jeweiliger Toggle.
              // W "konsumiert" den Holiday-Slot nur, wenn W tatsächlich angezeigt wird.
              const wDayActive = isWDay && showWDays;
              const holidayActive =
                isHoliday && showHolidaySignals && cell.inMonth && !isWDay;
              const preHolidayActive =
                isPreHoliday && showPreHolidaySignals && cell.inMonth && !isHoliday && !isWDay;
              const wDayBg = '#F59E0B';
              const holidayBg = '#DC2626';
              const preHolidayBg = '#14B8A6';
              let signalBg: string | null = null;
              if (wDayActive) {
                signalBg = wDayBg;
              } else if (holidayActive) {
                signalBg = holidayBg;
              } else if (preHolidayActive) {
                signalBg = preHolidayBg;
              }
              const signalFg = signalBg ? pickReadableTextColor(signalBg) : null;

              // Bestimme Hintergrund-Farbe basierend auf dem Aktuellen Code
              let cellBg: string | undefined;
              if (currentMeta && cell.inMonth) {
                cellBg = currentMeta.bg;
              }
              if (signalBg) {
                cellBg = signalBg;
              }

              // Text-Farbe
              let cellFg: string | undefined;
              if (currentMeta && cell.inMonth) {
                cellFg = currentMeta.fg;
              }
              if (signalFg) {
                cellFg = signalFg;
              }

              return (
                <TouchableOpacity
                  key={cell.dateISO}
                  style={[
                    styles.dayCell,
                    !cell.inMonth && styles.dayCellOutside,
                    isToday && styles.dayCellToday,
                    cellBg ? { backgroundColor: cellBg } : undefined,
                    vacationMode && cell.inMonth && styles.dayCellVacMode,
                    isVacation && cell.inMonth && styles.dayCellVacation,
                    overrideMode && cell.inMonth && styles.dayCellOverrideMode,
                  ]}
                  activeOpacity={0.6}
                  onPress={() => handleDayPress(cell.dateISO, cell.inMonth)}
                >
                  {/* Chip-lokaler Blink-Overlay: animiert via native driver, kein page-Re-Render */}
                  {cell.dateISO === blinkDateISO && (
                    <Animated.View
                      style={[styles.blinkOverlay, { opacity: blinkAnim }]}
                      pointerEvents="none"
                    />
                  )}
                  <Text
                    style={[
                      styles.dayNumber,
                      !cell.inMonth && styles.dayNumberOutside,
                      isToday && styles.dayNumberToday,
                      cellFg ? { color: cellFg } : undefined,
                    ]}
                  >
                    {cell.day}
                  </Text>

                  {/* Shift-Code - 2-Ebenen Layout: Oben Original, Unten Aktuell */}
                  {cell.inMonth && currentCode ? (
                    <View style={styles.twoLineContainer}>
                      {/* Obere Zeile: Original (wenn abweichend) */}
                      {hasDayChange && originalMeta && originalCode !== currentCode && (
                        <View style={styles.originalLine}>
                          <Text style={[styles.originalText, { color: signalFg ?? originalMeta.fg }]}>
                            {originalMeta.label}
                          </Text>
                          <Text style={[styles.arrowText, signalFg ? { color: signalFg } : null]}>→</Text>
                        </View>
                      )}
                      {/* Untere Zeile: Aktueller Code - dominant */}
                      <View
                        style={[
                          styles.currentLine,
                          signalBg
                            ? styles.currentLineTransparent
                            : { backgroundColor: currentMeta?.bg },
                        ]}
                      >
                        <Text style={[styles.currentText, { color: signalFg ?? currentMeta?.fg }]}>
                          {currentMeta?.label}
                        </Text>
                      </View>
                    </View>
                  ) : cell.inMonth && isVacation ? (
                    /* Urlaub: Original oben, U unten */
                    <View style={styles.twoLineContainer}>
                      {originalMeta && (
                        <View style={styles.originalLine}>
                          <Text style={[styles.originalText, { color: signalFg ?? originalMeta.fg }]}>
                            {originalMeta.label}
                          </Text>
                          <Text style={[styles.arrowText, signalFg ? { color: signalFg } : null]}>→</Text>
                        </View>
                      )}
                      <View
                        style={[
                          styles.currentLine,
                          signalBg
                            ? styles.currentLineTransparent
                            : { backgroundColor: shiftMeta.U.bg },
                        ]}
                      >
                        <Text style={[styles.currentText, { color: signalFg ?? shiftMeta.U.fg }]}>U</Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Feiertag-Indikator: nur wenn keine Vollflächen-Signalmarkierung greift */}
                  {holidayActive && !signalBg && (
                    <View style={styles.holidayBottomBar} />
                  )}

                  {preHolidayActive && !signalBg && (
                    <View style={styles.preHolidayTopBar} />
                  )}

                  {/* Override-Indikator */}
                  {!isVacation && overrideCode && cell.inMonth && (
                    <View style={styles.overrideDot} />
                  )}

                  {/* Schulferien-Indikator */}
                  {isSchoolHoliday && cell.inMonth && (
                    <View style={styles.schoolDot} />
                  )}

                  {/* Ghost-Indikator */}
                  {hasGhost && cell.inMonth && !isHoliday && (
                    <View style={styles.ghostDot} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {/* Feiertag-Legende für diesen Monat */}
        <HolidayLegendForMonth year={item.year} month={item.month} holidayMap={holidayMap} />

        {/* Ghost-Legende */}
        <GhostLegendForMonth year={item.year} month={item.month} ghostMap={ghostMap} />
      </View>
    );
  }, [shiftMap, shiftMeta, ghostMap, today, router, holidayMap, schoolHolidayMap, vacationDays, vacationPlanningDays, vacationMode, profile, plan, shiftOverrides, overrideMode, dayChanges, blinkDateISO, spaceRuleProfile, showWDays, showHolidaySignals, showPreHolidaySignals]);

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.pageScrollContent} showsVerticalScrollIndicator={false}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.title}>Mein Kalender</Text>
        {profile && <Text style={styles.subtitle}>{profile.displayName}</Text>}
        {Object.keys(dayChanges).length > 0 && (
          <Text style={styles.chipHint}>Anzeige: oben Original · unten aktuell</Text>
        )}
      </View>

      {!plan ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyEmoji}>📅</Text>
          <Text style={styles.emptyTitle}>Kein Schichtplan vorhanden</Text>
          <Text style={styles.emptyDesc}>
            Richte dein Schichtmuster ein, um deinen Kalender zu sehen.
          </Text>
          <TouchableOpacity style={styles.setupBtn} onPress={() => router.replace('/(shift)/setup')}>
            <Text style={styles.setupBtnText}>Muster einrichten</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* ── Calendar Actions Launcher ───────────────────────────── */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionsLauncher, showActionsModal && styles.actionsLauncherActive]}
              onPress={() => setShowActionsModal(true)}
            >
              <Text style={[styles.actionsLauncherTitle, showActionsModal && styles.actionsLauncherTitleActive]}>
                ☰ Kalender-Aktionen
              </Text>
              <Text style={[styles.actionsLauncherSummary, showActionsModal && styles.actionsLauncherSummaryActive]}>
                {actionButtonSummary || 'Planung, Signale und Konten'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.todayLauncher,
                currentIndex === TODAY_INDEX && styles.todayLauncherInactive,
              ]}
              activeOpacity={0.85}
              onPress={scrollToToday}
            >
              <Text
                style={[
                  styles.todayLauncherTitle,
                  currentIndex === TODAY_INDEX && styles.todayLauncherTitleInactive,
                ]}
              >
                Heute
              </Text>
              <Text
                style={[
                  styles.todayLauncherSummary,
                  currentIndex === TODAY_INDEX && styles.todayLauncherSummaryInactive,
                ]}
              >
                {currentIndex === TODAY_INDEX ? 'Aktuell' : 'Springen'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Vacation Counter ───────────────────────────────────── */}
          {(vacationMode || overrideMode) && (
            <View
              style={[
                styles.vacCounterRow,
                vacationMode && isVacationPlanningYear && styles.vacCounterRowStacked,
              ]}
            >
              {vacationMode && isVacationPlanningYear ? (
                <Animated.View style={[styles.planningBudgetPill, planningBudgetPulseStyle]}>
                  <View style={styles.planningBudgetTopRow}>
                    <Text style={styles.planningBudgetTitle}>Urlaubsvorplanung aktiv</Text>
                    <Text
                      style={[
                        styles.planningBudgetFree,
                        planningBudgetDays > 0 && planningRemainingDays <= 0 && styles.planningBudgetWarning,
                      ]}
                    >
                      {planningBudgetDays > 0 ? `${Math.max(0, planningRemainingDays)} Tage frei` : 'Guthaben offen'}
                    </Text>
                  </View>
                  <View style={styles.planningBudgetTrack}>
                    <View style={[styles.planningBudgetFill, { width: `${planningBudgetPercent}%` }]} />
                  </View>
                  <Text style={styles.planningBudgetMeta}>
                    {planningBudgetDays > 0
                      ? `${vacationCountForYear} / ${planningBudgetDays} Tage vorgeplant`
                      : 'Freizeitkonto pflegen, damit YASA dein Guthaben live einordnet'}
                  </Text>
                </Animated.View>
              ) : (
                <Text style={styles.vacCounterText}>
                  {vacationMode && (
                    <>{vacationCounterLabel}: <Text style={styles.vacCounterBold}>{vacationCountForYear}</Text></>
                  )}
                  {overrideMode && !vacationMode && (
                    <>Einmalige Änderungen aktiv</>
                  )}
                </Text>
              )}
              <View
                style={[
                  styles.vacLegendRow,
                  vacationMode && isVacationPlanningYear && styles.vacLegendRowStacked,
                ]}
              >
                <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
                <Text style={styles.legendLabel}>Feiertag</Text>
                <View style={[styles.legendDot, { backgroundColor: shiftMeta.U.bg, borderWidth: 1, borderColor: shiftMeta.U.fg }]} />
                <Text style={styles.legendLabel}>Urlaub</Text>
                <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
                <Text style={styles.legendLabel}>Ändern</Text>
                {schoolHolidayMap && (
                  <>
                    <View style={[styles.legendDot, { backgroundColor: '#6EE7B7' }]} />
                    <Text style={styles.legendLabel}>Schulferien</Text>
                  </>
                )}
              </View>
            </View>
          )}

          {/* ── Monats-Navigation ───────────────────────────────────── */}
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={goToPrev} style={styles.navArrow} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
              <Text style={styles.navArrowText}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={scrollToToday} style={styles.monthHeaderTouchable}>
              <Text style={styles.monthHeaderText}>{headerText}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={goToNext} style={styles.navArrow} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
              <Text style={styles.navArrowText}>›</Text>
            </TouchableOpacity>
          </View>

          {/* ── Swipeable Month FlatList ─────────────────────────────── */}
          <FlatList
            ref={flatListRef}
            data={months}
            keyExtractor={(item) => item.key}
            renderItem={renderMonthPage}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={TODAY_INDEX}
            getItemLayout={getItemLayout}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            windowSize={3}
            initialNumToRender={1}
            maxToRenderPerBatch={3}
            updateCellsBatchingPeriod={30}
            removeClippedSubviews={false}
            extraData={`${vacationMode}-${vacationDays.size}-${vacationPlanningDays.size}-${overrideMode}-${Object.keys(shiftOverrides).length}-${Object.keys(dayChanges).length}-${showWDays ? 1 : 0}${showHolidaySignals ? 1 : 0}${showPreHolidaySignals ? 1 : 0}`}
            style={styles.flatList}
            onScrollToIndexFailed={({ index }) => {
              // FlatList kann beim ersten Render den Zielindex noch nicht kennen.
              // Retry macht den Return-Point stabil.
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({ index, animated: false });
              }, 120);
            }}
          />
        </>
      )}

      {/* ── Bottom Buttons ──────────────────────────────────────────── */}
      <BottomActionBar style={styles.bottomButtons}>
        <Button
          label="Muster bearbeiten"
          onPress={() => router.push('/(shift)/setup')}
          variant="soft"
          fullWidth
        />
        <Button
          label={calendarReturnLabel}
          onPress={handleCalendarBack}
          variant="subtle"
          fullWidth
        />
      </BottomActionBar>
      </ScrollView>

      {/* ── Kalender-Aktionen Modal ─────────────────────────────────── */}
      <Modal
        visible={showActionsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActionsModal(false)}
      >
        <View style={styles.actionsModalBackdrop}>
          <View style={styles.actionsModalCard}>
            <ScrollView
              style={styles.actionsModalScroll}
              contentContainerStyle={styles.actionsModalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.actionsModalTitle}>Kalender-Aktionen</Text>
              <Text style={styles.actionsModalSubtitle}>
                Alle Werkzeuge für Planung, Signale und Konten an einem Ort.
              </Text>

              <View style={styles.actionsSection}>
                <Text style={styles.actionsSectionTitle}>Planung</Text>

                <TouchableOpacity
                  style={[styles.actionsListBtn, vacationMode && styles.actionsListBtnActive]}
                  onPress={() => {
                    setVacationMode((prev) => !prev);
                    setShowActionsModal(false);
                  }}
                >
                  <Text style={[styles.actionsListBtnText, vacationMode && styles.actionsListBtnTextActive]}>
                    {vacationActionLabel}
                  </Text>
                  <Text style={styles.actionsListBtnMeta}>
                    {isVacationPlanningYear ? 'Team-Abstimmung für das nächste Jahr vorbereiten' : 'Urlaubstage im laufenden Jahr markieren'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionsListBtn, overrideMode && styles.overrideModeBtnActive]}
                  onPress={() => {
                    setOverrideMode((prev) => !prev);
                    setShowActionsModal(false);
                  }}
                >
                  <Text style={[styles.actionsListBtnText, overrideMode && styles.overrideModeBtnTextActive]}>
                    🔄 Ändern
                  </Text>
                  <Text style={styles.actionsListBtnMeta}>
                    Einzelne Dienste direkt im Kalender anpassen
                  </Text>
                </TouchableOpacity>

                {vacationMode && (
                  <TouchableOpacity
                    style={styles.actionsListBtn}
                    onPress={() => {
                      setShowActionsModal(false);
                      router.push('/(shift)/strategy');
                    }}
                  >
                    <Text style={[styles.actionsListBtnText, { color: colors.warning }]}>💡 Strategie</Text>
                    <Text style={styles.actionsListBtnMeta}>
                      Brückentage und Urlaubslösungen berechnen
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.actionsSection}>
                <Text style={styles.actionsSectionTitle}>Signale</Text>

                <TouchableOpacity
                  style={[styles.actionsListBtn, showCalendarSignals && styles.signalBtnActive]}
                  onPress={() => setShowCalendarSignals((prev) => !prev)}
                >
                  <Text style={[styles.actionsListBtnText, showCalendarSignals && styles.signalBtnTextActive]}>
                    ✨ Kalender-Signale
                  </Text>
                  <Text style={styles.actionsListBtnMeta}>
                    Signale einblenden und Themenfilter öffnen
                  </Text>
                </TouchableOpacity>

                {showCalendarSignals && (
                  <View style={styles.signalPanelModal}>
                    <TouchableOpacity
                      style={[styles.signalPill, showWDays && styles.signalPillActive]}
                      onPress={() => setShowWDays((prev) => !prev)}
                    >
                      <Text style={[styles.signalPillText, showWDays && styles.signalPillTextActive]}>
                        W-Tage
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.signalPill, showHolidaySignals && styles.signalPillActive]}
                      onPress={() => setShowHolidaySignals((prev) => !prev)}
                    >
                      <Text style={[styles.signalPillText, showHolidaySignals && styles.signalPillTextActive]}>
                        Feiertage
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.signalPill, showPreHolidaySignals && styles.signalPillActive]}
                      onPress={() => setShowPreHolidaySignals((prev) => !prev)}
                    >
                      <Text style={[styles.signalPillText, showPreHolidaySignals && styles.signalPillTextActive]}>
                        Vorfesttage
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {hasSufficientData(plan, userTaProfile) && (
                <View style={styles.actionsSection}>
                  <Text style={styles.actionsSectionTitle}>Konten</Text>
                  <TouchableOpacity
                    style={styles.actionsListBtn}
                    onPress={() => {
                      const { fromISO, toISO } = defaultTimeRange();
                      const summary = computeTimeAccountSummary({
                        plan: plan!,
                        userProfile: userTaProfile!,
                        spaceProfile: spaceRuleProfile,
                        holidayMap,
                        vacationDaySet: vacationDays,
                        fromISO,
                        toISO,
                      });
                      setTaSummary(summary);
                      setShowActionsModal(false);
                      setShowTaModal(true);
                    }}
                  >
                    <Text style={[styles.actionsListBtnText, { color: '#0E7490' }]}>📊 Freizeitkonto</Text>
                    <Text style={styles.actionsListBtnMeta}>
                      Prognose und Kontenlage für den gewählten Zeitraum öffnen
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={styles.actionsModalCloseBtn}
                onPress={() => setShowActionsModal(false)}
              >
                <Text style={styles.actionsModalCloseBtnText}>Schließen</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Freizeitkonto-Modal ─────────────────────────────────────── */}
      <Modal
        visible={showTaModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTaModal(false)}
      >
        <View style={styles.taModalBackdrop}>
          <View style={styles.taModalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.taModalTitle}>📊 Freizeitkonto-Prognose</Text>
              <Text style={styles.taModalPeriod}>
                Zeitraum: {defaultTimeRange().fromISO} – {defaultTimeRange().toISO}
              </Text>

              <View style={styles.taModalDisclaimer}>
                <Text style={styles.taModalDisclaimerText}>
                  ℹ️ Prognose auf Basis ausgewählter Regelinformationen –
                  kein Rechtsanspruch.
                </Text>
              </View>

              {taSummary ? (
                <>
                  <View style={styles.taRow}>
                    <Text style={styles.taKey}>🏖️ Urlaubstage</Text>
                    <Text style={styles.taVal}>{taSummary.vacationDays}</Text>
                  </View>
                  <View style={styles.taRow}>
                    <Text style={styles.taKey}>📅 Geplante Arbeitstage</Text>
                    <Text style={styles.taVal}>{taSummary.plannedWorkDays}</Text>
                  </View>
                  <View style={styles.taRow}>
                    <Text style={styles.taKey}>⏱ Gutgeschriebene Stunden</Text>
                    <Text style={styles.taVal}>{taSummary.creditedHours.toFixed(2)} h</Text>
                  </View>
                  <View style={styles.taRow}>
                    <Text style={styles.taKey}>💼 Startsaldo</Text>
                    <Text style={styles.taVal}>{taSummary.openingBalanceHours.toFixed(2)} h</Text>
                  </View>
                  <View style={[styles.taRow, styles.taRowHighlight]}>
                    <Text style={styles.taKeyBold}>📈 Stundensaldo gesamt</Text>
                    <Text style={[styles.taVal, styles.taValBold]}>
                      {taSummary.totalHoursBalance.toFixed(2)} h
                    </Text>
                  </View>
                  <View style={[styles.taRow, styles.taRowHighlight]}>
                    <Text style={styles.taKeyBold}>✨ Freizeitpotenzial</Text>
                    <Text style={[styles.taVal, styles.taValBold]}>
                      {taSummary.offDaysEquivalent} Tage
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={styles.taEmpty}>
                  Zu wenige Daten für eine Berechnung.{'\n'}
                  Bitte fülle dein Zeitkonto-Profil in den Services aus.
                </Text>
              )}

              <TouchableOpacity
                style={styles.taModalCloseBtn}
                onPress={() => setShowTaModal(false)}
              >
                <Text style={styles.taModalCloseBtnText}>Schließen</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.taModalDismissBtn}
                onPress={() => {
                  if (taSummary && profile) {
                    const storageProfileId = currentSpaceId ? buildSpaceProfileKey(currentSpaceId, profile.id) : profile.id;
                    setTimeAccountUiState({
                      profileId: storageProfileId,
                      dismissedForVersion: taSummary.summaryVersion,
                      dismissedAt: new Date().toISOString(),
                    });
                  }
                  setShowTaModal(false);
                }}
              >
                <Text style={styles.taModalDismissText}>Vorerst nicht mehr anzeigen</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Holiday Legend Sub-Component ────────────────────────────────────────────

function HolidayLegendForMonth({
  year, month, holidayMap,
}: {
  year: number; month: number; holidayMap: Record<string, Holiday>;
}) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const entries: { day: number; name: string }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateISO = toISO(year, month, d);
    const name = holidayMap[dateISO];
    if (name) entries.push({ day: d, name: name.name });
  }
  if (entries.length === 0) return null;

  return (
    <View style={styles.holidayLegend}>
      {entries.map(({ day, name }) => (
        <View key={day} style={styles.holidayLegendRow}>
          <View style={styles.holidayLegendDot} />
          <Text style={styles.holidayLegendText}>{day}. – {name}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Ghost Legend Sub-Component ──────────────────────────────────────────────

function GhostLegendForMonth({
  year, month, ghostMap,
}: {
  year: number; month: number; ghostMap: Record<string, GhostDayEntry[]>;
}) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const entries: { day: number; ghosts: GhostDayEntry[] }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateISO = toISO(year, month, d);
    const dayGhosts = ghostMap[dateISO];
    if (dayGhosts && dayGhosts.length > 0) entries.push({ day: d, ghosts: dayGhosts });
  }
  if (entries.length === 0) return null;

  return (
    <View style={styles.ghostLegend}>
      <Text style={styles.ghostLegendTitle}>👻 Ghosts in diesem Monat</Text>
      {entries.map(({ day, ghosts }) => (
        <View key={day} style={styles.ghostLegendRow}>
          <Text style={styles.ghostLegendDay}>{day}.</Text>
          {ghosts.map((g) => {
            const meta = SHIFT_META[g.code];
            return (
              <View key={g.ghostId} style={styles.ghostLegendEntry}>
                <View style={[styles.ghostLegendBadge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.ghostLegendCode, { color: meta.fg }]}>{meta.label}</Text>
                </View>
                <Text style={styles.ghostLegendLabel}>{g.ghostLabel}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingTop: 60 },
  pageScrollContent: { paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  header: { paddingHorizontal: PAGE_PADDING, marginBottom: 4 },
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  subtitle: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  chipHint: { fontSize: 10, color: colors.textTertiary, marginTop: 3 },

  // Vacation Mode
  vacModeRow: {
    flexDirection: 'row', paddingHorizontal: PAGE_PADDING, gap: 8, marginTop: 8, marginBottom: 2,
  },
  actionsRow: {
    paddingHorizontal: PAGE_PADDING,
    marginTop: 8,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  actionsLauncher: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 18,
    backgroundColor: colors.primaryBackground,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 58,
    justifyContent: 'center',
  },
  actionsLauncherActive: {
    backgroundColor: colors.primary,
  },
  actionsLauncherTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  actionsLauncherTitleActive: {
    color: colors.textInverse,
  },
  actionsLauncherSummary: {
    marginTop: 3,
    fontSize: 12,
    color: colors.textSecondary,
  },
  actionsLauncherSummaryActive: {
    color: 'rgba(255,255,255,0.88)',
  },
  todayLauncher: {
    width: 92,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 18,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 58,
    justifyContent: 'center',
    alignItems: 'center',
  },
  todayLauncherInactive: {
    borderColor: colors.border,
    backgroundColor: colors.backgroundTertiary,
  },
  todayLauncherTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  todayLauncherTitleInactive: {
    color: colors.textSecondary,
  },
  todayLauncherSummary: {
    marginTop: 3,
    fontSize: 12,
    color: colors.textSecondary,
  },
  todayLauncherSummaryInactive: {
    color: colors.textTertiary,
  },
  vacModeBtn: {
    borderWidth: 1, borderColor: colors.success, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.background,
  },
  vacModeBtnActive: {
    backgroundColor: colors.successBackground, borderColor: colors.success,
  },
  vacModeBtnText: { fontSize: 13, fontWeight: '600', color: colors.success },
  vacModeBtnTextActive: { color: colors.successDark },
  // Override Mode
  overrideModeBtnActive: {
    backgroundColor: '#FEF3C7', borderColor: colors.warning,
  },
  overrideModeBtnTextActive: { color: colors.warningDark },
  strategyBtn: {
    borderWidth: 1, borderColor: colors.warning, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#FFFBEB',
  },
  strategyBtnText: { fontSize: 13, fontWeight: '600', color: colors.warning },
  signalBtn: {
    borderWidth: 1,
    borderColor: '#7C3AED',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#F5F3FF',
  },
  signalBtnActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  signalBtnText: { fontSize: 13, fontWeight: '600', color: '#6D28D9' },
  signalBtnTextActive: { color: '#FFFFFF' },
  signalPanel: {
    paddingHorizontal: PAGE_PADDING,
    paddingTop: 4,
    paddingBottom: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  signalPanelModal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  signalPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.backgroundTertiary,
  },
  signalPillActive: {
    backgroundColor: colors.primaryBackground,
    borderColor: colors.primary,
  },
  signalPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  signalPillTextActive: {
    color: colors.primary,
  },
  actionsModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.45)',
    justifyContent: 'center',
    paddingHorizontal: PAGE_PADDING,
  },
  actionsModalCard: {
    backgroundColor: colors.background,
    borderRadius: 22,
    padding: spacing.lg,
    maxHeight: '82%',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  actionsModalScroll: {
    flexGrow: 0,
  },
  actionsModalScrollContent: {
    paddingBottom: 4,
  },
  actionsModalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  actionsModalSubtitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  actionsSection: {
    marginTop: 10,
  },
  actionsSectionTitle: {
    marginBottom: 8,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  actionsListBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  actionsListBtnActive: {
    backgroundColor: colors.successBackground,
    borderColor: colors.success,
  },
  actionsListBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  actionsListBtnTextActive: {
    color: colors.successDark,
  },
  actionsListBtnMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  actionsModalCloseBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionsModalCloseBtnText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },

  // Vacation Counter
  vacCounterRow: {
    paddingHorizontal: PAGE_PADDING,
    paddingVertical: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  vacCounterRowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  vacCounterText: { fontSize: 13, color: colors.textSecondary },
  vacCounterBold: { fontWeight: '700', color: colors.success, fontSize: 15 },
  vacLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vacLegendRowStacked: {
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: colors.textSecondary },
  planningBudgetPill: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 2,
  },
  planningBudgetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  planningBudgetTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  planningBudgetFree: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.success,
  },
  planningBudgetWarning: {
    color: colors.warning,
  },
  planningBudgetTrack: {
    height: 6,
    backgroundColor: colors.borderLight,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 5,
  },
  planningBudgetFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 999,
  },
  planningBudgetMeta: {
    fontSize: 11,
    color: colors.textSecondary,
  },

  // Month Navigation
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: PAGE_PADDING, paddingVertical: 8, gap: 16,
  },
  navArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
  navArrowText: { fontSize: 24, fontWeight: '600', color: colors.grayDark, lineHeight: 28 },
  monthHeaderTouchable: { flex: 1, alignItems: 'center' },
  monthHeaderText: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  flatList: { minHeight: CELL_SIZE * 6 + 260 },
  monthPage: { paddingHorizontal: PAGE_PADDING, paddingTop: 8, paddingBottom: 8 },

  weekdayHeaderRow: { flexDirection: 'row', marginBottom: 6 },
  weekdayHeaderCell: { width: CELL_SIZE, alignItems: 'center', paddingVertical: 6 },
  weekdayHeaderText: { fontSize: 12, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },

  dayCell: {
    width: CELL_SIZE, height: CELL_SIZE + 24, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  dayCellOutside: { opacity: 0.25 },
  dayCellToday: { borderWidth: 2, borderColor: colors.primary },
  // Absolut-positionierter Overlay für chip-lokalen Blink (opacity wird via Animated.Value gesteuert)
  blinkOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 106, 0, 0.36)',
    borderWidth: 2,
    borderColor: '#FF6A00',
  },
  dayCellVacMode: { borderWidth: 1, borderColor: colors.grayLight },
  dayCellVacation: { borderWidth: 2, borderColor: colors.success },
  dayCellOverrideMode: { borderWidth: 1, borderColor: colors.warning },
  dayNumber: { fontSize: 14, fontWeight: '600', color: colors.grayDark },
  dayNumberOutside: { color: colors.textTertiary },
  dayNumberToday: { color: colors.primary, fontWeight: '800' },
  dayShiftCode: { fontSize: 10, fontWeight: '800', marginTop: -1 },
  dayShiftCodeSmall: { fontSize: 8, fontWeight: '700', marginTop: 0 },
  dayShiftCodeArrow: { fontSize: 8, fontWeight: '600', marginHorizontal: 1 },

  // 2-Ebenen Layout für Original + Aktuell
  twoLineContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 1,
  },
  originalLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  originalText: {
    fontSize: 9,
    fontWeight: '600',
  },
  arrowText: {
    fontSize: 8,
    fontWeight: '600',
    color: colors.textTertiary,
    marginHorizontal: 1,
  },
  currentLine: {
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLineTransparent: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  currentText: {
    fontSize: 14,
    fontWeight: '800',
  },

  // Holiday indicator (bottom edge only)
  holidayBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    backgroundColor: colors.error,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  preHolidayTopBar: {
    position: 'absolute',
    left: 2,
    right: 2,
    top: 2,
    height: 4,
    backgroundColor: '#14B8A6',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  ghostDot: { position: 'absolute', bottom: 3, right: 3, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.purple },
  // Override Dot
  overrideDot: { position: 'absolute', top: 3, left: 3, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning },
  // Schulferien Dot
  schoolDot: { position: 'absolute', top: 3, right: 3, width: 5, height: 5, borderRadius: 3, backgroundColor: '#059669' },

  // Holiday Legend
  holidayLegend: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.errorLight },
  holidayLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  holidayLegendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.error },
  holidayLegendText: { fontSize: 12, color: colors.errorDark },

  // Ghost Legend
  ghostLegend: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.purpleLight },
  ghostLegendTitle: { fontSize: 12, fontWeight: '700', color: colors.purple, marginBottom: 6 },
  ghostLegendRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  ghostLegendDay: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, width: 24 },
  ghostLegendEntry: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ghostLegendBadge: { width: 20, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  ghostLegendCode: { fontSize: 10, fontWeight: '700' },
  ghostLegendLabel: { fontSize: 11, color: colors.textSecondary },

  // Empty State
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: PAGE_PADDING },
  emptyEmoji: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptyDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24, paddingHorizontal: 16 },
  setupBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 28, alignItems: 'center' },
  setupBtnText: { color: colors.textInverse, fontSize: 15, fontWeight: '600' },

  // Freizeitkonto Button
  taBtn: {
    marginHorizontal: PAGE_PADDING, marginTop: 6, marginBottom: 2,
    borderWidth: 1, borderColor: '#0891B2', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7, alignSelf: 'flex-start',
    backgroundColor: '#ECFEFF',
  },
  taBtnText: { fontSize: 13, fontWeight: '600', color: '#0E7490' },

  // Freizeitkonto Modal
  taModalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  taModalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: '85%',
  },
  taModalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  taModalPeriod: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  taModalDisclaimer: {
    backgroundColor: colors.primaryBackground,
    borderRadius: borderRadius.md,
    padding: spacing.xs,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryVariant,
  },
  taModalDisclaimerText: {
    fontSize: typography.fontSize.xs,
    color: colors.primary,
    lineHeight: 18,
  },
  taRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  taRowHighlight: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 0,
    marginTop: spacing.xs,
  },
  taKey: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  taKeyBold: { fontSize: typography.fontSize.sm, color: colors.textPrimary, fontWeight: typography.fontWeight.semibold },
  taVal: { fontSize: typography.fontSize.sm, color: colors.textPrimary },
  taValBold: { fontWeight: typography.fontWeight.bold, color: colors.primary },
  taEmpty: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingVertical: spacing.lg },
  taModalCloseBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  taModalCloseBtnText: { color: colors.textInverse, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold },
  taModalDismissBtn: {
    paddingVertical: 10, alignItems: 'center', marginTop: spacing.sm,
  },
  taModalDismissText: { fontSize: typography.fontSize.sm, color: colors.textTertiary, textDecorationLine: 'underline' },

  // Bottom Buttons
  bottomButtons: { gap: 10 },
});


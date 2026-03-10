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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  getProfile,
  getShiftPlan,
  getAllShiftPlans,
  getCurrentSpaceId,
  listGhosts,
  todayISO,
  getVacationDays,
  toggleVacationDay,
  getSpaceRuleProfile,
  getUserTimeAccountProfile,
  getTimeAccountUiState,
  setTimeAccountUiState,
  getShiftOverrides,
  toggleShiftOverride,
  getDayChanges,
  isValidISODate,
  type DayChange,
} from '../../lib/storage';
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
import type { UserProfile, UserShiftPlan, ShiftType } from '../../types';

// ─── Konstanten ──────────────────────────────────────────────────────────────

const MONTHS_BEFORE = 12;
const MONTHS_AFTER = 12;
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
    returnMonthKey?: string;
    suppressTaModal?: string;
    returnToken?: string;
  }>();
  const flatListRef = useRef<FlatList>(null);
  const pendingTargetIndexRef = useRef<number | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [plan, setPlan] = useState<UserShiftPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(TODAY_INDEX);

  const [shiftMap, setShiftMap] = useState<Record<string, ShiftType>>({});
  const [ghostMap, setGhostMap] = useState<Record<string, GhostDayEntry[]>>({});

  // Vacation planning
  const [vacationMode, setVacationMode] = useState(false);
  const [vacationDays, setVacationDays] = useState<Set<string>>(new Set());

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
      const targetIndex = getTargetIndexFromParams();
      if (targetIndex === null) return;
      scrollToMonthIndex(targetIndex, false);
      requestAnimationFrame(() => {
        if (pendingTargetIndexRef.current !== null) {
          scrollToMonthIndex(pendingTargetIndexRef.current, false);
        }
      });
    }, [params.dateISO, params.returnMonthKey, params.suppressTaModal, params.returnToken])
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

  // Hardware-Back auf Kalender: zurück zur Startseite.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        router.replace('/');
        return true;
      });
      return () => sub.remove();
    }, [router])
  );

  // Daten laden
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      getProfile().then(async (p) => {
        if (!active) return;
        setProfile(p);
        if (p) {
          const shiftPlan = await getShiftPlan(p.id);
          if (active) setPlan(shiftPlan);

          if (shiftPlan && active) {
            const map: Record<string, ShiftType> = {};
            for (const entry of shiftPlan.entries) {
              map[entry.dateISO] = entry.code;
            }
            setShiftMap(map);
          }

          // Vacation days laden
          const vDays = await getVacationDays(p.id);
          if (active) setVacationDays(new Set(vDays));

          // Shift Overrides laden
          const overrides = await getShiftOverrides(p.id);
          if (active) setShiftOverrides(overrides);

          // Day Changes History laden
          const changes = await getDayChanges(p.id);
          if (active) setDayChanges(changes);

          const spaceId = await getCurrentSpaceId();
          if (spaceId && active) {
            const ghosts = await listGhosts(spaceId);
            const allPlans = await getAllShiftPlans();
            const gMap: Record<string, GhostDayEntry[]> = {};
            for (const ghost of ghosts) {
              const ghostPlan = allPlans[ghost.id];
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
            if (active) setGhostMap(gMap);

            // ── Time Account Daten laden ───────────────────────────────
            const [sr, ur] = await Promise.all([
              getSpaceRuleProfile(spaceId),
              getUserTimeAccountProfile(p.id),
            ]);
            if (!active) return;
            setSpaceRuleProfile(sr);
            setUserTaProfile(ur);
            // ── Auto-Show: Modal wenn Summary sich geändert hat ────────
            if (shiftPlan && ur && hasSufficientData(shiftPlan, ur)) {
              const { fromISO, toISO } = defaultTimeRange();
              const version = computeSummaryVersion(shiftPlan, ur, sr, fromISO, toISO);
              const uiState = await getTimeAccountUiState(p.id);
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
          } else if (p) {
            // kein Space → nur User-Profil laden
            const ur = await getUserTimeAccountProfile(p.id);
            if (active) setUserTaProfile(ur);
            // ── Auto-Show auch ohne Space ──────────────────────────────
            if (shiftPlan && ur && hasSufficientData(shiftPlan, ur)) {
              const { fromISO, toISO } = defaultTimeRange();
              const version = computeSummaryVersion(shiftPlan, ur, null, fromISO, toISO);
              const uiState = await getTimeAccountUiState(p.id);
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
          }
        }
        if (active) setLoading(false);
      });
      return () => { active = false; };
    }, [])
  );

  const currentMonth = months[currentIndex];
  const headerText = currentMonth
    ? `${MONTH_LABELS[currentMonth.month - 1]} ${currentMonth.year}`
    : '';

  // Vacation counter for displayed year
  const currentYear = currentMonth?.year ?? new Date().getFullYear();
  const vacationCountForYear = useMemo(() => {
    let count = 0;
    vacationDays.forEach((d) => {
      if (d.startsWith(`${currentYear}-`)) count++;
    });
    return count;
  }, [vacationDays, currentYear]);

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
      // Urlaub-Modus: Urlaub setzen (hat Priorität)
      const updated = await toggleVacationDay(profile.id, dateISO);
      setVacationDays(new Set(updated));
      const changes = await getDayChanges(profile.id);
      setDayChanges(changes);
    } else if (overrideMode && profile) {
      // Override-Modus: einmalige Schichtänderung
      const updated = await toggleShiftOverride(profile.id, dateISO);
      setShiftOverrides(updated);
      const changes = await getDayChanges(profile.id);
      setDayChanges(changes);
    } else {
      router.push({
        pathname: '/(swap)/candidates',
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
              const meta = shift ? SHIFT_META[shift] : null;
              const dayGhosts = ghostMap[cell.dateISO];
              const hasGhost = dayGhosts && dayGhosts.length > 0;
              const isHoliday = !!holidayMap[cell.dateISO];
              const isVacation = vacationDays.has(cell.dateISO);
              const isSchoolHoliday = !!schoolHolidayMap?.[cell.dateISO];
              const overrideCode = shiftOverrides[cell.dateISO];
              const overrideMeta = overrideCode ? SHIFT_META[overrideCode] : null;
              
              // Day Change History
              const dayChange = dayChanges[cell.dateISO];
              const hasDayChange = !!dayChange;
              
              // Original-Code: aus dem Shift-Plan (shiftMap)
              const originalCode = shift && cell.inMonth ? shift : null;
              const originalMeta = originalCode ? SHIFT_META[originalCode] : null;
              
              // Priorität: U > Override > Plan (für Aktuell-Code)
              let currentCode: ShiftType | null = null;
              if (isVacation && cell.inMonth) {
                currentCode = 'U';
              } else if (overrideCode && cell.inMonth) {
                currentCode = overrideCode;
              } else if (shift && cell.inMonth) {
                currentCode = shift;
              }

              const currentMeta = currentCode ? SHIFT_META[currentCode] : null;

              // Bestimme Hintergrund-Farbe basierend auf dem Aktuellen Code
              let cellBg: string | undefined;
              if (currentMeta && cell.inMonth) {
                cellBg = currentMeta.bg;
              }

              // Text-Farbe
              let cellFg: string | undefined;
              if (currentMeta && cell.inMonth) {
                cellFg = currentMeta.fg;
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
                          <Text style={[styles.originalText, { color: originalMeta.fg }]}>
                            {originalMeta.label}
                          </Text>
                          <Text style={styles.arrowText}>→</Text>
                        </View>
                      )}
                      {/* Untere Zeile: Aktueller Code - dominant */}
                      <View style={[styles.currentLine, { backgroundColor: currentMeta?.bg }]}>
                        <Text style={[styles.currentText, { color: currentMeta?.fg }]}>
                          {currentMeta?.label}
                        </Text>
                      </View>
                    </View>
                  ) : cell.inMonth && isVacation ? (
                    /* Urlaub: Original oben, U unten */
                    <View style={styles.twoLineContainer}>
                      {originalMeta && (
                        <View style={styles.originalLine}>
                          <Text style={[styles.originalText, { color: originalMeta.fg }]}>
                            {originalMeta.label}
                          </Text>
                          <Text style={styles.arrowText}>→</Text>
                        </View>
                      )}
                      <View style={[styles.currentLine, { backgroundColor: SHIFT_META.U.bg }]}>
                        <Text style={[styles.currentText, { color: SHIFT_META.U.fg }]}>U</Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Feiertag-Indikator */}
                  {isHoliday && cell.inMonth && (
                    <View style={styles.holidayDot} />
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
  }, [shiftMap, ghostMap, today, router, holidayMap, schoolHolidayMap, vacationDays, vacationMode, profile, plan, shiftOverrides, overrideMode, dayChanges, blinkDateISO]);

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
          {/* ── Vacation Mode Toggle ───────────────────────────────── */}
          <View style={styles.vacModeRow}>
            <TouchableOpacity
              style={[styles.vacModeBtn, vacationMode && styles.vacModeBtnActive]}
              onPress={() => setVacationMode(!vacationMode)}
            >
              <Text style={[styles.vacModeBtnText, vacationMode && styles.vacModeBtnTextActive]}>
                🏖️ Urlaub
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.vacModeBtn, overrideMode && styles.overrideModeBtnActive]}
              onPress={() => setOverrideMode(!overrideMode)}
            >
              <Text style={[styles.vacModeBtnText, overrideMode && styles.overrideModeBtnTextActive]}>
                🔄 Ändern
              </Text>
            </TouchableOpacity>

            {vacationMode && (
              <TouchableOpacity
                style={styles.strategyBtn}
                onPress={() => router.push('/(shift)/strategy')}
              >
                <Text style={styles.strategyBtnText}>💡 Strategie</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Vacation Counter ───────────────────────────────────── */}
          {(vacationMode || overrideMode) && (
            <View style={styles.vacCounterRow}>
              <Text style={styles.vacCounterText}>
                {vacationMode && (
                  <>Urlaubstage {currentYear}: <Text style={styles.vacCounterBold}>{vacationCountForYear}</Text></>
                )}
                {overrideMode && !vacationMode && (
                  <>Einmalige Änderungen aktiv</>
                )}
              </Text>
              <View style={styles.vacLegendRow}>
                <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
                <Text style={styles.legendLabel}>Feiertag</Text>
                <View style={[styles.legendDot, { backgroundColor: SHIFT_META.U.bg, borderWidth: 1, borderColor: SHIFT_META.U.fg }]} />
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

          {/* ── Freizeitkonto-Button ────────────────────────────────── */}
          {hasSufficientData(plan, userTaProfile) && (
            <TouchableOpacity
              style={styles.taBtn}
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
                setShowTaModal(true);
              }}
            >
              <Text style={styles.taBtnText}>📊 Freizeitkonto</Text>
            </TouchableOpacity>
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

          {currentIndex !== TODAY_INDEX && (
            <TouchableOpacity style={styles.todayBtn} onPress={scrollToToday}>
              <Text style={styles.todayBtnText}>Heute</Text>
            </TouchableOpacity>
          )}

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
            maxToRenderPerBatch={3}
            removeClippedSubviews={false}
            extraData={`${vacationMode}-${vacationDays.size}-${overrideMode}-${Object.keys(shiftOverrides).length}-${Object.keys(dayChanges).length}`}
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
      <View style={styles.bottomButtons}>
        <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/(shift)/setup')}>
          <Text style={styles.editBtnText}>Muster bearbeiten</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/')}>
          <Text style={styles.backBtnText}>Zurück zum Start</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>

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
                    setTimeAccountUiState({
                      profileId: profile.id,
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

  // Vacation Counter
  vacCounterRow: {
    paddingHorizontal: PAGE_PADDING, paddingVertical: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  vacCounterText: { fontSize: 13, color: colors.textSecondary },
  vacCounterBold: { fontWeight: '700', color: colors.success, fontSize: 15 },
  vacLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: colors.textSecondary },

  // Month Navigation
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: PAGE_PADDING, paddingVertical: 8, gap: 16,
  },
  navArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
  navArrowText: { fontSize: 24, fontWeight: '600', color: colors.grayDark, lineHeight: 28 },
  monthHeaderTouchable: { flex: 1, alignItems: 'center' },
  monthHeaderText: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  todayBtn: { alignSelf: 'center', backgroundColor: colors.primary, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 4 },
  todayBtnText: { color: colors.textInverse, fontSize: 13, fontWeight: '600' },

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
  currentText: {
    fontSize: 14,
    fontWeight: '800',
  },

  // Holiday Dot
  holidayDot: { position: 'absolute', bottom: 3, left: 3, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.error },
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
  bottomButtons: { paddingHorizontal: PAGE_PADDING, paddingBottom: 40, paddingTop: 12, gap: 10 },
  editBtn: { borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center', backgroundColor: colors.primaryBackground },
  editBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  backBtn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center', backgroundColor: colors.backgroundTertiary },
  backBtnText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
});


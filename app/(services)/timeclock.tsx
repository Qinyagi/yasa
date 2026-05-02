import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import type {
  RegularShiftCode,
  ShiftType,
  TimeClockEvent,
  TimeClockEventType,
  UserProfile,
  UserShiftPlan,
  UserTimeClockConfig,
  UserTimeClockShiftSettings,
} from '../../types';
import {
  addTimeClockEvent,
  buildSpaceProfileKey,
  clearTimeClockQaDateOverride,
  getCurrentSpaceId,
  deriveTimeClockStampState,
  deleteTimeClockEvent,
  getProfile,
  getSpaceRuleProfile,
  getShiftForDate,
  getShiftForDateForSpace,
  getShiftPlanForSpace,
  getTimeClockQaCalendar,
  getTimeClockUiState,
  getTimeClockConfigOrDefault,
  getTimeClockEvents,
  getShiftOverridesForSpace,
  getXCompensationBookings,
  formatDateISO,
  setTimeClockQaDateOverride,
  setTimeClockTestPrompt,
  setTimeClockConfig,
  setTimeClockUiState,
  shiftLabelForStamp,
  todayISO,
  updateTimeClockEvent,
} from '../../lib/storage';
import { getHolidayMap, type Holiday } from '../../data/holidays';
import type { SpaceRuleProfile } from '../../types/timeAccount';
import type { XCompensationBooking } from '../../types/timeAccount';
import { computeMonthlyWorkProgress } from '../../lib/timeAccountEngine';
import { autoStampMissedShifts } from '../../lib/autoStamp';
import {
  buildShiftCases,
  buildDaySummaries,
  REGULAR_SHIFT_CODES,
} from '../../lib/timeclockCases';
import { typography, spacing, borderRadius, shadows, warmHuman, semantic } from '../../constants/theme';

function weekdayLabel(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('de-DE', { weekday: 'long' });
}

function timePart(timestampISO: string): string {
  const date = new Date(timestampISO);
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatHoursDecimal(hours: number): string {
  return `${hours.toFixed(2).replace('.', ',')} h`;
}

function formatSignedHoursDecimal(hours: number): string {
  const sign = hours > 0 ? '+' : hours < 0 ? '-' : '';
  return `${sign}${Math.abs(hours).toFixed(2).replace('.', ',')} h`;
}

function isValidDateISO(dateISO: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return false;
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function normalizeTimeDraft(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normalizeToHHMM(input: string, fallback = '00:00'): string {
  const digits = input.replace(/\D/g, '').slice(0, 4);
  if (digits.length === 0) return fallback;
  let h = 0;
  let m = 0;
  if (digits.length <= 2) {
    h = Number(digits);
  } else if (digits.length === 3) {
    h = Number(digits.slice(0, 1));
    m = Number(digits.slice(1, 3));
  } else {
    h = Number(digits.slice(0, 2));
    m = Number(digits.slice(2, 4));
  }
  const hh = Math.max(0, Math.min(23, Number.isFinite(h) ? h : 0));
  const mm = Math.max(0, Math.min(59, Number.isFinite(m) ? m : 0));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function toTimestampISO(dateISO: string, hhmmInput: string): string {
  const hhmm = normalizeToHHMM(hhmmInput, '00:00');
  const [y, m, d] = dateISO.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

function plusDays(baseISO: string, days: number): string {
  const [y, m, d] = baseISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return formatDateISO(date);
}

function buildHolidayLookup(dateISOs: string[]): Record<string, Holiday> {
  const years = new Set<number>();
  for (const dateISO of dateISOs) {
    const y = Number(dateISO.slice(0, 4));
    if (Number.isFinite(y)) {
      years.add(y);
      years.add(y + 1);
    }
  }
  const lookup: Record<string, Holiday> = {};
  years.forEach((year) => Object.assign(lookup, getHolidayMap(year)));
  return lookup;
}

function dateISOFromTimestampLocal(timestampISO: string): string {
  return formatDateISO(new Date(timestampISO));
}

function dateMarkers(
  dateISO: string,
  holidayLookup: Record<string, Holiday>
): Array<{ kind: 'holiday' | 'preholiday'; label: string }> {
  const markers: Array<{ kind: 'holiday' | 'preholiday'; label: string }> = [];
  const holiday = holidayLookup[dateISO];
  if (holiday) {
    markers.push({ kind: 'holiday', label: `Feiertag: ${holiday.name}` });
  }
  const nextHoliday = holidayLookup[plusDays(dateISO, 1)];
  if (nextHoliday) {
    markers.push({ kind: 'preholiday', label: `Vorfeiertag vor ${nextHoliday.name}` });
  }
  return markers;
}

function xCompensationTitle(booking?: XCompensationBooking): string {
  if (booking?.source === 'U') return 'Urlaub';
  if (booking?.source === 'W') return 'W-Tag';
  return 'Frei genommen';
}

function xCompensationCode(booking?: XCompensationBooking): string {
  if (booking?.source === 'U') return 'U';
  if (booking?.source === 'W') return 'W';
  return 'X';
}

function xCompensationMeta(booking?: XCompensationBooking): string {
  if (booking?.source === 'U') return 'Urlaub (U): keine Stempel erforderlich';
  if (booking?.source === 'W') return 'W-Tag: keine Stempel erforderlich';
  return 'Frei genommen (X): Platzhalterzeiten werden ignoriert';
}

// ShiftCaseSummary, DaySummary, buildShiftCases, buildDaySummaries,
// REGULAR_SHIFT_CODES and SHIFT_SORT_ORDER are imported from lib/timeclockCases.


export default function TimeClockServiceScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stamping, setStamping] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [config, setConfig] = useState<UserTimeClockConfig | null>(null);
  const [shiftPlan, setShiftPlan] = useState<UserShiftPlan | null>(null);
  const [spaceProfile, setSpaceProfile] = useState<SpaceRuleProfile | null>(null);
  const [selectedShiftCode, setSelectedShiftCode] = useState<RegularShiftCode>('F');
  const [selectedEventType, setSelectedEventType] = useState<TimeClockEventType>('check_in');
  const [events, setEvents] = useState<Awaited<ReturnType<typeof getTimeClockEvents>>>([]);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editDateISO, setEditDateISO] = useState('');
  const [editTimeInput, setEditTimeInput] = useState('');
  const [editShiftCode, setEditShiftCode] = useState<RegularShiftCode>('F');
  const [editEventType, setEditEventType] = useState<TimeClockEventType>('check_in');
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [monthExplanationExpanded, setMonthExplanationExpanded] = useState(false);
  const [qaExpanded, setQaExpanded] = useState(false);
  const [qaDateInput, setQaDateInput] = useState(todayISO());
  const [qaOverrides, setQaOverrides] = useState<Record<string, 'holiday' | 'preholiday'>>({});
  const [shiftOverrides, setShiftOverrides] = useState<Record<string, ShiftType>>({});
  const [xCompensations, setXCompensations] = useState<Record<string, XCompensationBooking>>({});

  const getStorageProfileId = useCallback(async (): Promise<string | null> => {
    if (!profile?.id) return null;
    const spaceId = await getCurrentSpaceId();
    return spaceId ? buildSpaceProfileKey(spaceId, profile.id) : profile.id;
  }, [profile?.id]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const p = await getProfile();
    setProfile(p);
    if (!p) {
      setConfig(null);
      setShiftPlan(null);
      setSpaceProfile(null);
      setEvents([]);
      setLoading(false);
      return;
    }
    const spaceId = await getCurrentSpaceId();
    const storageProfileId = spaceId ? buildSpaceProfileKey(spaceId, p.id) : p.id;
    // Auto-Platzhalter für vergessene Stempelzeiten befüllen (vor Event-Lesen, idempotent)
    try { await autoStampMissedShifts(p.id, { spaceId }); } catch { /* best-effort */ }
    const cfg = await getTimeClockConfigOrDefault(storageProfileId);
    const plan = spaceId ? await getShiftPlanForSpace(spaceId, p.id) : null;
    const eventList = await getTimeClockEvents(storageProfileId);
    const qaMap = await getTimeClockQaCalendar(storageProfileId);
    const overridesMap = spaceId ? await getShiftOverridesForSpace(spaceId, p.id) : {};
    const xCompensationMap = await getXCompensationBookings(storageProfileId);
    const sr = spaceId ? await getSpaceRuleProfile(spaceId) : null;
    const ui = await getTimeClockUiState(storageProfileId);
    const today = todayISO();
    const yesterday = plusDays(today, -1);
    const todayShift = spaceId ? await getShiftForDateForSpace(spaceId, p.id, today) : await getShiftForDate(p.id, today);
    const yesterdayShift = spaceId ? await getShiftForDateForSpace(spaceId, p.id, yesterday) : await getShiftForDate(p.id, yesterday);
    setConfig(cfg);
    setShiftPlan(plan);
    setSpaceProfile(sr);
    setEvents(eventList);
    setQaOverrides(qaMap);
    setShiftOverrides(overridesMap);
    setXCompensations(xCompensationMap);
    setSettingsExpanded(ui?.settingsExpanded ?? true);

    let selectedFromYesterdayOpen = false;
    if (yesterdayShift && REGULAR_SHIFT_CODES.includes(yesterdayShift as RegularShiftCode)) {
      const yesterdayShiftEvents = eventList.filter(
        (e) => e.dateISO === yesterday && e.shiftCode === yesterdayShift
      );
      const yesterdayState = deriveTimeClockStampState(yesterdayShiftEvents);
      if (yesterdayState.phase === 'awaiting_check_out') {
        setSelectedShiftCode(yesterdayShift as RegularShiftCode);
        selectedFromYesterdayOpen = true;
      }
    }

    if (
      !selectedFromYesterdayOpen &&
      todayShift &&
      (todayShift === 'F' ||
        todayShift === 'S' ||
        todayShift === 'N' ||
        todayShift === 'KS' ||
        todayShift === 'KN' ||
        todayShift === 'T')
    ) {
      setSelectedShiftCode(todayShift);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadData().catch(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [loadData])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        loadData().catch(() => null);
      }
    });
    return () => subscription.remove();
  }, [loadData]);

  const xOverrideDates = useMemo(() => {
    return new Set(
      Object.entries(shiftOverrides)
        .filter(([, code]) => code === 'X')
        .map(([dateISO]) => dateISO)
    );
  }, [shiftOverrides]);

  const eventsForEvaluation = useMemo(() => {
    return events.filter((e) => !(e.source === 'auto_placeholder' && xOverrideDates.has(e.dateISO)));
  }, [events, xOverrideDates]);

  const shiftCases = useMemo(() => buildShiftCases(eventsForEvaluation, config), [eventsForEvaluation, config]);
  const xOnlyCaseDates = useMemo(() => {
    const existingDates = new Set(shiftCases.map((entry) => entry.dateISO));
    return Array.from(xOverrideDates)
      .filter((dateISO) => !existingDates.has(dateISO))
      .sort((a, b) => b.localeCompare(a));
  }, [shiftCases, xOverrideDates]);
  type ShiftListRow =
    | { kind: 'case'; entry: (typeof shiftCases)[number] }
    | { kind: 'x'; dateISO: string };
  const shiftListRows = useMemo<ShiftListRow[]>(() => {
    const rows: ShiftListRow[] = [
      ...shiftCases.map((entry) => ({ kind: 'case' as const, entry })),
      ...xOnlyCaseDates.map((dateISO) => ({ kind: 'x' as const, dateISO })),
    ];
    return rows.sort((a, b) => {
      const aDate = a.kind === 'case' ? a.entry.dateISO : a.dateISO;
      const bDate = b.kind === 'case' ? b.entry.dateISO : b.dateISO;
      // Neueste Tage oben; bei gleichem Datum zuerst regulärer Case, dann X-only row.
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      if (a.kind === b.kind) return 0;
      return a.kind === 'case' ? -1 : 1;
    });
  }, [shiftCases, xOnlyCaseDates]);

  type StampListRow =
    | { kind: 'event'; event: TimeClockEvent }
    | { kind: 'x'; dateISO: string };
  const displayRows = useMemo<StampListRow[]>(() => {
    const nonXEventRows: StampListRow[] = events
      .filter((e) => !xOverrideDates.has(e.dateISO))
      .map((event) => ({ kind: 'event', event }));
    const xRows: StampListRow[] = Array.from(xOverrideDates).map((dateISO) => ({
      kind: 'x',
      dateISO,
    }));
    const sortKey = (row: StampListRow): number => {
      if (row.kind === 'event') return new Date(row.event.timestampISO).getTime();
      return new Date(`${row.dateISO}T12:00:00`).getTime();
    };
    return [...xRows, ...nonXEventRows]
      .sort((a, b) => sortKey(b) - sortKey(a))
      .slice(0, 30);
  }, [events, xOverrideDates]);
  const daySummaries = useMemo(() => buildDaySummaries(shiftCases), [shiftCases]);
  const effectivePlan = useMemo(() => {
    if (!shiftPlan) return null;
    const byDate: Record<string, ShiftType> = {};
    for (const entry of shiftPlan.entries) {
      byDate[entry.dateISO] = entry.code;
    }
    for (const [dateISO, code] of Object.entries(shiftOverrides)) {
      byDate[dateISO] = code;
    }
    const mergedEntries = Object.entries(byDate)
      .map(([dateISO, code]) => ({ dateISO, code }))
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    return {
      ...shiftPlan,
      entries: mergedEntries,
    };
  }, [shiftPlan, shiftOverrides]);
  const monthSummary = useMemo(
    () =>
      computeMonthlyWorkProgress({
        plan: effectivePlan,
        config,
        events: eventsForEvaluation,
        spaceProfile,
        qaDateOverrides: qaOverrides,
      }),
    [effectivePlan, config, eventsForEvaluation, spaceProfile, qaOverrides]
  );
  const holidayLookup = useMemo(() => {
    const seedDates = [
      monthSummary.fromISO,
      monthSummary.toISO,
      todayISO(),
      ...events.map((e) => e.dateISO),
      ...daySummaries.map((d) => d.dateISO),
      ...shiftCases.map((s) => s.dateISO),
    ];
    return buildHolidayLookup(seedDates);
  }, [events, daySummaries, shiftCases, monthSummary.fromISO, monthSummary.toISO]);

  const selectedShiftDateISO = useMemo(() => {
    const today = todayISO();
    const yesterday = plusDays(today, -1);
    const yesterdayEvents = events.filter(
      (e) => e.dateISO === yesterday && e.shiftCode === selectedShiftCode
    );
    const yesterdayState = deriveTimeClockStampState(yesterdayEvents);
    // Service-Screen bleibt bewusst event-basiert:
    // offener Dienst von gestern bleibt sichtbar, auch wenn das Startscreen-Popup-Fenster abgelaufen ist.
    if (yesterdayState.phase === 'awaiting_check_out') return yesterday;
    return today;
  }, [events, selectedShiftCode]);

  const selectedShiftEvents = useMemo(
    () =>
      eventsForEvaluation.filter(
        (e) => e.dateISO === selectedShiftDateISO && e.shiftCode === selectedShiftCode
      ),
    [eventsForEvaluation, selectedShiftCode, selectedShiftDateISO]
  );

  const selectedDateIsX = useMemo(
    () => xOverrideDates.has(selectedShiftDateISO),
    [xOverrideDates, selectedShiftDateISO]
  );
  const selectedDateXCompensation = xCompensations[selectedShiftDateISO];

  const selectedShiftState = useMemo(
    () => deriveTimeClockStampState(selectedShiftEvents),
    [selectedShiftEvents]
  );

  useEffect(() => {
    if (selectedShiftState.allowedEventType && selectedShiftState.allowedEventType !== selectedEventType) {
      setSelectedEventType(selectedShiftState.allowedEventType);
    }
  }, [selectedShiftState.allowedEventType, selectedEventType]);

  function updateShiftSetting(
    shiftCode: RegularShiftCode,
    field: 'startTime' | 'endTime' | 'paidFlexMinutes' | 'postShiftGraceMinutes',
    value: string
  ) {
    if (!config) return;
    const current = config.shiftSettings[shiftCode];
    const nextValue =
      field === 'startTime' || field === 'endTime'
        ? normalizeTimeDraft(value)
        : Number.isFinite(Number(value))
          ? Math.max(0, Math.min(180, Number(value)))
          : 0;

    const updated: UserTimeClockShiftSettings = {
      ...config.shiftSettings,
      [shiftCode]: {
        ...current,
        [field]: nextValue,
      },
    };
    setConfig({ ...config, shiftSettings: updated });
  }

  function finalizeShiftTime(shiftCode: RegularShiftCode, field: 'startTime' | 'endTime') {
    if (!config) return;
    const current = config.shiftSettings[shiftCode];
    const normalized = normalizeToHHMM(current[field], current[field]);
    const updated: UserTimeClockShiftSettings = {
      ...config.shiftSettings,
      [shiftCode]: {
        ...current,
        [field]: normalized,
      },
    };
    setConfig({ ...config, shiftSettings: updated });
  }

  async function handleSaveConfig() {
    if (!config) return;
    const storageProfileId = await getStorageProfileId();
    if (!storageProfileId) return;
    setSaving(true);
    await setTimeClockConfig({ ...config, profileId: storageProfileId });
    setSaving(false);
    Alert.alert('Gespeichert', 'Deine Stempeluhr-Einstellungen wurden gespeichert.');
  }

  async function handleToggleSettingsExpanded() {
    if (!profile) return;
    const storageProfileId = await getStorageProfileId();
    if (!storageProfileId) return;
    const next = !settingsExpanded;
    setSettingsExpanded(next);
    await setTimeClockUiState(storageProfileId, {
      settingsExpanded: next,
      updatedAt: new Date().toISOString(),
    });
  }

  async function handleQuickStamp() {
    if (!profile) return;
    const storageProfileId = await getStorageProfileId();
    if (!storageProfileId) return;
    if (selectedDateIsX) {
      const title = xCompensationTitle(selectedDateXCompensation);
      const code = xCompensationCode(selectedDateXCompensation);
      Alert.alert(title, `Für ${selectedShiftDateISO} ist ${code} (${title}) gesetzt. Keine Stempelung erforderlich.`);
      return;
    }
    if (selectedShiftState.phase === 'completed') {
      Alert.alert(
        'Schicht bereits abgeschlossen',
        'Für diese Schicht wurden Kommen und Gehen bereits erfasst. Korrekturen bitte über "Bearbeiten".'
      );
      return;
    }
    if (selectedShiftState.phase === 'anomaly') {
      Alert.alert(
        'Stempelstatus unklar',
        'Für diese Schicht liegen ungewöhnliche Stempelungen vor. Bitte zuerst über "Bearbeiten" korrigieren.'
      );
      return;
    }
    if (!selectedShiftState.allowedEventType) {
      Alert.alert('Nicht möglich', 'Der aktuelle Stempelstatus erlaubt keine neue Erfassung.');
      return;
    }
    if (selectedEventType !== selectedShiftState.allowedEventType) {
      Alert.alert(
        'Falsche Aktion',
        `Als nächstes ist "${selectedShiftState.allowedEventType === 'check_in' ? 'Kommen' : 'Gehen'}" erlaubt.`
      );
      return;
    }

    setStamping(true);
    const now = new Date();
    const nowISO = now.toISOString();
    await addTimeClockEvent(storageProfileId, {
      dateISO: selectedShiftDateISO,
      weekdayLabel: weekdayLabel(selectedShiftDateISO),
      shiftCode: selectedShiftCode,
      eventType: selectedEventType,
      timestampISO: nowISO,
      source: 'manual_service',
    });
    const refreshed = await getTimeClockEvents(storageProfileId);
    setEvents(refreshed);
    setStamping(false);
    Alert.alert('Erfasst', `${selectedEventType === 'check_in' ? 'Kommen' : 'Gehen'} um ${timePart(nowISO)} gespeichert.`);
  }

  async function handleTriggerPopupTest() {
    if (!profile) return;
    const storageProfileId = await getStorageProfileId();
    if (!storageProfileId) return;
    await setTimeClockTestPrompt(storageProfileId, {
      shiftDateISO: selectedShiftDateISO,
      shiftCode: selectedShiftCode,
      eventType: selectedEventType,
      createdAt: new Date().toISOString(),
    });
    Alert.alert(
      'Test vorbereitet',
      'Das Stempeluhr-Popup ist jetzt für den Startbildschirm vorbereitet.',
      [{ text: 'Zum Start', onPress: () => router.replace('/') }]
    );
  }

  function openEditModal(eventId: string) {
    const event = events.find((e) => e.id === eventId);
    if (!event) return;
    setEditingEventId(event.id);
    setEditDateISO(event.dateISO);
    setEditTimeInput(timePart(event.timestampISO));
    setEditShiftCode(event.shiftCode);
    setEditEventType(event.eventType);
  }

  async function handleSaveEditedEvent() {
    if (!profile || !editingEventId) return;
    const storageProfileId = await getStorageProfileId();
    if (!storageProfileId) return;
    const trimmedDate = editDateISO.trim();
    if (!isValidDateISO(trimmedDate)) {
      Alert.alert('Ungültiges Datum', 'Bitte Datum im Format YYYY-MM-DD eingeben.');
      return;
    }
    const normalizedTime = normalizeToHHMM(editTimeInput, '00:00');
    const result = await updateTimeClockEvent(storageProfileId, editingEventId, {
      dateISO: trimmedDate,
      weekdayLabel: weekdayLabel(trimmedDate),
      shiftCode: editShiftCode,
      eventType: editEventType,
      timestampISO: toTimestampISO(trimmedDate, normalizedTime),
      source: 'manual_edit',
    });
    if (!result.ok) {
      Alert.alert('Fehler', result.reason);
      return;
    }
    const refreshed = await getTimeClockEvents(storageProfileId);
    setEvents(refreshed);
    setEditingEventId(null);
    Alert.alert('Gespeichert', 'Stempelzeit wurde aktualisiert.');
  }

  async function handleDeleteEditedEvent() {
    if (!profile || !editingEventId) return;
    const storageProfileId = await getStorageProfileId();
    if (!storageProfileId) return;
    const result = await deleteTimeClockEvent(storageProfileId, editingEventId);
    if (!result.ok) {
      Alert.alert('Fehler', result.reason);
      return;
    }
    const refreshed = await getTimeClockEvents(storageProfileId);
    setEvents(refreshed);
    setEditingEventId(null);
    Alert.alert('Gelöscht', 'Stempelzeit wurde gelöscht.');
  }

  async function handleSetQaOverride(type: 'holiday' | 'preholiday') {
    if (!profile) return;
    const storageProfileId = await getStorageProfileId();
    if (!storageProfileId) return;
    const dateISO = qaDateInput.trim();
    if (!isValidDateISO(dateISO)) {
      Alert.alert('Ungültiges Datum', 'Bitte Datum im Format YYYY-MM-DD eingeben.');
      return;
    }
    await setTimeClockQaDateOverride(storageProfileId, dateISO, type);
    const next = await getTimeClockQaCalendar(storageProfileId);
    setQaOverrides(next);
    Alert.alert('QA-Override gesetzt', `${dateISO} wurde als ${type === 'holiday' ? 'Feiertag' : 'Vorfest'} markiert.`);
  }

  async function handleClearQaOverride(dateISO: string) {
    if (!profile) return;
    const storageProfileId = await getStorageProfileId();
    if (!storageProfileId) return;
    await clearTimeClockQaDateOverride(storageProfileId, dateISO);
    const next = await getTimeClockQaCalendar(storageProfileId);
    setQaOverrides(next);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={warmHuman.primary} />
      </View>
    );
  }

  if (!profile || !config) {
    return (
      <View style={styles.center}>
        <Text style={styles.guardIcon}>🔒</Text>
        <Text style={styles.guardTitle}>Profil benötigt</Text>
        <Text style={styles.guardDesc}>Bitte erstelle zuerst ein ID-Profil.</Text>
        <TouchableOpacity style={styles.ctaBtn} onPress={() => router.replace('/(auth)/create-profile')}>
          <Text style={styles.ctaBtnText}>ID-Profil erstellen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text testID="timeclock-title" style={styles.title}>⏱️ Stempeluhr</Text>
      <Text style={styles.subtitle}>
        Eigener Service-Bereich für Zeiterfassung. Ereignisse enthalten Datum, Wochentag, Uhrzeit und Schichtkürzel.
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Schneller Stempel</Text>
        <View style={styles.chipRow}>
          {(['check_in', 'check_out'] as TimeClockEventType[]).map((type) => (
            <TouchableOpacity
              key={type}
              testID={`timeclock-eventtype-${type}`}
              style={[styles.chip, selectedEventType === type && styles.chipActive]}
              onPress={() => setSelectedEventType(type)}
            >
              <Text style={[styles.chipText, selectedEventType === type && styles.chipTextActive]}>
                {type === 'check_in' ? 'Kommen' : 'Gehen'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.chipRow}>
          {REGULAR_SHIFT_CODES.map((code) => (
            <TouchableOpacity
              key={code}
              testID={`timeclock-shift-${code}`}
              style={[styles.chip, selectedShiftCode === code && styles.chipActive]}
              onPress={() => setSelectedShiftCode(code)}
            >
              <Text style={[styles.chipText, selectedShiftCode === code && styles.chipTextActive]}>{code}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          testID="timeclock-stamp-now"
          style={[styles.stampBtn, selectedDateIsX ? styles.stampBtnDisabled : null]}
          onPress={handleQuickStamp}
          disabled={stamping || selectedDateIsX}
        >
          <Text style={styles.stampBtnText}>{stamping ? 'Speichert...' : 'Jetzt stempeln'}</Text>
        </TouchableOpacity>
        <Text style={styles.helperText}>
          Status Diensttag {selectedShiftDateISO} ({selectedShiftCode}):{' '}
          {selectedDateIsX
            ? `${xCompensationTitle(selectedDateXCompensation)} (${xCompensationCode(selectedDateXCompensation)}) - keine Stempel erforderlich`
            : selectedShiftState.phase === 'awaiting_check_in'
            ? 'Bereit für Kommen'
            : selectedShiftState.phase === 'awaiting_check_out'
              ? `Offener Dienst seit ${selectedShiftState.openCheckInTimestampISO ? timePart(selectedShiftState.openCheckInTimestampISO) : '--:--'}`
              : selectedShiftState.phase === 'completed'
                ? 'Schicht abgeschlossen'
                : 'Bitte Stempel manuell korrigieren'}
        </Text>
        {!selectedDateIsX && selectedShiftState.allowedEventType !== null && selectedEventType !== selectedShiftState.allowedEventType ? (
          <Text style={styles.inlineWarningText}>
            Hinweis: Als nächstes ist "{selectedShiftState.allowedEventType === 'check_in' ? 'Kommen' : 'Gehen'}" erlaubt.
          </Text>
        ) : null}
        <TouchableOpacity
          testID="timeclock-test-popup-now"
          style={[styles.testPopupBtn, selectedDateIsX ? styles.testPopupBtnDisabled : null]}
          onPress={handleTriggerPopupTest}
          disabled={selectedDateIsX}
        >
          <Text style={styles.testPopupBtnText}>Popup jetzt testen</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <TouchableOpacity style={styles.collapseHeader} onPress={handleToggleSettingsExpanded} activeOpacity={0.8}>
          <Text style={styles.cardTitle}>Dienstzeiten & Gleitzeit</Text>
          <Text style={styles.collapseIndicator}>{settingsExpanded ? '▾' : '▸'}</Text>
        </TouchableOpacity>
        {settingsExpanded ? (
          <>
            {REGULAR_SHIFT_CODES.map((code) => {
              const row = config.shiftSettings[code];
              return (
                <View key={code} style={styles.settingBlock}>
                  <Text style={styles.settingTitle}>
                    {code} - {shiftLabelForStamp(code)}
                  </Text>
                  <View style={styles.row}>
                    <Text style={styles.label}>Start</Text>
                    <TextInput
                      style={[styles.input, styles.timeInput]}
                      value={row.startTime}
                      onChangeText={(v) => updateShiftSetting(code, 'startTime', v)}
                      onBlur={() => finalizeShiftTime(code, 'startTime')}
                      keyboardType="number-pad"
                      placeholder="0600 oder 06:00"
                    />
                    <Text style={styles.label}>Ende</Text>
                    <TextInput
                      style={[styles.input, styles.timeInput]}
                      value={row.endTime}
                      onChangeText={(v) => updateShiftSetting(code, 'endTime', v)}
                      onBlur={() => finalizeShiftTime(code, 'endTime')}
                      keyboardType="number-pad"
                      placeholder="1400 oder 14:00"
                    />
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Gleitzeit (min)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={String(row.paidFlexMinutes)}
                      onChangeText={(v) => updateShiftSetting(code, 'paidFlexMinutes', v)}
                    />
                    <Text style={styles.label}>Kulanz (min)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={String(row.postShiftGraceMinutes)}
                      onChangeText={(v) => updateShiftSetting(code, 'postShiftGraceMinutes', v)}
                    />
                  </View>
                </View>
              );
            })}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveConfig} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Speichert...' : 'Einstellungen speichern'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.helperText}>Ausgeblendet. Tippe auf die Zeile, um die Einstellungen zu öffnen.</Text>
        )}
      </View>

      <View style={styles.card}>
        <TouchableOpacity testID="timeclock-qa-toggle" style={styles.collapseHeader} onPress={() => setQaExpanded((prev) => !prev)} activeOpacity={0.8}>
          <Text style={styles.cardTitle}>QA-Test: Feiertag/Vorfest Override</Text>
          <Text style={styles.collapseIndicator}>{qaExpanded ? '▾' : '▸'}</Text>
        </TouchableOpacity>
        {qaExpanded ? (
          <>
            <Text style={styles.helperText}>
              Nur für Tests. Produktivdaten bleiben unverändert, solange kein Override gesetzt ist.
            </Text>
            <TextInput
              testID="timeclock-qa-date-input"
              style={styles.modalInput}
              value={qaDateInput}
              onChangeText={setQaDateInput}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
            />
            <View style={styles.chipRow}>
              <TouchableOpacity testID="timeclock-qa-set-holiday" style={styles.chip} onPress={() => handleSetQaOverride('holiday')}>
                <Text style={styles.chipText}>Als Feiertag markieren</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="timeclock-qa-set-preholiday" style={styles.chip} onPress={() => handleSetQaOverride('preholiday')}>
                <Text style={styles.chipText}>Als Vorfest markieren</Text>
              </TouchableOpacity>
            </View>
            {Object.keys(qaOverrides).length === 0 ? (
              <Text style={styles.emptyText}>Keine aktiven Overrides.</Text>
            ) : (
              Object.entries(qaOverrides)
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([dateISO, type]) => (
                  <View key={`qa-${dateISO}`} style={styles.summaryRow}>
                    <View style={styles.eventMain}>
                      <Text style={styles.eventType}>{dateISO}</Text>
                      <Text style={styles.eventMeta}>{type === 'holiday' ? 'Feiertag (QA)' : 'Vorfest (QA)'}</Text>
                    </View>
                    <TouchableOpacity style={styles.editBtn} onPress={() => handleClearQaOverride(dateISO)}>
                      <Text style={styles.editBtnText}>Entfernen</Text>
                    </TouchableOpacity>
                  </View>
                ))
            )}
          </>
        ) : (
          <Text style={styles.helperText}>Ausgeblendet. Aufklappen zum Setzen von Test-Overrides.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Schichten & Tagesbilanz</Text>
        <Text style={styles.helperText}>
          Kommen und Gehen werden als ein Schichtfall zusammengeführt. Tageswerte basieren auf vorhandenen Paaren.
        </Text>

        {shiftListRows.length === 0 ? (
          <Text style={styles.emptyText}>Noch keine Schichtfälle vorhanden.</Text>
        ) : (
          <>
          {shiftListRows.map((row) => row.kind === 'case' ? (
            (() => {
              const entry = row.entry;
              const booking = xCompensations[entry.dateISO];
              return (
            <View key={entry.key} style={[styles.eventRow, dateMarkers(entry.dateISO, holidayLookup).length > 0 ? styles.highlightRow : null]}>
              <View style={styles.eventMain}>
                <Text style={styles.eventType}>
                  {entry.dateISO} · {entry.weekday} · {entry.shiftCode}
                </Text>
                {dateMarkers(entry.dateISO, holidayLookup).length > 0 && (
                  <View style={styles.markerRow}>
                    {dateMarkers(entry.dateISO, holidayLookup).map((marker) => (
                      <View
                        key={`shift-marker-${entry.key}-${marker.kind}-${marker.label}`}
                        style={[styles.markerChip, marker.kind === 'holiday' ? styles.holidayMarkerChip : styles.preholidayMarkerChip]}
                      >
                        <Text style={styles.markerChipText}>{marker.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={styles.eventMeta}>
                  {xOverrideDates.has(entry.dateISO)
                    ? xCompensationMeta(booking)
                    : `Kommen: ${entry.checkIn ? timePart(entry.checkIn) : 'offen'} · Gehen: ${entry.checkOut ? timePart(entry.checkOut) : 'offen'}`}
                </Text>
                <Text style={styles.eventMeta}>Abschnitte: {entry.segmentCount}</Text>
                <Text style={styles.eventMeta}>
                  {xOverrideDates.has(entry.dateISO) ? `Soll: 0,00 h (${xCompensationTitle(booking)})` : `Soll: ${formatHoursDecimal(entry.plannedHours)}`}
                </Text>
              </View>
              <View style={styles.eventActions}>
                {xOverrideDates.has(entry.dateISO) ? (
                  <Text style={styles.emptyText}>{xCompensationTitle(booking)}</Text>
                ) : entry.workedHours !== null ? (
                  <>
                    <Text style={styles.summaryMainValue}>{formatHoursDecimal(entry.workedHours)}</Text>
                    <Text
                      style={[
                        styles.summaryDeltaValue,
                        (entry.deltaHours ?? 0) > 0
                          ? styles.deltaPositive
                          : (entry.deltaHours ?? 0) < 0
                            ? styles.deltaNegative
                            : null,
                      ]}
                    >
                      Delta {formatSignedHoursDecimal(entry.deltaHours ?? 0)}
                    </Text>
                    {(entry.flexCreditHours ?? 0) > 0 && (
                      <Text style={styles.eventMeta}>
                        Flex-Credit {formatHoursDecimal(entry.flexCreditHours ?? 0)}
                      </Text>
                    )}
                    {(entry.hasOpenCheckIn || entry.orphanCheckOutCount > 0) && (
                      <Text style={styles.warningText}>Teilweise</Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.emptyText}>Unvollständig</Text>
                )}
              </View>
            </View>
          );
            })()
          ) : (
            (() => {
              const dateISO = row.dateISO;
              const booking = xCompensations[dateISO];
              return (
            <View key={`x-only-${dateISO}`} style={[styles.eventRow, dateMarkers(dateISO, holidayLookup).length > 0 ? styles.highlightRow : null]}>
              <View style={styles.eventMain}>
                <Text style={styles.eventType}>
                  {dateISO} · {weekdayLabel(dateISO)} · {xCompensationCode(booking)}
                </Text>
                {dateMarkers(dateISO, holidayLookup).length > 0 && (
                  <View style={styles.markerRow}>
                    {dateMarkers(dateISO, holidayLookup).map((marker) => (
                      <View
                        key={`shift-marker-x-only-${dateISO}-${marker.kind}-${marker.label}`}
                        style={[styles.markerChip, marker.kind === 'holiday' ? styles.holidayMarkerChip : styles.preholidayMarkerChip]}
                      >
                        <Text style={styles.markerChipText}>{marker.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={styles.eventMeta}>{xCompensationMeta(booking)}</Text>
                <Text style={styles.eventMeta}>Abschnitte: 0</Text>
                <Text style={styles.eventMeta}>Soll: 0,00 h ({xCompensationTitle(booking)})</Text>
              </View>
              <View style={styles.eventActions}>
                <Text style={styles.emptyText}>{xCompensationTitle(booking)}</Text>
              </View>
            </View>
          );
            })()
          ))}
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Monatskonto ({monthSummary.monthLabel})</Text>
        <View style={styles.summaryRow}>
          <View style={styles.eventMain}>
            <Text style={styles.eventMeta}>Soll bisher</Text>
            <Text style={styles.summaryMainValue}>{formatHoursDecimal(monthSummary.plannedHoursToDate)}</Text>
          </View>
          <View style={styles.eventActions}>
            <Text style={styles.eventMeta}>Ist bisher</Text>
            <Text style={styles.summaryMainValue}>{formatHoursDecimal(monthSummary.workedHoursToDate)}</Text>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.eventMain}>
            <Text style={styles.eventMeta}>Delta bisher (Ist - Soll, ohne Gleitzeit)</Text>
            <Text
              style={[
                styles.summaryMainValue,
                monthSummary.deltaHoursToDate > 0
                  ? styles.deltaPositive
                  : monthSummary.deltaHoursToDate < 0
                    ? styles.deltaNegative
                    : null,
              ]}
            >
              {formatSignedHoursDecimal(monthSummary.deltaHoursToDate)}
            </Text>
          </View>
          <View style={styles.eventActions}>
            <Text style={styles.eventMeta}>Monatssoll</Text>
            <Text style={styles.summaryMainValue}>
              {formatHoursDecimal(monthSummary.plannedHoursMonth)}
            </Text>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.eventMain}>
            <Text style={styles.eventMeta}>Tarifgutschrift bisher</Text>
            <Text testID="timeclock-month-credited-total" style={styles.summaryMainValue}>
              {formatHoursDecimal(monthSummary.creditedHoursToDate)}
            </Text>
          </View>
          <View style={styles.eventActions}>
            <Text style={styles.eventMeta}>Feiertag / Vorfest</Text>
            <Text testID="timeclock-month-credited-split" style={styles.summaryDeltaValue}>
              {formatHoursDecimal(monthSummary.creditedHolidayHoursToDate)} /{' '}
              {formatHoursDecimal(monthSummary.creditedPreHolidayHoursToDate)}
            </Text>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.eventMain}>
            <Text style={styles.eventMeta}>Gleitzeit-Credit (separat, nicht im Delta)</Text>
            <Text style={styles.summaryMainValue}>{formatHoursDecimal(monthSummary.creditedFlexHoursToDate)}</Text>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.eventMain}>
            <Text style={styles.eventMeta}>Gesamtdelta inkl. Tarif (ohne Gleitzeit)</Text>
            <Text
              style={[
                styles.summaryMainValue,
                monthSummary.totalDeltaWithCreditsToDate > 0
                  ? styles.deltaPositive
                  : monthSummary.totalDeltaWithCreditsToDate < 0
                    ? styles.deltaNegative
                    : null,
              ]}
            >
              {formatSignedHoursDecimal(monthSummary.totalDeltaWithCreditsToDate)}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.explanationHeader}
          onPress={() => setMonthExplanationExpanded((prev) => !prev)}
          activeOpacity={0.8}
        >
          <Text style={styles.eventMeta}>Erklärung anzeigen</Text>
          <Text style={styles.collapseIndicator}>{monthExplanationExpanded ? '▾' : '▸'}</Text>
        </TouchableOpacity>
        <Text style={styles.helperText}>
          Hinweis: Bei Nachtdienst vor Feiertag werden Minuten vor 00:00 als Vorfest und ab 00:00 als Feiertag gewertet.
        </Text>
        <Text style={styles.helperText}>
          Regel: Gleitzeit wird separat geführt und nicht in Delta/Saldo eingemischt.
        </Text>
        {monthExplanationExpanded ? (
          <View style={styles.explanationBox}>
            {monthSummary.explanation.map((line, idx) => (
              <Text key={`m-exp-${idx}`} style={styles.explanationText}>
                {idx + 1}. {line}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Letzte Stempelzeiten</Text>
        {displayRows.length === 0 ? (
          <Text style={styles.emptyText}>Noch keine Stempelzeiten vorhanden.</Text>
        ) : (
          displayRows.map((row) => {
            if (row.kind === 'x') {
              const dateISO = row.dateISO;
              const booking = xCompensations[dateISO];
              return (
                <View key={`event-x-only-${dateISO}`} style={[styles.eventRow, dateMarkers(dateISO, holidayLookup).length > 0 ? styles.highlightRow : null]}>
                  <View style={styles.eventMain}>
                    <View style={styles.eventTypeRow}>
                      <Text style={styles.eventType}>{xCompensationTitle(booking)}</Text>
                    </View>
                    <Text style={styles.eventMeta}>
                      {dateISO} · {weekdayLabel(dateISO)} · {xCompensationCode(booking)}
                    </Text>
                    <Text style={styles.eventMeta}>Hinweis: Tag ist als {xCompensationCode(booking)} ({xCompensationTitle(booking)}) gesetzt.</Text>
                    {dateMarkers(dateISO, holidayLookup).length > 0 && (
                      <View style={styles.markerRow}>
                        {dateMarkers(dateISO, holidayLookup).map((marker) => (
                          <View
                            key={`event-marker-x-only-${dateISO}-${marker.kind}-${marker.label}`}
                            style={[styles.markerChip, marker.kind === 'holiday' ? styles.holidayMarkerChip : styles.preholidayMarkerChip]}
                          >
                            <Text style={styles.markerChipText}>{marker.label}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  <View style={styles.eventActions}>
                    <Text style={styles.eventTime}>—</Text>
                  </View>
                </View>
              );
            }
            const e = row.event;
            const isXDate = xOverrideDates.has(e.dateISO);
            const booking = xCompensations[e.dateISO];
            return (
            <View key={e.id} style={[styles.eventRow, dateMarkers(dateISOFromTimestampLocal(e.timestampISO), holidayLookup).length > 0 ? styles.highlightRow : null]}>
              <View style={styles.eventMain}>
                <View style={styles.eventTypeRow}>
                  <Text style={styles.eventType}>{isXDate ? xCompensationTitle(booking) : (e.eventType === 'check_in' ? 'Kommen' : 'Gehen')}</Text>
                  {e.source === 'auto_placeholder' && !isXDate && (
                    <Text style={styles.autoPlaceholderBadge}>(Platzhalter)</Text>
                  )}
                  {e.source === 'auto_placeholder' && isXDate && (
                    <Text style={styles.autoPlaceholderIgnoredBadge}>({xCompensationTitle(booking)} · ignoriert)</Text>
                  )}
                </View>
                <Text style={styles.eventMeta}>
                  {e.dateISO} · {e.weekdayLabel} · {e.shiftCode}
                </Text>
                {isXDate && (
                  <Text style={styles.eventMeta}>Hinweis: Tag ist als {xCompensationCode(booking)} ({xCompensationTitle(booking)}) gesetzt.</Text>
                )}
                {dateMarkers(dateISOFromTimestampLocal(e.timestampISO), holidayLookup).length > 0 && (
                  <View style={styles.markerRow}>
                    {dateMarkers(dateISOFromTimestampLocal(e.timestampISO), holidayLookup).map((marker) => (
                      <View
                        key={`event-marker-${e.id}-${marker.kind}-${marker.label}`}
                        style={[styles.markerChip, marker.kind === 'holiday' ? styles.holidayMarkerChip : styles.preholidayMarkerChip]}
                      >
                        <Text style={styles.markerChipText}>{marker.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View style={styles.eventActions}>
                <Text style={styles.eventTime}>
                  {isXDate ? '—' : timePart(e.timestampISO)}
                </Text>
                <TouchableOpacity testID={`timeclock-event-edit-${e.id}`} style={styles.editBtn} onPress={() => openEditModal(e.id)}>
                  <Text style={styles.editBtnText}>Bearbeiten</Text>
                </TouchableOpacity>
              </View>
            </View>
          )})
        )}
        {events.length > displayRows.length && (
          <Text style={styles.eventsHintText}>Ältere Einträge werden nicht angezeigt.</Text>
        )}
      </View>

      <Modal visible={!!editingEventId} transparent animationType="fade" onRequestClose={() => setEditingEventId(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Stempelzeit bearbeiten</Text>
            <Text style={styles.modalLabel}>Datum (YYYY-MM-DD)</Text>
            <TextInput
              testID="timeclock-edit-date-input"
              style={styles.modalInput}
              value={editDateISO}
              onChangeText={setEditDateISO}
              placeholder="2026-03-23"
              autoCapitalize="none"
            />
            <Text style={styles.modalLabel}>Uhrzeit (z. B. 0600)</Text>
            <TextInput
              testID="timeclock-edit-time-input"
              style={styles.modalInput}
              value={editTimeInput}
              onChangeText={(v) => setEditTimeInput(normalizeTimeDraft(v))}
              onBlur={() => setEditTimeInput(normalizeToHHMM(editTimeInput, '00:00'))}
              placeholder="06:00"
              keyboardType="number-pad"
            />
            <Text style={styles.modalLabel}>Typ</Text>
            <View style={styles.chipRow}>
              {(['check_in', 'check_out'] as TimeClockEventType[]).map((type) => (
                <TouchableOpacity
                  key={`modal-${type}`}
                  testID={`timeclock-edit-eventtype-${type}`}
                  style={[styles.chip, editEventType === type && styles.chipActive]}
                  onPress={() => setEditEventType(type)}
                >
                  <Text style={[styles.chipText, editEventType === type && styles.chipTextActive]}>
                    {type === 'check_in' ? 'Kommen' : 'Gehen'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Schicht</Text>
            <View style={styles.chipRow}>
              {REGULAR_SHIFT_CODES.map((code) => (
                <TouchableOpacity
                  key={`modal-shift-${code}`}
                  testID={`timeclock-edit-shift-${code}`}
                  style={[styles.chip, editShiftCode === code && styles.chipActive]}
                  onPress={() => setEditShiftCode(code)}
                >
                  <Text style={[styles.chipText, editShiftCode === code && styles.chipTextActive]}>{code}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity testID="timeclock-edit-save" style={styles.modalPrimaryBtn} onPress={handleSaveEditedEvent}>
              <Text style={styles.modalPrimaryBtnText}>Änderungen speichern</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="timeclock-edit-delete" style={styles.modalDangerBtn} onPress={handleDeleteEditedEvent}>
              <Text style={styles.modalDangerBtnText}>Stempelzeit löschen</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="timeclock-edit-cancel" style={styles.modalSecondaryBtn} onPress={() => setEditingEventId(null)}>
              <Text style={styles.modalSecondaryBtnText}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: warmHuman.surface,
  },
  container: {
    flexGrow: 1,
    backgroundColor: warmHuman.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    color: warmHuman.ink,
    fontWeight: typography.fontWeight.bold,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    padding: spacing.md,
    ...shadows.sm,
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: warmHuman.ink,
  },
  collapseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  collapseIndicator: {
    fontSize: typography.fontSize.base,
    color: warmHuman.textSecondary,
    fontWeight: typography.fontWeight.bold,
  },
  helperText: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textMuted,
    lineHeight: 18,
  },
  inlineWarningText: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.ink,
    backgroundColor: semantic.surface.warning,
    borderWidth: 1,
    borderColor: warmHuman.accent,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: warmHuman.surface,
  },
  chipActive: {
    backgroundColor: warmHuman.primary,
    borderColor: warmHuman.primary,
  },
  chipText: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.ink,
    fontWeight: typography.fontWeight.medium,
  },
  chipTextActive: {
    color: warmHuman.textInverse,
  },
  stampBtn: {
    marginTop: spacing.xs,
    backgroundColor: warmHuman.primary,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    paddingVertical: 12,
  },
  stampBtnDisabled: {
    opacity: 0.45,
  },
  stampBtnText: {
    color: warmHuman.textInverse,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.base,
  },
  saveBtn: {
    marginTop: spacing.sm,
    backgroundColor: warmHuman.accent,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    paddingVertical: 12,
  },
  testPopupBtn: {
    backgroundColor: warmHuman.surface,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    paddingVertical: 10,
  },
  testPopupBtnDisabled: {
    opacity: 0.45,
  },
  testPopupBtnText: {
    color: warmHuman.textSecondary,
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.sm,
  },
  saveBtnText: {
    color: warmHuman.ink,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.base,
  },
  settingBlock: {
    borderTopWidth: 1,
    borderTopColor: warmHuman.borderLight,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  settingTitle: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.ink,
    fontWeight: typography.fontWeight.semibold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  label: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textSecondary,
    minWidth: 80,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    borderRadius: borderRadius.md,
    backgroundColor: warmHuman.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: warmHuman.ink,
  },
  timeInput: {
    minWidth: 120,
    minHeight: 44,
    fontSize: typography.fontSize.base,
  },
  eventRow: {
    borderTopWidth: 1,
    borderTopColor: warmHuman.borderLight,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventMain: {
    flex: 1,
  },
  eventType: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.ink,
    fontWeight: typography.fontWeight.semibold,
  },
  eventMeta: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textSecondary,
    marginTop: 2,
  },
  eventTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  autoPlaceholderBadge: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textMuted,
    fontStyle: 'italic' as const,
  },
  autoPlaceholderIgnoredBadge: {
    fontSize: typography.fontSize.xs,
    color: semantic.text.warning,
    fontStyle: 'italic' as const,
    fontWeight: typography.fontWeight.semibold,
  },
  eventTime: {
    fontSize: typography.fontSize.base,
    color: warmHuman.primary,
    fontWeight: typography.fontWeight.bold,
  },
  summaryRow: {
    borderTopWidth: 1,
    borderTopColor: warmHuman.borderLight,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  explanationHeader: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: warmHuman.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  explanationBox: {
    backgroundColor: warmHuman.surface,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    gap: 4,
  },
  explanationText: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textSecondary,
    lineHeight: 18,
  },
  summaryMainValue: {
    fontSize: typography.fontSize.base,
    color: warmHuman.ink,
    fontWeight: typography.fontWeight.bold,
  },
  summaryDeltaValue: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: warmHuman.textSecondary,
  },
  deltaPositive: {
    color: '#166534',
  },
  deltaNegative: {
    color: '#B91C1C',
  },
  warningText: {
    fontSize: typography.fontSize.xs,
    color: '#B45309',
    fontWeight: typography.fontWeight.semibold,
  },
  highlightRow: {
    backgroundColor: warmHuman.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },
  markerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  markerChip: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  holidayMarkerChip: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  preholidayMarkerChip: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  markerChipText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: warmHuman.ink,
  },
  eventActions: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  editBtn: {
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    borderRadius: borderRadius.md,
    backgroundColor: warmHuman.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editBtnText: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textSecondary,
    fontWeight: typography.fontWeight.semibold,
  },
  emptyText: {
    color: warmHuman.textMuted,
    fontSize: typography.fontSize.sm,
  },
  eventsHintText: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textMuted,
    textAlign: 'center',
    paddingTop: spacing.sm,
  },
  guardIcon: {
    fontSize: 44,
    marginBottom: spacing.sm,
  },
  guardTitle: {
    fontSize: typography.fontSize.xl,
    color: warmHuman.ink,
    fontWeight: typography.fontWeight.bold,
  },
  guardDesc: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    marginVertical: spacing.sm,
    textAlign: 'center',
  },
  ctaBtn: {
    backgroundColor: warmHuman.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  ctaBtnText: {
    color: warmHuman.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    padding: spacing.md,
    gap: spacing.xs,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    color: warmHuman.ink,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  modalLabel: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textSecondary,
    marginTop: spacing.xs,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    borderRadius: borderRadius.md,
    backgroundColor: warmHuman.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    color: warmHuman.ink,
  },
  modalPrimaryBtn: {
    marginTop: spacing.sm,
    backgroundColor: warmHuman.primary,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    paddingVertical: 11,
  },
  modalPrimaryBtnText: {
    color: warmHuman.textInverse,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  modalDangerBtn: {
    backgroundColor: warmHuman.accentLight,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    paddingVertical: 10,
  },
  modalDangerBtnText: {
    color: warmHuman.ink,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  modalSecondaryBtn: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: warmHuman.surface,
  },
  modalSecondaryBtnText: {
    color: warmHuman.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});

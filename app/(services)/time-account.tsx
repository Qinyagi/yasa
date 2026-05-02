/**
 * YASA Services: Urlaubs- und Freizeitkonto
 * User pflegt eigene Zeitkonto-Einstellungen und sieht das Space-Regelprofil (read-only).
 * Kein Rechtsanspruch – Prognose-Regelwerk.
 */
import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Switch, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  getProfile, getSpaces, getCurrentSpaceId,
  getSpaceRuleProfile, persistSyncedRuleProfile,
  getUserTimeAccountProfileForSpace,
  getVacationDaysForSpace,
  getTimeClockQaCalendar,
  getShiftPlanForSpace, getTimeClockConfigOrDefault, getTimeClockEvents,
  getUserTimeBudgetProfile, setUserTimeBudgetProfile,
  setUserTimeAccountProfileForSpace,
  buildSpaceProfileKey,
  setSpaces,
  setCurrentSpaceId,
} from '../../lib/storage';
import { syncTeamSpaces } from '../../lib/backend/teamSync';
import { logInfo, logWarn, logError } from '../../lib/log';
import type { UserProfile } from '../../types';
import type { UserShiftPlan, UserTimeClockConfig, TimeClockEvent } from '../../types';
import type { SpaceRuleProfile, UserTimeAccountProfile, WorkModel } from '../../types/timeAccount';
import { WORK_MODEL_LABELS } from '../../types/timeAccount';
import { computeMonthlyWorkProgress } from '../../lib/timeAccountEngine';
import { shiftCodeAtDate } from '../../lib/shiftEngine';
import { computeWDaysForRange } from '../../lib/wDayEngine';
import { BUNDESLAND_LABELS, isBundeslandSupported } from '../../data/schoolHolidays';
import type { Bundesland } from '../../data/schoolHolidays';
import { getHolidayMap } from '../../data/holidays';
import { colors, typography, spacing, borderRadius, accessibility } from '../../constants/theme';
import { Button } from '../../components/Button';

// ─── Component ────────────────────────────────────────────────────────────────

export default function TimeAccountScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(services)');
  }, [navigation, router]);

  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [syncOffline,   setSyncOffline]   = useState(false);
  const [ruleSyncDebug, setRuleSyncDebug] = useState<string>('');
  const [profile,       setProfile]       = useState<UserProfile | null>(null);
  const [spaceProfile,  setSpaceProfile]  = useState<SpaceRuleProfile | null>(null);
  const [monthExplanationExpanded, setMonthExplanationExpanded] = useState(false);
  const [shiftPlan,     setShiftPlan]     = useState<UserShiftPlan | null>(null);
  const [timeConfig,    setTimeConfig]    = useState<UserTimeClockConfig | null>(null);
  const [timeEvents,    setTimeEvents]    = useState<TimeClockEvent[]>([]);
  const [qaOverrides,   setQaOverrides]   = useState<Record<string, 'holiday' | 'preholiday'>>({});

  // User-Formular
  const [weeklyHours,        setWeeklyHours]        = useState('38.5');
  const [workModel,          setWorkModel]          = useState<WorkModel>('standard');
  const [openingBalance,     setOpeningBalance]     = useState('0');
  const [vacationDaysBal,    setVacationDaysBal]    = useState('0');
  const [annualVacationEntitlement, setAnnualVacationEntitlement] = useState('0');
  const [wDaysBal,           setWDaysBal]           = useState('0');
  const [glzHoursBal,        setGlzHoursBal]        = useState('0');
  const [fzgaHoursBal,       setFzgaHoursBal]       = useState('0');
  const [vzgaHoursBal,       setVzgaHoursBal]       = useState('0');
  const [schoolOverride,     setSchoolOverride]     = useState<boolean | null>(null);
  const [vacationDaysTakenYear, setVacationDaysTakenYear] = useState(0);
  // null = Space-Default

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      Promise.all([getProfile(), getCurrentSpaceId()]).then(async ([p, spaceId]) => {
        if (!active) return;
        setProfile(p);

        // On member devices the space metadata can lag behind.
        // Pull latest spaces on focus so rule profile visibility is up-to-date.
        let syncFailed = false;
        let spacesAfterSync = await getSpaces();
        if (p) {
          try {
            const localSpaces = await getSpaces();
            logInfo('RULESYNC', 'syncTeamSpaces start', { profileId: p.id, activeSpaceId: spaceId });
            const syncResult = await syncTeamSpaces(p.id, localSpaces, { allowCached: true });
            if (active) {
              await setSpaces(syncResult.spaces);
              spacesAfterSync = syncResult.spaces;
              logInfo('RULESYNC', 'syncTeamSpaces OK', {
                pulled: syncResult.pulledCount,
                pushed: syncResult.pushedCount,
              });
            }
          } catch (err) {
            syncFailed = true;
            logError('RULESYNC', 'syncTeamSpaces failed – using local state', err);
          }
        }
        if (active) setSyncOffline(syncFailed);

        let resolvedSpaceId: string | null = spaceId;
        const memberSpaces =
          p != null
            ? spacesAfterSync.filter((s) => s.memberProfiles.some((m) => m.id === p.id))
            : [];

        if (resolvedSpaceId) {
          const validActive = memberSpaces.some((s) => s.id === resolvedSpaceId);
          if (!validActive) resolvedSpaceId = null;
        }

        // Auto-heal for users with exactly one member space
        if (!resolvedSpaceId && memberSpaces.length === 1) {
          resolvedSpaceId = memberSpaces[0].id;
          await setCurrentSpaceId(resolvedSpaceId);
          logInfo('RULESYNC', 'auto-healed currentSpaceId (single member space)', {
            resolvedSpaceId,
          });
        }

        let sr: SpaceRuleProfile | null = null;
        if (resolvedSpaceId) {
          sr = await getSpaceRuleProfile(resolvedSpaceId);
        }

        // With multiple Spaces YASA must not silently switch the active Space.
        // The user chooses the active work context explicitly in the Space/Admin flow.

        if (resolvedSpaceId) {
          logInfo('RULESYNC', 'getSpaceRuleProfile result', {
            spaceId: resolvedSpaceId,
            hasProfile: sr != null,
            source: syncFailed ? 'local/fallback' : 'post-sync',
          });
        }
        const debugParts: string[] = [];
        debugParts.push(`active=${resolvedSpaceId ?? 'none'}`);
        debugParts.push(`memberSpaces=${memberSpaces.length}`);
        for (const s of memberSpaces.slice(0, 5)) {
          const has = (await getSpaceRuleProfile(s.id)) ? 'Y' : 'N';
          debugParts.push(`${s.id.slice(0, 8)}:${has}`);
        }
        if (active) setRuleSyncDebug(debugParts.join(' | '));

        // Persist synced rule profile to dedicated storage for offline resilience
        if (sr && !syncFailed) {
          await persistSyncedRuleProfile(sr);
        }
        if (active) setSpaceProfile(sr);

        if (p) {
          const storageProfileId = resolvedSpaceId ? buildSpaceProfileKey(resolvedSpaceId, p.id) : p.id;
          const [plan, cfg, events] = await Promise.all([
            resolvedSpaceId ? getShiftPlanForSpace(resolvedSpaceId, p.id) : Promise.resolve(null),
            getTimeClockConfigOrDefault(storageProfileId),
            getTimeClockEvents(storageProfileId),
          ]);
          const vacationDays = resolvedSpaceId ? await getVacationDaysForSpace(resolvedSpaceId, p.id) : [];
          const qaMap = await getTimeClockQaCalendar(storageProfileId);
          if (active) {
            setShiftPlan(plan);
            setTimeConfig(cfg);
            setTimeEvents(events);
            setQaOverrides(qaMap);
            const currentYear = new Date().getFullYear();
            const used = vacationDays.filter((d) => d.startsWith(`${currentYear}-`)).length;
            setVacationDaysTakenYear(used);
          }

          const ur = resolvedSpaceId ? await getUserTimeAccountProfileForSpace(resolvedSpaceId, p.id) : null;
          const tb = await getUserTimeBudgetProfile(storageProfileId);
          if (active && ur) {
            setWeeklyHours(String(ur.weeklyHours));
            setWorkModel(ur.workModel);
            setOpeningBalance(String(ur.openingBalanceHours));
            setSchoolOverride(ur.schoolHolidaysEnabled ?? null);
          }
          if (active) {
            setAnnualVacationEntitlement(String(tb.annualVacationEntitlementDays));
            setVacationDaysBal(String(tb.vacationDays));
            setWDaysBal(String(tb.wDays));
            setGlzHoursBal(String(tb.glzHours));
            setFzgaHoursBal(String(tb.fzgaHours));
            setVzgaHoursBal(String(tb.vzgaHours));
          }
        }
        if (active) setLoading(false);
      });
      return () => { active = false; };
    }, [])
  );

  async function handleSave() {
    if (!profile) return;
    const activeSpaceId = await getCurrentSpaceId();
    if (!activeSpaceId) {
      Alert.alert('Kein aktiver Space', 'Bitte aktiviere zuerst einen Space.');
      return;
    }
    const hours = parseFloat(weeklyHours);
    if (isNaN(hours) || hours <= 0 || hours > 60) {
      Alert.alert('Fehler', 'Bitte gib eine gültige Wochenarbeitszeit ein (1–60 Stunden).');
      return;
    }
    setSaving(true);
    const up: UserTimeAccountProfile = {
      profileId:              profile.id,
      weeklyHours:            hours,
      workModel,
      openingBalanceHours:    parseFloat(openingBalance) || 0,
      schoolHolidaysEnabled:  schoolOverride,
      updatedAt:              new Date().toISOString(),
    };
    await setUserTimeAccountProfileForSpace(activeSpaceId, up);
    await setUserTimeBudgetProfile({
      profileId: buildSpaceProfileKey(activeSpaceId, profile.id),
      annualVacationEntitlementDays: parseFloat(annualVacationEntitlement) || 0,
      vacationDays: parseFloat(vacationDaysBal) || 0,
      wDays: parseFloat(wDaysBal) || 0,
      glzHours: parseFloat(glzHoursBal) || 0,
      fzgaHours: parseFloat(fzgaHoursBal) || 0,
      vzgaHours: parseFloat(vzgaHoursBal) || 0,
      updatedAt: new Date().toISOString(),
    });
    setSaving(false);
    Alert.alert('Gespeichert', 'Zeitkonto-Einstellungen und Zeitguthaben wurden gespeichert.');
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
        <Text style={styles.guardIcon}>🔒</Text>
        <Text style={styles.guardTitle}>Profil benötigt</Text>
        <Text style={styles.guardDesc}>Du brauchst ein Profil, um das Freizeitkonto zu nutzen.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(auth)/create-profile')}>
          <Text style={styles.backBtnText}>Profil erstellen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Schulferien-Effektiv-Wert
  const schoolEffective = schoolOverride !== null
    ? schoolOverride
    : (spaceProfile?.schoolHolidaysEnabledByDefault ?? false);
  const monthlyProgress = computeMonthlyWorkProgress({
    plan: shiftPlan,
    config: timeConfig,
    events: timeEvents,
    spaceProfile,
    qaDateOverrides: qaOverrides,
  });
  const fmtHours = (value: number) => `${value.toFixed(2).replace('.', ',')} h`;
  const fmtSignedHours = (value: number) => `${value > 0 ? '+' : value < 0 ? '-' : ''}${Math.abs(value).toFixed(2).replace('.', ',')} h`;
  const annualEntitlement = parseFloat(annualVacationEntitlement) || 0;
  const annualRemaining = Math.max(0, annualEntitlement - vacationDaysTakenYear);
  const currentYear = new Date().getFullYear();

  const annualForesight = (() => {
    if (!shiftPlan) {
      return {
        holidayPotentialHours: 0,
        preHolidayPotentialHours: 0,
        glzPotentialHours: 0,
        wDayPotentialDays: 0,
      };
    }
    const holidayMap = getHolidayMap(currentYear);
    const regularCodes = new Set(['F', 'S', 'N', 'KS', 'KN', 'T']);
    const entryByDate = new Map(shiftPlan.entries.map((e) => [e.dateISO, e.code] as const));
    let holidayShiftCount = 0;
    let preHolidayShiftCount = 0;
    let regularShiftCount = 0;
    const dateToIso = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const start = new Date(currentYear, 0, 1);
    const end = new Date(currentYear, 11, 31);
    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const dayISO = dateToIso(cursor);
      const code =
        entryByDate.get(dayISO) ??
        shiftCodeAtDate(shiftPlan.startDateISO, shiftPlan.pattern, dayISO);
      if (!code || !regularCodes.has(code)) continue;
      regularShiftCount += 1;
      if (holidayMap[dayISO]) holidayShiftCount += 1;
      const next = new Date(cursor);
      next.setDate(next.getDate() + 1);
      const nextISO = dateToIso(next);
      if (holidayMap[nextISO]) preHolidayShiftCount += 1;
    }
    const wDays = computeWDaysForRange({
      plan: shiftPlan,
      fromISO: `${currentYear}-01-01`,
      toISO: `${currentYear}-12-31`,
      qaDateOverrides: qaOverrides,
      wEnabled: spaceProfile?.codeRules.W?.enabled ?? false,
    });
    return {
      holidayPotentialHours: spaceProfile?.holidayCredit.enabled
        ? holidayShiftCount * spaceProfile.holidayCredit.hoursPerHolidayShift
        : 0,
      preHolidayPotentialHours: spaceProfile?.preHolidayCredit.enabled
        ? preHolidayShiftCount * spaceProfile.preHolidayCredit.hoursPerOccurrence
        : 0,
      // Foresight-Regel laut Produktvorgabe:
      // jeder reguläre Dienst => 15 Min potenzielle GLZ = 0,25 h
      glzPotentialHours: regularShiftCount * 0.25,
      wDayPotentialDays: wDays.totalWDays,
    };
  })();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>📊 Urlaubs- & Freizeitkonto</Text>
      <Text style={styles.subtitle}>
        Prognose auf Basis deiner Einstellungen und des Space-Regelprofils.
      </Text>

      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimerText}>
          ℹ️ Alle Angaben sind technische Prognosen – kein Rechtsanspruch.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Monatsfortschritt ({monthlyProgress.monthLabel})</Text>
      <View style={styles.ruleCard}>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>Soll bisher</Text>
          <Text style={styles.ruleVal}>{fmtHours(monthlyProgress.plannedHoursToDate)}</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>Ist bisher</Text>
          <Text style={styles.ruleVal}>{fmtHours(monthlyProgress.workedHoursToDate)}</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>Delta bisher</Text>
          <Text
            style={[
              styles.ruleVal,
              monthlyProgress.deltaHoursToDate > 0
                ? styles.deltaPositive
                : monthlyProgress.deltaHoursToDate < 0
                  ? styles.deltaNegative
                  : null,
            ]}
          >
            {fmtSignedHours(monthlyProgress.deltaHoursToDate)}
          </Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>Monatssoll</Text>
          <Text style={styles.ruleVal}>{fmtHours(monthlyProgress.plannedHoursMonth)}</Text>
        </View>
        <View style={styles.ruleDivider} />
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>Tarifgutschrift bisher</Text>
          <Text style={styles.ruleVal}>{fmtHours(monthlyProgress.creditedHoursToDate)}</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>davon Feiertag</Text>
          <Text style={styles.ruleVal}>{fmtHours(monthlyProgress.creditedHolidayHoursToDate)}</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>davon Vorfest</Text>
          <Text style={styles.ruleVal}>{fmtHours(monthlyProgress.creditedPreHolidayHoursToDate)}</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>W-Tage bisher</Text>
          <Text style={styles.ruleVal}>{monthlyProgress.creditedWDaysToDate} Tage</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>Gleitzeit angerechnet (Regel)</Text>
          <Text style={styles.ruleVal}>{fmtHours(monthlyProgress.creditedFlexHoursToDate)}</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>Gesamtdelta inkl. Tarif</Text>
          <Text
            style={[
              styles.ruleVal,
              monthlyProgress.totalDeltaWithCreditsToDate > 0
                ? styles.deltaPositive
                : monthlyProgress.totalDeltaWithCreditsToDate < 0
                  ? styles.deltaNegative
                  : null,
            ]}
          >
            {fmtSignedHours(monthlyProgress.totalDeltaWithCreditsToDate)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.explanationHeader}
          onPress={() => setMonthExplanationExpanded((prev) => !prev)}
          activeOpacity={0.8}
        >
          <Text style={styles.ruleKey}>Erklärung anzeigen</Text>
          <Text style={styles.explanationToggle}>{monthExplanationExpanded ? '▾' : '▸'}</Text>
        </TouchableOpacity>
        {monthExplanationExpanded ? (
          <View style={styles.explanationBox}>
            {monthlyProgress.explanation.map((line, idx) => (
              <Text key={`ta-exp-${idx}`} style={styles.explanationText}>
                {idx + 1}. {line}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      {/* ── Meine Einstellungen ──────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Meine Einstellungen</Text>

      {/* Wochenarbeitszeit */}
      <Text style={styles.fieldLabel}>Wochenarbeitszeit (Stunden)</Text>
      <TextInput
        style={styles.input}
        value={weeklyHours}
        onChangeText={setWeeklyHours}
        keyboardType="decimal-pad"
        placeholder="z.B. 38.5"
        placeholderTextColor={colors.textTertiary}
      />

      {/* Arbeitsmodell */}
      <Text style={styles.fieldLabel}>Arbeitsmodell</Text>
      {(Object.entries(WORK_MODEL_LABELS) as [WorkModel, string][]).map(([key, label]) => (
        <TouchableOpacity
          key={key}
          style={[styles.modelOption, workModel === key && styles.modelOptionActive]}
          onPress={() => setWorkModel(key)}
        >
          <View style={[styles.modelRadio, workModel === key && styles.modelRadioActive]} />
          <Text style={[styles.modelLabel, workModel === key && styles.modelLabelActive]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}

      {/* Startsaldo */}
      <Text style={styles.fieldLabel}>Startsaldo Stundenkonto</Text>
      <TextInput
        style={styles.input}
        value={openingBalance}
        onChangeText={setOpeningBalance}
        keyboardType="numbers-and-punctuation"
        placeholder="z.B. 4.5 oder -2"
        placeholderTextColor={colors.textTertiary}
      />
      <Text style={styles.fieldHint}>Positive Werte = Überstunden, negative = Schulden</Text>

      <Text style={styles.fieldLabel}>Jährlicher Urlaubsanspruch (Tage)</Text>
      <TextInput
        style={styles.input}
        value={annualVacationEntitlement}
        onChangeText={setAnnualVacationEntitlement}
        keyboardType="decimal-pad"
        placeholder="z. B. 30"
        placeholderTextColor={colors.textTertiary}
      />

      <Text style={styles.sectionTitle}>Zeitguthaben (manuell)</Text>
      <Text style={styles.fieldHint}>
        Diese Werte kannst du monatlich aus deinem Arbeitgeber-Konto übernehmen.
      </Text>

      <Text style={styles.fieldLabel}>Urlaubstage (U) · ganze Tage</Text>
      <TextInput
        style={styles.input}
        value={vacationDaysBal}
        onChangeText={setVacationDaysBal}
        keyboardType="decimal-pad"
        placeholder="z. B. 24"
        placeholderTextColor={colors.textTertiary}
      />

      <Text style={styles.fieldLabel}>W-Tage (W) · ganze Tage</Text>
      <TextInput
        style={styles.input}
        value={wDaysBal}
        onChangeText={setWDaysBal}
        keyboardType="decimal-pad"
        placeholder="z. B. 6"
        placeholderTextColor={colors.textTertiary}
      />

      <Text style={styles.fieldLabel}>Gleitzeitstunden (GLZ)</Text>
      <TextInput
        style={styles.input}
        value={glzHoursBal}
        onChangeText={setGlzHoursBal}
        keyboardType="decimal-pad"
        placeholder="z. B. 18.5 oder -3"
        placeholderTextColor={colors.textTertiary}
      />
      <Text style={styles.fieldHint}>GLZ darf auch negativ sein.</Text>

      <Text style={styles.sectionTitle}>Foresight Guthaben ({currentYear})</Text>
      <View style={styles.ruleCard}>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>Urlaub Anspruch gesamt</Text>
          <Text style={styles.ruleVal}>{annualEntitlement.toFixed(0)} Tage</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>Urlaub eingetragen</Text>
          <Text style={styles.ruleVal}>{vacationDaysTakenYear} Tage</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>Urlaub Rest (Foresight)</Text>
          <Text style={styles.ruleVal}>{annualRemaining.toFixed(0)} Tage</Text>
        </View>
        <View style={styles.ruleDivider} />
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>FZGA Potenzial (Jahr)</Text>
          <Text style={styles.ruleVal}>{fmtHours(annualForesight.holidayPotentialHours)}</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>VZGA Potenzial (Jahr)</Text>
          <Text style={styles.ruleVal}>{fmtHours(annualForesight.preHolidayPotentialHours)}</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>GLZ Potenzial (Jahr)</Text>
          <Text style={styles.ruleVal}>{fmtHours(annualForesight.glzPotentialHours)}</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleKey}>W-Tage Potenzial</Text>
          <Text style={styles.ruleVal}>{annualForesight.wDayPotentialDays} Tage</Text>
        </View>

        {vacationDaysTakenYear === 0 ? (
          <View style={styles.ruleWarning}>
            <Text style={styles.ruleWarningText}>
              Hinweis: Noch kein Urlaub eingetragen.
            </Text>
          </View>
        ) : null}
        {annualEntitlement > 0 && vacationDaysTakenYear < annualEntitlement ? (
          <View style={styles.ruleWarning}>
            <Text style={styles.ruleWarningText}>
              Hinweis: Urlaub unvollständig. Es fehlen noch {annualRemaining.toFixed(0)} Tage bis zum Anspruch.
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.fieldLabel}>Feiertagsstunden (FZGA)</Text>
      <TextInput
        style={styles.input}
        value={fzgaHoursBal}
        onChangeText={setFzgaHoursBal}
        keyboardType="decimal-pad"
        placeholder="z. B. 12"
        placeholderTextColor={colors.textTertiary}
      />

      <Text style={styles.fieldLabel}>Vorfeststunden (VZGA)</Text>
      <TextInput
        style={styles.input}
        value={vzgaHoursBal}
        onChangeText={setVzgaHoursBal}
        keyboardType="decimal-pad"
        placeholder="z. B. 4"
        placeholderTextColor={colors.textTertiary}
      />

      {/* Schulferien Override */}
      <Text style={styles.fieldLabel}>Schulferien im Kalender</Text>
      <View style={styles.schoolRow}>
        {([null, true, false] as const).map((val) => {
          const label = val === null ? `Space-Standard (${schoolEffective ? 'an' : 'aus'})` : val ? 'Immer an' : 'Immer aus';
          const active = schoolOverride === val;
          return (
            <TouchableOpacity
              key={String(val)}
              style={[styles.pill, active && styles.pillActive]}
              onPress={() => setSchoolOverride(val)}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Speichern */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>
          {saving ? 'Speichern...' : '💾 Einstellungen speichern'}
        </Text>
      </TouchableOpacity>

      {/* ── Space-Regelprofil (Read-Only) ──────────────────────────────── */}
      <Text style={styles.sectionTitle}>Space-Regelprofil</Text>

      {spaceProfile ? (
        <View style={styles.ruleCard}>
          <Text style={styles.ruleCardTitle}>{spaceProfile.ruleProfileName}</Text>
          <Text style={styles.ruleCardLine}>
            📍 {BUNDESLAND_LABELS[spaceProfile.bundesland as Bundesland] ?? spaceProfile.bundesland}
            {spaceProfile.branche ? `  ·  ${spaceProfile.branche}` : ''}
          </Text>

          {!isBundeslandSupported(spaceProfile.bundesland) && (
            <View style={styles.ruleWarning}>
              <Text style={styles.ruleWarningText}>
                ⚠️ Für dieses Bundesland sind noch keine Schulferien-Daten hinterlegt.
              </Text>
            </View>
          )}

          <View style={styles.ruleDivider} />

          <View style={styles.ruleRow}>
            <Text style={styles.ruleKey}>Feiertagsgutschrift</Text>
            <Text style={styles.ruleVal}>
              {spaceProfile.holidayCredit.enabled
                ? `✅ ${spaceProfile.holidayCredit.hoursPerHolidayShift} h`
                : '—'}
            </Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleKey}>Vorfest-Gutschrift</Text>
            <Text style={styles.ruleVal}>
              {spaceProfile.preHolidayCredit.enabled
                ? `✅ ${spaceProfile.preHolidayCredit.hoursPerOccurrence} h`
                : '—'}
            </Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleKey}>W-Regel</Text>
            <Text style={styles.ruleVal}>{spaceProfile.codeRules.W?.enabled ? '✅' : '—'}</Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleKey}>T-Regel</Text>
            <Text style={styles.ruleVal}>{spaceProfile.codeRules.T?.enabled ? '✅' : '—'}</Text>
          </View>
          <View style={styles.ruleRow}>
            <Text style={styles.ruleKey}>Schulferien-Default</Text>
            <Text style={styles.ruleVal}>
              {spaceProfile.schoolHolidaysEnabledByDefault ? '✅ an' : '—'}
            </Text>
          </View>

          <View style={styles.ruleDivider} />

          <Text style={styles.ruleSource}>Quelle: {spaceProfile.sourceLabel}</Text>
          {spaceProfile.sourceUrl ? (
            <TouchableOpacity onPress={() => Linking.openURL(spaceProfile.sourceUrl!)}>
              <Text style={styles.ruleSourceUrl}>{spaceProfile.sourceUrl}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : syncOffline ? (
        <View style={styles.ruleOffline}>
          <Text style={styles.ruleOfflineText}>
            Backend offline – letzter lokaler Stand wird angezeigt.{'\n'}
            Kein Regelprofil lokal vorhanden. Bitte erneut öffnen, wenn eine Verbindung besteht.
          </Text>
        </View>
      ) : (
        <View style={styles.ruleEmpty}>
          <Text style={styles.ruleEmptyText}>
            Kein Regelprofil für diesen Space vorhanden.{'\n'}
            Ein Owner / Co-Admin kann es im Admin-Bereich hinterlegen.
          </Text>
          {ruleSyncDebug ? (
            <Text style={styles.ruleDebugText}>debug: {ruleSyncDebug}</Text>
          ) : null}
        </View>
      )}

      {/* Zurück */}
      <Button
        label="Zurück zu Services"
        onPress={handleBack}
        variant="subtle"
        fullWidth
        style={styles.backBtn}
      />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    paddingTop: 60,
    paddingBottom: 48,
  },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background, padding: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  disclaimerBox: {
    backgroundColor: colors.primaryBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primaryVariant,
  },
  disclaimerText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  fieldLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldHint: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundSecondary,
    minHeight: accessibility.minTapHeight,
  },
  modelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
    marginBottom: 4,
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modelOptionActive: {
    backgroundColor: colors.primaryBackground,
    borderColor: colors.primary,
  },
  modelRadio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: colors.border,
  },
  modelRadioActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  modelLabel: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
  },
  modelLabelActive: {
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  schoolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.backgroundTertiary,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  pillTextActive: {
    color: colors.textInverse,
    fontWeight: typography.fontWeight.semibold,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xl,
    minHeight: accessibility.minTapHeight,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  // Rule Card
  ruleCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#C7D7FD',
    marginBottom: spacing.md,
  },
  ruleCardTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  ruleCardLine: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  ruleWarning: {
    backgroundColor: '#FEF3C7',
    borderRadius: borderRadius.md,
    padding: spacing.xs,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  ruleWarningText: {
    fontSize: typography.fontSize.xs,
    color: '#92400E',
  },
  ruleDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  ruleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  ruleKey: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  ruleVal: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
  deltaPositive: {
    color: '#166534',
  },
  deltaNegative: {
    color: '#B91C1C',
  },
  explanationHeader: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  explanationToggle: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.bold,
  },
  explanationBox: {
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    gap: 4,
    marginTop: spacing.xs,
  },
  explanationText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  ruleSource: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  ruleSourceUrl: {
    fontSize: typography.fontSize.xs,
    color: colors.primary,
    textDecorationLine: 'underline',
    marginTop: 2,
  },
  ruleEmpty: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  ruleEmptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  ruleDebugText: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  ruleOffline: {
    backgroundColor: '#FEF3C7',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  ruleOfflineText: {
    fontSize: typography.fontSize.sm,
    color: '#92400E',
    textAlign: 'center',
    lineHeight: 22,
  },
  backBtn: {
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.md,
    backgroundColor: colors.backgroundTertiary,
  },
  backBtnText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  guardIcon: { fontSize: 52, marginBottom: spacing.md },
  guardTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  guardDesc: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
});

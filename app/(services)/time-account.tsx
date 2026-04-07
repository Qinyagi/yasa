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
  getSpaceRuleProfile, getUserTimeAccountProfile,
  getTimeClockQaCalendar,
  getShiftPlan, getTimeClockConfigOrDefault, getTimeClockEvents,
  setUserTimeAccountProfile,
} from '../../lib/storage';
import type { UserProfile } from '../../types';
import type { UserShiftPlan, UserTimeClockConfig, TimeClockEvent } from '../../types';
import type { SpaceRuleProfile, UserTimeAccountProfile, WorkModel } from '../../types/timeAccount';
import { WORK_MODEL_LABELS } from '../../types/timeAccount';
import { computeMonthlyWorkProgress } from '../../lib/timeAccountEngine';
import { BUNDESLAND_LABELS, isBundeslandSupported } from '../../data/schoolHolidays';
import type { Bundesland } from '../../data/schoolHolidays';
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
  const [schoolOverride,     setSchoolOverride]     = useState<boolean | null>(null);
  // null = Space-Default

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      Promise.all([getProfile(), getCurrentSpaceId()]).then(async ([p, spaceId]) => {
        if (!active) return;
        setProfile(p);

        if (spaceId) {
          const sr = await getSpaceRuleProfile(spaceId);
          if (active) setSpaceProfile(sr);
        }

        if (p) {
          const [plan, cfg, events] = await Promise.all([
            getShiftPlan(p.id),
            getTimeClockConfigOrDefault(p.id),
            getTimeClockEvents(p.id),
          ]);
          const qaMap = await getTimeClockQaCalendar(p.id);
          if (active) {
            setShiftPlan(plan);
            setTimeConfig(cfg);
            setTimeEvents(events);
            setQaOverrides(qaMap);
          }

          const ur = await getUserTimeAccountProfile(p.id);
          if (active && ur) {
            setWeeklyHours(String(ur.weeklyHours));
            setWorkModel(ur.workModel);
            setOpeningBalance(String(ur.openingBalanceHours));
            setSchoolOverride(ur.schoolHolidaysEnabled ?? null);
          }
        }
        if (active) setLoading(false);
      });
      return () => { active = false; };
    }, [])
  );

  async function handleSave() {
    if (!profile) return;
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
    await setUserTimeAccountProfile(up);
    setSaving(false);
    Alert.alert('Gespeichert', 'Deine Zeitkonto-Einstellungen wurden gespeichert.');
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
      ) : (
        <View style={styles.ruleEmpty}>
          <Text style={styles.ruleEmptyText}>
            Kein Regelprofil für diesen Space vorhanden.{'\n'}
            Ein Owner / Co-Admin kann es im Admin-Bereich hinterlegen.
          </Text>
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

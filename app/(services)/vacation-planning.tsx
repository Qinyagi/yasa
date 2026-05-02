import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from '../../components/Button';
import {
  getCurrentSpaceId,
  getEffectiveVacationPlanningMemberState,
  getProfile,
  getVacationPlanningBudgetSummary,
  getVacationPlanningDaysForProfile,
  markNoVacationPlanningWishes,
  submitVacationPlanningDraftsForProfile,
} from '../../lib/storage';
import { borderRadius, shadows, spacing, typography, warmHuman } from '../../constants/theme';
import type { UserProfile } from '../../types';
import type {
  VacationPlanningBudgetSummary,
  VacationPlanningMemberStatus,
} from '../../types/vacationPlanning';

const COMPLETED_STATUSES: VacationPlanningMemberStatus[] = [
  'submitted',
  'no-wishes',
  'team-aligned',
  'ready-for-employer-review',
  'employer-confirmed',
];

const STATUS_LABELS: Record<VacationPlanningMemberStatus, string> = {
  'not-started': 'Noch nicht begonnen',
  drafting: 'Drafts offen',
  submitted: 'Eingereicht',
  'no-wishes': 'Keine Wünsche',
  'team-aligned': 'Im Team abgestimmt',
  'ready-for-employer-review': 'Bereit für Arbeitgeber',
  'employer-confirmed': 'Vom Arbeitgeber bestätigt',
};

export default function VacationPlanningScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [draftCount, setDraftCount] = useState(0);
  const [budgetSummary, setBudgetSummary] = useState<VacationPlanningBudgetSummary | null>(null);
  const [planningStatus, setPlanningStatus] =
    useState<VacationPlanningMemberStatus>('not-started');
  const [planningYear] = useState(() => new Date().getFullYear() + 1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refreshPlanningState = useCallback(
    async (currentSpaceId: string, profileId: string) => {
      const [days, state, summary] = await Promise.all([
        getVacationPlanningDaysForProfile(currentSpaceId, profileId, planningYear, ['draft']),
        getEffectiveVacationPlanningMemberState(currentSpaceId, profileId, planningYear),
        getVacationPlanningBudgetSummary(currentSpaceId, profileId, planningYear),
      ]);
      setDraftCount(days.length);
      setPlanningStatus(state.status);
      setBudgetSummary(summary);
    },
    [planningYear]
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      Promise.all([getProfile(), getCurrentSpaceId()]).then(async ([p, currentSpaceId]) => {
        if (!active) return;
        setProfile(p);
        setSpaceId(currentSpaceId);

        if (p && currentSpaceId) {
          const [days, state, summary] = await Promise.all([
            getVacationPlanningDaysForProfile(currentSpaceId, p.id, planningYear, ['draft']),
            getEffectiveVacationPlanningMemberState(currentSpaceId, p.id, planningYear),
            getVacationPlanningBudgetSummary(currentSpaceId, p.id, planningYear),
          ]);
          if (!active) return;
          setDraftCount(days.length);
          setPlanningStatus(state.status);
          setBudgetSummary(summary);
        } else {
          setDraftCount(0);
          setPlanningStatus('not-started');
          setBudgetSummary(null);
        }
        setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [planningYear, refreshPlanningState])
  );

  const completed = COMPLETED_STATUSES.includes(planningStatus);
  const budgetUsagePercent =
    budgetSummary && budgetSummary.budgetDays > 0
      ? Math.min(100, Math.max(0, (budgetSummary.plannedDays / budgetSummary.budgetDays) * 100))
      : 0;
  const budgetSourceLabel =
    budgetSummary?.budgetSource === 'vacation-balance'
      ? 'Urlaubsguthaben'
      : budgetSummary?.budgetSource === 'annual-entitlement'
        ? 'Jahresanspruch'
        : 'Urlaubsguthaben fehlt';

  const handleSubmitDrafts = useCallback(() => {
    if (!spaceId || !profile || draftCount === 0 || saving) return;
    Alert.alert(
      'Wünsche einreichen',
      `Deine ${draftCount} markierten Tage für ${planningYear} werden in die Team-Vorplanung übernommen.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Einreichen',
          onPress: async () => {
            setSaving(true);
            try {
              await submitVacationPlanningDraftsForProfile(spaceId, profile.id, planningYear);
              await refreshPlanningState(spaceId, profile.id);
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }, [draftCount, planningYear, profile, refreshPlanningState, saving, spaceId]);

  const handleNoWishes = useCallback(() => {
    if (!spaceId || !profile || saving) return;
    Alert.alert(
      'Keine Wünsche?',
      `YASA markiert deine Urlaubsvorplanung für ${planningYear} als erledigt. Offene Drafts werden dabei entfernt.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Als erledigt markieren',
          onPress: async () => {
            setSaving(true);
            try {
              await markNoVacationPlanningWishes(spaceId, profile.id, planningYear);
              await refreshPlanningState(spaceId, profile.id);
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }, [planningYear, profile, refreshPlanningState, saving, spaceId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={warmHuman.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Teamplanung</Text>
        <Text style={styles.title}>Urlaubsvorplanung</Text>
        <Text style={styles.subtitle}>
          Urlaubswünsche sammeln, sichtbar machen und gemeinsam zu einem Plan vorbereiten.
        </Text>
      </View>

      {!spaceId ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Space benötigt</Text>
          <Text style={styles.noticeText}>
            Urlaubsvorplanung ist ein Teamprozess. Wähle zuerst einen Space aus.
          </Text>
          <Button label="Space wählen" onPress={() => router.push('/(space)/choose')} fullWidth />
        </View>
      ) : (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Dein Stand für {planningYear}</Text>
            <Text style={styles.summaryValue}>{draftCount}</Text>
            <Text style={styles.summaryText}>
              {STATUS_LABELS[planningStatus]} · offene Drafts entstehen, wenn du im Kalender im
              Zukunftsjahr neue Urlaubsvorplanung markierst.
            </Text>
          </View>

          <View style={styles.budgetCard}>
            <View style={styles.budgetHeaderRow}>
              <Text style={styles.budgetTitle}>{budgetSourceLabel} {planningYear}</Text>
              <Text style={styles.budgetBadge}>
                {budgetSummary?.budgetSource === 'missing'
                  ? 'offen'
                  : `${Math.max(0, budgetSummary?.remainingDays ?? 0)} frei`}
              </Text>
            </View>
            {budgetSummary?.budgetSource === 'missing' ? (
              <Text style={styles.budgetHelpText}>
                Trage dein Urlaubsguthaben im Freizeitkonto ein, damit YASA die Vorplanung transparent einordnen kann.
              </Text>
            ) : (
              <>
                <View style={styles.budgetMetricRow}>
                  <View style={styles.budgetMetric}>
                    <Text style={styles.budgetMetricValue}>{budgetSummary?.budgetDays ?? 0}</Text>
                    <Text style={styles.budgetMetricLabel}>Guthaben</Text>
                  </View>
                  <View style={styles.budgetMetric}>
                    <Text style={styles.budgetMetricValue}>{budgetSummary?.plannedDays ?? 0}</Text>
                    <Text style={styles.budgetMetricLabel}>vorgeplant</Text>
                  </View>
                  <View style={styles.budgetMetric}>
                    <Text style={styles.budgetMetricValue}>{budgetSummary?.remainingDays ?? 0}</Text>
                    <Text style={styles.budgetMetricLabel}>noch frei</Text>
                  </View>
                </View>
                <View style={styles.budgetProgressTrack}>
                  <View style={[styles.budgetProgressFill, { width: `${budgetUsagePercent}%` }]} />
                </View>
                <Text style={styles.budgetBreakdownText}>
                  Offene Drafts: {budgetSummary?.draftDays ?? 0} · Eingereicht: {budgetSummary?.submittedDays ?? 0}
                </Text>
              </>
            )}
          </View>

          <View style={styles.workflowGrid}>
            <View style={styles.workflowCard}>
              <Text style={styles.workflowTitle}>Wünsche</Text>
              <Text style={styles.workflowText}>Drafts prüfen und später gezielt einreichen.</Text>
            </View>
            <View style={styles.workflowCard}>
              <Text style={styles.workflowTitle}>Urlaubsgruppen</Text>
              <Text style={styles.workflowText}>Arbeitgeber-Gruppen als Planungsbasis abbilden.</Text>
            </View>
            <View style={styles.workflowCard}>
              <Text style={styles.workflowTitle}>Konflikte</Text>
              <Text style={styles.workflowText}>Überschneidungen erkennen und im Team klären.</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.primaryAction}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: '/(shift)/calendar',
                params: {
                  dateISO: `${planningYear}-01-01`,
                  returnMonthKey: `${planningYear}-01`,
                  returnTo: '/(services)/vacation-planning',
                  preselectAction: 'vacationPlanning',
                },
              })
            }
          >
            <Text style={styles.primaryActionText}>Wünsche für {planningYear} markieren</Text>
          </TouchableOpacity>

          <View style={styles.completionCard}>
            <Text style={styles.completionTitle}>Abschluss</Text>
            <Text style={styles.completionText}>
              {completed
                ? `Dein aktueller Abschlussstatus: ${STATUS_LABELS[planningStatus]}.`
                : draftCount > 0
                  ? 'Reiche deine offenen Drafts ein, sobald deine Wünsche für das Jahr stehen.'
                  : 'Wenn du für dieses Planungsjahr keine Urlaubswünsche hast, kannst du die Vorplanung hier abschließen.'}
            </Text>

            {draftCount > 0 && !completed ? (
              <TouchableOpacity
                style={[styles.secondaryAction, saving && styles.disabledAction]}
                activeOpacity={0.85}
                disabled={saving}
                onPress={handleSubmitDrafts}
              >
                <Text style={styles.secondaryActionText}>
                  {saving ? 'Speichert...' : 'Drafts einreichen'}
                </Text>
              </TouchableOpacity>
            ) : null}

            {draftCount === 0 && !completed ? (
              <TouchableOpacity
                style={[styles.secondaryAction, saving && styles.disabledAction]}
                activeOpacity={0.85}
                disabled={saving}
                onPress={handleNoWishes}
              >
                <Text style={styles.secondaryActionText}>
                  {saving ? 'Speichert...' : `Keine Wünsche für ${planningYear}`}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      )}

      <Button
        label="Zurück zu Services"
        onPress={() => router.replace('/(services)')}
        variant="subtle"
        fullWidth
        style={styles.backButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: warmHuman.surface,
  },
  container: {
    flexGrow: 1,
    backgroundColor: warmHuman.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  header: {
    marginBottom: spacing.lg,
  },
  eyebrow: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.primary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.fontSize.base,
    color: warmHuman.textSecondary,
    lineHeight: 22,
  },
  noticeCard: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    ...shadows.md,
  },
  noticeTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
    marginBottom: spacing.xs,
  },
  noticeText: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  summaryCard: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: warmHuman.primary,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  summaryLabel: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: typography.fontSize['4xl'],
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.primary,
  },
  summaryText: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  budgetCard: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  budgetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  budgetTitle: {
    flex: 1,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
  },
  budgetBadge: {
    backgroundColor: '#E8F5E9',
    color: warmHuman.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    overflow: 'hidden',
  },
  budgetHelpText: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    lineHeight: 20,
  },
  budgetMetricRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  budgetMetric: {
    flex: 1,
    backgroundColor: warmHuman.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    alignItems: 'center',
  },
  budgetMetricValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.primary,
  },
  budgetMetricLabel: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textMuted,
    marginTop: 2,
  },
  budgetProgressTrack: {
    height: 8,
    backgroundColor: warmHuman.borderLight,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  budgetProgressFill: {
    height: '100%',
    backgroundColor: warmHuman.primary,
    borderRadius: borderRadius.full,
  },
  budgetBreakdownText: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textMuted,
  },
  workflowGrid: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  workflowCard: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
  },
  workflowTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
    marginBottom: 2,
  },
  workflowText: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    lineHeight: 20,
  },
  primaryAction: {
    backgroundColor: warmHuman.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryActionText: {
    color: warmHuman.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  completionCard: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    marginTop: spacing.sm,
  },
  completionTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
    marginBottom: spacing.xs,
  },
  completionText: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  secondaryAction: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: warmHuman.primary,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  secondaryActionText: {
    color: warmHuman.primary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  disabledAction: {
    opacity: 0.65,
  },
  backButton: {
    marginTop: spacing.md,
  },
});

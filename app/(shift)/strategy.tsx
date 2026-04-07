import { useState, useCallback, useMemo } from 'react';
import { colors, typography, spacing, borderRadius, accessibility } from '../../constants/theme';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  getProfile,
  calculateVacationStrategy,
  applyVacationStrategy,
  getVacationDays,
  getShiftOverrides,
  getStrategyHoursBalance,
  getOpenShortShiftVacationReminders,
} from '../../lib/storage';
import type { VacationStrategy } from '../../lib/strategyTypes';
import type { ShiftType, UserProfile } from '../../types';

const PAGE_PADDING = 24;

export default function StrategyScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [strategies, setStrategies] = useState<VacationStrategy[]>([]);
  const [currentVacationDays, setCurrentVacationDays] = useState<string[]>([]);
  const [currentOverrides, setCurrentOverrides] = useState<Record<string, ShiftType>>({});
  const [hoursBalance, setHoursBalance] = useState(0);
  const [appliedStrategies, setAppliedStrategies] = useState<Set<string>>(new Set());

  // Load profile and calculate strategies
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      getProfile().then(async (p) => {
        if (!active) return;
        setProfile(p);

        if (p) {
          // Load current vacation days
          const [vDays, overrides, bankHours] = await Promise.all([
            getVacationDays(p.id),
            getShiftOverrides(p.id),
            getStrategyHoursBalance(p.id),
          ]);
          if (active) setCurrentVacationDays(vDays);
          if (active) setCurrentOverrides(overrides);
          if (active) setHoursBalance(bankHours);

          // Calculate strategies
          const calculated = await calculateVacationStrategy(p.id);
          if (active) setStrategies(calculated);
        }
        if (active) setLoading(false);
      });
      return () => { active = false; };
    }, [])
  );

  // Check which strategies are already applied
  const isStrategyApplied = useCallback((strategy: VacationStrategy): boolean => {
    if (strategy.strategyType === 'hours') {
      return strategy.urlaubstage.every((d) => currentOverrides[d] === 'X');
    }
    return strategy.urlaubstage.every(d => currentVacationDays.includes(d));
  }, [currentOverrides, currentVacationDays]);

  // Apply a strategy
  async function handleApplyStrategy(strategy: VacationStrategy) {
    if (!profile) return;
    const isHoursStrategy = strategy.strategyType === 'hours';
    const requiredHours = Number(strategy.requiredHours ?? 0);
    const hoursAfterApply = Math.max(0, hoursBalance - requiredHours);

    Alert.alert(
      isHoursStrategy ? 'Stunden-Strategie übernehmen?' : 'Strategie übernehmen?',
      isHoursStrategy
        ? `Damit werden ${strategy.urlaubstage.length} Tag(e) als Frei (X) markiert und ca. ${requiredHours.toFixed(2).replace('.', ',')} Stunden eingesetzt.\n\nKontostand: ${hoursBalance.toFixed(2).replace('.', ',')} h -> ${hoursAfterApply.toFixed(2).replace('.', ',')} h.\nUrlaubstage bleiben unverändert.`
        : `Damit werden ${strategy.urlaubstage.length} Urlaubstag(e) eingetragen und du erhältst ${strategy.freieTage} freie Tage.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Übernehmen',
          onPress: async () => {
            try {
              await applyVacationStrategy(profile.id, strategy);
              // Refresh vacation days
              const [vDays, overrides, openReminders, bankHours] = await Promise.all([
                getVacationDays(profile.id),
                getShiftOverrides(profile.id),
                getOpenShortShiftVacationReminders(profile.id),
                getStrategyHoursBalance(profile.id),
              ]);
              setCurrentVacationDays(vDays);
              setCurrentOverrides(overrides);
              setHoursBalance(bankHours);
              const strategySet = new Set(strategy.urlaubstage);
              const newShortShiftReminders = strategy.strategyType === 'vacation'
                ? openReminders.filter((r) => strategySet.has(r.dateISO))
                : [];
              // Mark as applied
              const key = `${strategy.strategyType}:${strategy.urlaubstage.join(',')}`;
              setAppliedStrategies(prev => new Set([...prev, key]));
              if (newShortShiftReminders.length > 0) {
                Alert.alert(
                  'Erfolg',
                  `Urlaubstage wurden eingetragen.\n\nHinweis: ${newShortShiftReminders.length} kurzer Dienst (KS/KN) benötigt einen Antrag. Du bekommst dazu eine Erinnerung auf dem Startscreen, bis der Antrag bestätigt ist.`
                );
              } else if (strategy.strategyType === 'hours') {
                Alert.alert('Erfolg', `Stunden-Strategie wurde als Frei (X) übernommen.\nNeuer Kontostand: ${bankHours.toFixed(2).replace('.', ',')} h.`);
              } else {
                Alert.alert('Erfolg', 'Urlaubstage wurden eingetragen!');
              }
            } catch (e) {
              Alert.alert('Fehler', e instanceof Error ? e.message : 'Übernahme fehlgeschlagen.');
            }
          },
        },
      ]
    );
  }

  // Calculate total vacation days
  const totalVacationDays = currentVacationDays.length;

  const renderStrategyItem = useCallback(({ item }: { item: VacationStrategy }) => {
    const isApplied = isStrategyApplied(item);
    const [year, month, day] = item.feiertag.date.split('-');
    const formattedDate = `${day}.${month}.${year}`;
    const strategyTypeLabel = item.strategyType === 'hours' ? 'Stunden' : 'Urlaub';
    const strategyTypeHint = item.strategyType === 'hours'
      ? `Benötigt: ${item.requiredHours?.toFixed(2).replace('.', ',') ?? '0,00'} h`
      : `${item.urlaubstage.length} Urlaubstag(e)`;

    return (
      <View style={[styles.strategyCard, isApplied && styles.strategyCardApplied]}>
        <View style={styles.strategyHeader}>
          <View style={styles.strategyTitleRow}>
            <Text style={styles.strategyTitle}>{item.feiertag.name}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.modeBadge, item.strategyType === 'hours' ? styles.modeBadgeHours : styles.modeBadgeVacation]}>
                <Text style={styles.modeBadgeText}>{strategyTypeLabel}</Text>
              </View>
              {isApplied && (
              <View style={styles.appliedBadge}>
                <Text style={styles.appliedBadgeText}>✓ Eingetragen</Text>
              </View>
              )}
            </View>
          </View>
          <Text style={styles.strategyDate}>{formattedDate}</Text>
        </View>

        <View style={styles.strategyDetails}>
          <View style={styles.strategyDetail}>
            <Text style={styles.strategyDetailValue}>{item.freieTage}</Text>
            <Text style={styles.strategyDetailLabel}>freie Tage</Text>
          </View>
          <View style={styles.strategyDetail}>
            <Text style={styles.strategyDetailValue}>
              {item.strategyType === 'hours'
                ? `${item.requiredHours?.toFixed(2).replace('.', ',') ?? '0,00'} h`
                : item.urlaubstage.length}
            </Text>
            <Text style={styles.strategyDetailLabel}>
              {item.strategyType === 'hours' ? 'benötigte Stunden' : 'Urlaubstage'}
            </Text>
          </View>
        </View>

        <View style={styles.strategyDays}>
          <Text style={styles.strategyDaysLabel}>{item.strategyType === 'hours' ? 'Stunden-Tage:' : 'Urlaub:'}</Text>
          <Text style={styles.strategyDaysValue}>
            {item.urlaubstage.map(d => {
              const [, m, day] = d.split('-');
              return `${day}.${m}`;
            }).join(', ')}
          </Text>
        </View>
        <Text style={styles.strategyHint}>{strategyTypeHint}</Text>
        {item.requiresShortShiftRequest && item.strategyType === 'vacation' ? (
          <Text style={styles.requestHint}>Hinweis: Für KS/KN ist ein Antrag erforderlich.</Text>
        ) : null}

        {!isApplied && (
          <TouchableOpacity
            style={styles.applyBtn}
            onPress={() => handleApplyStrategy(item)}
          >
            <Text style={styles.applyBtnText}>{item.strategyType === 'hours' ? 'Stunden einsetzen' : 'Übernehmen'}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [isStrategyApplied]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(shift)/calendar')}>
          <Text style={styles.backBtnText}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.title}>💡 Urlaubs-Strategie</Text>
        <Text style={styles.subtitle}>
          Optimiere deine freien Tage mit Brückentagen
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalVacationDays}</Text>
          <Text style={styles.statLabel}>Urlaubstage</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{strategies.length}</Text>
          <Text style={styles.statLabel}>Mögliche Strategien</Text>
        </View>
      </View>
      <View style={styles.hoursBalanceCard}>
        <Text style={styles.hoursBalanceLabel}>Stundenkonto (Strategie)</Text>
        <Text style={styles.hoursBalanceValue}>{hoursBalance.toFixed(2).replace('.', ',')} h verfügbar</Text>
      </View>

      {/* Strategy List */}
      {strategies.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyEmoji}>🎉</Text>
          <Text style={styles.emptyTitle}>Keine Strategien verfügbar</Text>
          <Text style={styles.emptyDesc}>
            Es gibt keine weiteren Brückentag-Möglichkeiten in den nächsten 12 Monaten.
          </Text>
        </View>
      ) : (
        <FlatList
          data={strategies}
          keyExtractor={(item, idx) => `${item.strategyType}-${item.feiertag.date}-${idx}`}
          renderItem={renderStrategyItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', paddingTop: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },

  header: { paddingHorizontal: PAGE_PADDING, marginBottom: 16 },
  backBtn: { marginBottom: 12 },
  backBtnText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 14, color: colors.textSecondary },

  statsRow: { flexDirection: 'row', paddingHorizontal: PAGE_PADDING, gap: 12, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: colors.backgroundTertiary, borderRadius: 12, padding: 16, alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  hoursBalanceCard: {
    marginHorizontal: PAGE_PADDING,
    marginBottom: 14,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  hoursBalanceLabel: { fontSize: 12, color: colors.textSecondary },
  hoursBalanceValue: { fontSize: 15, color: colors.textPrimary, fontWeight: '700', marginTop: 2 },

  listContent: { paddingHorizontal: PAGE_PADDING, paddingBottom: 32 },

  strategyCard: { backgroundColor: '#FFFBEB', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#FCD34D' },
  strategyCardApplied: { backgroundColor: colors.successBackground, borderColor: '#6EE7B7' },
  strategyHeader: { marginBottom: 12 },
  strategyTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  strategyTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modeBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  modeBadgeVacation: { backgroundColor: '#DBEAFE' },
  modeBadgeHours: { backgroundColor: '#FEF3C7' },
  modeBadgeText: { fontSize: 11, color: colors.textPrimary, fontWeight: '700' },
  appliedBadge: { backgroundColor: colors.success, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  appliedBadgeText: { fontSize: 11, color: colors.textInverse, fontWeight: '600' },
  strategyDate: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  strategyDetails: { flexDirection: 'row', gap: 24, marginBottom: 12 },
  strategyDetail: { alignItems: 'center' },
  strategyDetailValue: { fontSize: 22, fontWeight: '700', color: colors.warning },
  strategyDetailLabel: { fontSize: 11, color: '#92400E' },

  strategyDays: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  strategyDaysLabel: { fontSize: 12, color: '#92400E', fontWeight: '600', marginRight: 6 },
  strategyDaysValue: { fontSize: 12, color: '#78350F' },
  strategyHint: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 },
  requestHint: { fontSize: 12, color: '#92400E', marginBottom: 10, fontWeight: '600' },

  applyBtn: { backgroundColor: colors.warning, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  applyBtnText: { color: colors.textInverse, fontSize: 14, fontWeight: '600' },

  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: PAGE_PADDING },
  emptyEmoji: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptyDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});



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
  type VacationStrategy,
} from '../../lib/storage';
import type { UserProfile } from '../../types';

const PAGE_PADDING = 24;

export default function StrategyScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [strategies, setStrategies] = useState<VacationStrategy[]>([]);
  const [currentVacationDays, setCurrentVacationDays] = useState<string[]>([]);
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
          const vDays = await getVacationDays(p.id);
          if (active) setCurrentVacationDays(vDays);

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
    const strategyKey = strategy.urlaubstage.join(',');
    return strategy.urlaubstage.every(d => currentVacationDays.includes(d));
  }, [currentVacationDays]);

  // Apply a strategy
  async function handleApplyStrategy(strategy: VacationStrategy) {
    if (!profile) return;

    Alert.alert(
      'Strategie übernehmen?',
      `Damit werden ${strategy.urlaubstage.length} Urlaubstag(e) eingetragen und du erhältst ${strategy.freieTage} freie Tage.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Übernehmen',
          onPress: async () => {
            await applyVacationStrategy(profile.id, strategy);
            // Refresh vacation days
            const vDays = await getVacationDays(profile.id);
            setCurrentVacationDays(vDays);
            // Mark as applied
            const key = strategy.urlaubstage.join(',');
            setAppliedStrategies(prev => new Set([...prev, key]));
            Alert.alert('Erfolg', 'Urlaubstage wurden eingetragen!');
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

    return (
      <View style={[styles.strategyCard, isApplied && styles.strategyCardApplied]}>
        <View style={styles.strategyHeader}>
          <View style={styles.strategyTitleRow}>
            <Text style={styles.strategyTitle}>{item.feiertag.name}</Text>
            {isApplied && (
              <View style={styles.appliedBadge}>
                <Text style={styles.appliedBadgeText}>✓ Eingetragen</Text>
              </View>
            )}
          </View>
          <Text style={styles.strategyDate}>{formattedDate}</Text>
        </View>

        <View style={styles.strategyDetails}>
          <View style={styles.strategyDetail}>
            <Text style={styles.strategyDetailValue}>{item.freieTage}</Text>
            <Text style={styles.strategyDetailLabel}>freie Tage</Text>
          </View>
          <View style={styles.strategyDetail}>
            <Text style={styles.strategyDetailValue}>{item.urlaubstage.length}</Text>
            <Text style={styles.strategyDetailLabel}>Urlaubstage</Text>
          </View>
        </View>

        <View style={styles.strategyDays}>
          <Text style={styles.strategyDaysLabel}>Urlaub:</Text>
          <Text style={styles.strategyDaysValue}>
            {item.urlaubstage.map(d => {
              const [, m, day] = d.split('-');
              return `${day}.${m}`;
            }).join(', ')}
          </Text>
        </View>

        {!isApplied && (
          <TouchableOpacity
            style={styles.applyBtn}
            onPress={() => handleApplyStrategy(item)}
          >
            <Text style={styles.applyBtnText}>Übernehmen</Text>
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
          keyExtractor={(item, idx) => `${item.feiertag.date}-${idx}`}
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

  listContent: { paddingHorizontal: PAGE_PADDING, paddingBottom: 32 },

  strategyCard: { backgroundColor: '#FFFBEB', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#FCD34D' },
  strategyCardApplied: { backgroundColor: colors.successBackground, borderColor: '#6EE7B7' },
  strategyHeader: { marginBottom: 12 },
  strategyTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  strategyTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
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

  applyBtn: { backgroundColor: colors.warning, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  applyBtnText: { color: colors.textInverse, fontSize: 14, fontWeight: '600' },

  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: PAGE_PADDING },
  emptyEmoji: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptyDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});



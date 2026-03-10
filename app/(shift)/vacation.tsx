import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, typography, spacing, borderRadius, accessibility } from '../../constants/theme';

// ─── Placeholder Features (werden in späteren Iterationen ausgebaut) ──────────

const COMING_SOON_FEATURES = [
  { icon: '✈️', title: 'Urlaub buchen', desc: 'Flüge und Hotels direkt in YASA planen.' },
  { icon: '📅', title: 'Urlaubstage verwalten', desc: 'Jahresübersicht und Resturlaub auf einen Blick.' },
  { icon: '🗺️', title: 'Reiseziele entdecken', desc: 'Passende Reiseziele nach Schichtplan finden.' },
  { icon: '🔔', title: 'Urlaubserinnerungen', desc: 'Automatische Reminder für Antragsfristen.' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function VacationScreen() {
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <TouchableOpacity style={styles.backRow} onPress={() => router.replace('/(services)')}>
        <Text style={styles.backLabel}>← Zurück</Text>
      </TouchableOpacity>

      <Text style={styles.hero}>🏖️</Text>
      <Text style={styles.title}>Ab in den Urlaub</Text>
      <Text style={styles.subtitle}>Dein persönlicher Urlaubsbereich</Text>

      {/* Coming Soon Banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>🚧 Dieser Bereich wird ausgebaut</Text>
        <Text style={styles.bannerBody}>
          Der Urlaubsbereich befindet sich aktuell in Entwicklung.
          Bald kannst du hier Urlaub planen, Reiseziele entdecken und
          deine freien Tage optimal mit deinem Schichtplan abstimmen.
        </Text>
      </View>

      {/* Feature-Vorschau */}
      <Text style={styles.sectionLabel}>Was dich erwartet</Text>
      {COMING_SOON_FEATURES.map((f) => (
        <View key={f.title} style={styles.featureCard}>
          <Text style={styles.featureIcon}>{f.icon}</Text>
          <View style={styles.featureText}>
            <Text style={styles.featureTitle}>{f.title}</Text>
            <Text style={styles.featureDesc}>{f.desc}</Text>
          </View>
        </View>
      ))}

      {/* Zurück */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.replace('/(services)')}
        activeOpacity={0.7}
      >
        <Text style={styles.backBtnText}>← Zurück zu Services</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    paddingTop: 56,
    paddingBottom: 48,
  },
  backRow: {
    marginBottom: spacing.lg,
  },
  backLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  hero: {
    fontSize: 64,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  // Coming Soon Banner
  banner: {
    backgroundColor: '#F0F9FF',   // sky-50
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: '#BAE6FD',       // sky-200
  },
  bannerTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: '#0369A1',             // sky-700
    marginBottom: spacing.sm,
  },
  bannerBody: {
    fontSize: typography.fontSize.sm,
    color: '#0C4A6E',             // sky-900
    lineHeight: 20,
  },
  // Feature-Vorschau
  sectionLabel: {
    fontSize: typography.fontSize.xs + 1,
    fontWeight: typography.fontWeight.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    opacity: 0.75,
  },
  featureIcon: {
    fontSize: 28,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: typography.fontSize.sm - 1,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  // Back Button
  backBtn: {
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.lg,
    backgroundColor: colors.backgroundTertiary,
    minHeight: accessibility.minTapHeight,
  },
  backBtnText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
});

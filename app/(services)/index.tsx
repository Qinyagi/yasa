import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getProfile, getSpaces, getCurrentSpaceId, getOpenSwapRequests } from '../../lib/storage';
import { checkBackendHealth } from '../../lib/backend/health';
import { resolveAvatarSeed } from '../../lib/avatarSeed';
import { MultiavatarView } from '../../components/MultiavatarView';
import type { UserProfile } from '../../types';
import { typography, spacing, borderRadius, shadows, warmHuman } from '../../constants/theme';
import { Button } from '../../components/Button';

// ─── Service Definitionen ────────────────────────────────────────────────────

interface ServiceItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  route: string;
  requiresSpace: boolean;
}

const PRIMARY_SERVICES: ServiceItem[] = [
  {
    id: 'strategy',
    icon: '💡',
    title: 'Brückentag-Strategie',
    description: 'Optimiere freie Tage mit smarten Tipps.',
    route: '/(shift)/strategy',
    requiresSpace: false,
  },
];

const TEAM_PLANNING_SERVICES: ServiceItem[] = [
  {
    id: 'info-service',
    icon: '📣',
    title: 'YASA Infoservice',
    description: 'Spaceweite Statusmeldungen zu wichtigen Team-Änderungen.',
    route: '/(services)/info-service',
    requiresSpace: true,
  },
  {
    id: 'vacation-planning',
    icon: '🌴',
    title: 'Urlaubsvorplanung',
    description: 'Wünsche fürs nächste Jahr sammeln, Konflikte erkennen und im Team abstimmen.',
    route: '/(services)/vacation-planning',
    requiresSpace: true,
  },
];

const SECONDARY_SERVICES: ServiceItem[] = [
  {
    id: 'shiftpals',
    icon: '👥',
    title: 'Meine Shiftpals',
    description: 'Sieh, wer heute mit dir arbeitet.',
    route: '/(team)/today',
    requiresSpace: true,
  },
  {
    id: 'space-members',
    icon: '🧾',
    title: 'Space-Mitglieder',
    description: 'Alle Mitglieder, Join-Timeline und Ghosts (nur Ansicht).',
    route: '/(services)/space-members',
    requiresSpace: true,
  },
  {
    id: 'pattern',
    icon: '📋',
    title: 'Mein Schichtmuster',
    description: 'Richte dein Schichtmuster ein.',
    route: '/(shift)/setup',
    requiresSpace: false,
  },
  {
    id: 'calendar',
    icon: '📅',
    title: 'Mein Kalender',
    description: 'Dein persönlicher Schichtkalender.',
    route: '/(shift)/calendar',
    requiresSpace: false,
  },
  {
    id: 'shift-colors',
    icon: '🎨',
    title: 'Schichtfarben',
    description: 'Farben für Schichtcodes individuell einstellen.',
    route: '/(services)/shift-colors',
    requiresSpace: false,
  },
  {
    id: 'swap',
    icon: '🔄',
    title: 'Schichttausch',
    description: 'Tausche Dienste mit Kollegen.',
    route: '/(swap)',
    requiresSpace: true,
  },
  {
    id: 'candidates',
    icon: '🤝',
    title: 'Swap-Kandidaten',
    description: 'Finde freie Kollegen für Tausch.',
    route: '/(swap)/candidates',
    requiresSpace: true,
  },
];

const TIMECLOCK_SERVICES: ServiceItem[] = [
  {
    id: 'timeclock',
    icon: '⏱️',
    title: 'Stempeluhr',
    description: 'Kommen/Gehen erfassen und Stempelzeiten einsehen.',
    route: '/(services)/timeclock',
    requiresSpace: false,
  },
  {
    id: 'zeitkonto',
    icon: '📊',
    title: 'Zeitkonto',
    description: 'Urlaubs- & Freizeitkonto mit Stundenübersicht und Regeln.',
    route: '/(services)/time-account',
    requiresSpace: false,
  },
];

// ─── Component ─────────────────────────────────────────────────────────────

export default function ServicesScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasSpace, setHasSpace] = useState(false);
  const [openSwapCount, setOpenSwapCount] = useState(0);
  const [backendHealth, setBackendHealth] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      Promise.all([getProfile(), getSpaces(), getCurrentSpaceId(), checkBackendHealth()]).then(
        async ([p, spaces, currentId, health]) => {
          if (!active) return;
          setProfile(p);
          setBackendHealth(health.ok ? { ok: true } : { ok: false, reason: health.reason });
          const activeSpace = currentId ? spaces.find((s) => s.id === currentId) ?? null : null;
          const memberInSpace =
            activeSpace && p
              ? activeSpace.memberProfiles.some((m) => m.id === p.id)
              : false;
          setHasSpace(memberInSpace);
          let swapCount = 0;
          if (currentId && memberInSpace) {
            const openSwaps = await getOpenSwapRequests(currentId);
            swapCount = openSwaps.length;
          }
          if (!active) return;
          setOpenSwapCount(swapCount);
          setLoading(false);
        }
      );
      return () => {
        active = false;
      };
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={warmHuman.primary} />
      </View>
    );
  }

  // ── Guard: kein Profil → Hinweis + CTA ──────────────────────────────────
  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.guardIcon}>🔒</Text>
        <Text style={styles.guardTitle}>Profil benötigt</Text>
        <Text style={styles.guardDesc}>
          Du brauchst ein ID-Profil, um YASA Services zu nutzen.
        </Text>
        <Button
          label="ID-Profil erstellen"
          onPress={() => router.replace('/(auth)/create-profile')}
          fullWidth
          variant="hero"
        />
        <Button
          label="Zurück zum Start"
          onPress={handleBackToStart}
          variant="subtle"
          fullWidth
        />
      </View>
    );
  }

  function handleOpenService(service: ServiceItem) {
    if (service.requiresSpace && !hasSpace) {
      router.push('/(space)/choose');
      return;
    }
    if (service.id === 'candidates') {
      router.push({
        pathname: '/(swap)/candidates',
        params: { returnTo: '/(services)' },
      });
      return;
    }
    router.push(service.route as `/${string}`);
  }

  function handleBackToStart() {
    router.replace('/start');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Services</Text>
        <View style={styles.profileRow}>
          <MultiavatarView
            seed={resolveAvatarSeed(profile.id, profile.displayName, profile.avatarUrl)}
            size={28}
          />
          <Text style={styles.profileName}>{profile.displayName}</Text>
        </View>
      </View>

      {backendHealth && (
        <View style={[styles.backendStatusCard, backendHealth.ok ? styles.backendOk : styles.backendFail]}>
          <Text style={styles.backendStatusTitle}>
            {backendHealth.ok ? 'Backend verbunden' : 'Backend nicht erreichbar'}
          </Text>
          {!backendHealth.ok && backendHealth.reason && (
            <Text style={styles.backendStatusDesc}>{backendHealth.reason}</Text>
          )}
        </View>
      )}

      {/* Space-Hinweis wenn keiner vorhanden */}
      {!hasSpace && (
        <View style={styles.spaceHint}>
          <Text style={styles.spaceHintIcon}>⚠️</Text>
          <View style={styles.spaceHintContent}>
            <Text style={styles.spaceHintTitle}>Kein aktiver Space</Text>
            <Text style={styles.spaceHintDesc}>
              Wähle oder erstelle einen Space, um alle Services zu nutzen.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.spaceHintBtn}
            onPress={() => router.push('/(space)/choose')}
          >
            <Text style={styles.spaceHintBtnText}>→</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Time Clock Zone ─────────────────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Zeiterfassung</Text>
      </View>

      <View style={styles.primaryServices}>
        {TIMECLOCK_SERVICES.map((service) => (
          <TouchableOpacity
            key={service.id}
            testID={`services-primary-${service.id}`}
            style={styles.primaryServiceCard}
            onPress={() => handleOpenService(service)}
            activeOpacity={0.85}
          >
            <View style={styles.primaryServiceContent}>
              <Text style={styles.primaryServiceIcon}>{service.icon}</Text>
              <View style={styles.primaryServiceInfo}>
                <Text style={styles.primaryServiceTitle}>{service.title}</Text>
                <Text style={styles.primaryServiceDesc}>{service.description}</Text>
              </View>
            </View>
            <Text style={styles.primaryServiceArrow}>→</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Primary Services Zone ────────────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Produktivität</Text>
      </View>

      <View style={styles.primaryServices}>
        {PRIMARY_SERVICES.map((service) => (
          <TouchableOpacity
            key={service.id}
            testID={`services-primary-${service.id}`}
            style={styles.primaryServiceCard}
            onPress={() => handleOpenService(service)}
            activeOpacity={0.85}
          >
            <View style={styles.primaryServiceContent}>
              <Text style={styles.primaryServiceIcon}>{service.icon}</Text>
              <View style={styles.primaryServiceInfo}>
                <Text style={styles.primaryServiceTitle}>{service.title}</Text>
                <Text style={styles.primaryServiceDesc}>{service.description}</Text>
              </View>
            </View>
            <Text style={styles.primaryServiceArrow}>→</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Team Planning Zone ──────────────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Teamplanung</Text>
      </View>

      <View style={styles.primaryServices}>
        {TEAM_PLANNING_SERVICES.map((service) => {
          const isDisabled = service.requiresSpace && !hasSpace;
          return (
            <TouchableOpacity
              key={service.id}
              testID={`services-team-planning-${service.id}`}
              style={[styles.teamPlanningCard, isDisabled && styles.secondaryServiceCardDisabled]}
              onPress={() => handleOpenService(service)}
              activeOpacity={0.85}
              disabled={isDisabled}
            >
              <View style={styles.primaryServiceContent}>
                <Text style={styles.teamPlanningIcon}>{service.icon}</Text>
                <View style={styles.primaryServiceInfo}>
                  <View style={styles.teamPlanningTitleRow}>
                    <Text style={styles.teamPlanningTitle}>{service.title}</Text>
                    <View style={styles.teamPlanningBadge}>
                      <Text style={styles.teamPlanningBadgeText}>Team</Text>
                    </View>
                  </View>
                  <Text style={styles.teamPlanningDesc}>{service.description}</Text>
                  {isDisabled && (
                    <Text style={styles.disabledHint}>Space benötigt</Text>
                  )}
                </View>
              </View>
              <Text style={isDisabled ? styles.secondaryServiceArrowDisabled : styles.primaryServiceArrow}>
                →
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Secondary Services Zone ───────────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Weitere Services</Text>
      </View>

      <View style={styles.secondaryServices}>
        {SECONDARY_SERVICES.map((service) => {
          const isDisabled = service.requiresSpace && !hasSpace;
          return (
            <TouchableOpacity
              key={service.id}
              testID={`services-secondary-${service.id}`}
              style={[styles.secondaryServiceCard, isDisabled && styles.secondaryServiceCardDisabled]}
              onPress={() => handleOpenService(service)}
              activeOpacity={0.7}
              disabled={isDisabled}
            >
              <View style={styles.secondaryServiceContent}>
                <Text style={styles.secondaryServiceIcon}>{service.icon}</Text>
                <View style={styles.secondaryServiceInfo}>
                  <View style={styles.secondaryServiceTitleRow}>
                    <Text style={styles.secondaryServiceTitle}>{service.title}</Text>
                    {service.id === 'swap' && openSwapCount > 0 && (
                      <View style={styles.swapBadge}>
                        <Text style={styles.swapBadgeText}>{openSwapCount}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.secondaryServiceDesc}>{service.description}</Text>
                  {isDisabled && (
                    <Text style={styles.disabledHint}>Space benötigt</Text>
                  )}
                </View>
              </View>
              <Text style={isDisabled ? styles.secondaryServiceArrowDisabled : styles.secondaryServiceArrow}>
                →
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Premium Urlaub Section ───────────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Urlaub & Freizeit</Text>
      </View>

      <View style={styles.vacationCard}>
        <View style={styles.vacationHeaderRow}>
          <Text style={styles.vacationEyebrow}>Zeit für dich</Text>
          <View style={styles.vacationBadge}>
            <Text style={styles.vacationBadgeText}>Top-Feature</Text>
          </View>
        </View>
        <Text style={styles.vacationCardTitle}>Ab in den Urlaub</Text>
        <Text style={styles.vacationCardDesc}>
          Plane deine Auszeit smart, finde passende Angebote und starte direkt aus YASA.
        </Text>
        <View style={styles.vacationPills}>
          <View style={styles.vacationPill}>
            <Text style={styles.vacationPillText}>🌴 Planung</Text>
          </View>
          <View style={styles.vacationPill}>
            <Text style={styles.vacationPillText}>🏖️ Erholung</Text>
          </View>
          <View style={styles.vacationPill}>
            <Text style={styles.vacationPillText}>✈️ Inspiration</Text>
          </View>
        </View>
        <View style={styles.vacationActions}>
          <TouchableOpacity
            style={styles.vacationPrimaryBtn}
            onPress={() => router.push('/(shift)/vacation')}
            activeOpacity={0.85}
          >
            <Text style={styles.vacationPrimaryBtnText}>Urlaub planen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.vacationSecondaryBtn}
            onPress={() => router.push('/(affiliate)')}
            activeOpacity={0.85}
          >
            <Text style={styles.vacationSecondaryBtnText}>Angebote entdecken</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.vacationNoteText}>
          Reisen & Freizeit ist direkt im Urlaubsbereich integriert.
        </Text>
      </View>

      {/* ── Back Button ────────────────────────────────────────────────── */}
      <Button
        label="Zurück zum Start"
        onPress={handleBackToStart}
        variant="subtle"
        fullWidth
        style={styles.backButton}
      />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: warmHuman.surface,
    padding: spacing.lg,
  },
  container: {
    flexGrow: 1,
    backgroundColor: warmHuman.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  // Header
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
    marginBottom: spacing.sm,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  profileName: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  backendStatusCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  backendOk: {
    backgroundColor: warmHuman.primaryLight,
    borderColor: warmHuman.primary,
  },
  backendFail: {
    backgroundColor: warmHuman.accentLight,
    borderColor: warmHuman.accent,
  },
  backendStatusTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: warmHuman.ink,
  },
  backendStatusDesc: {
    marginTop: 4,
    fontSize: typography.fontSize.xs,
    color: warmHuman.textSecondary,
  },
  // Section Headers
  sectionHeader: {
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  sectionLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: warmHuman.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Space Hint
  spaceHint: {
    backgroundColor: warmHuman.accentLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: warmHuman.accent,
  },
  spaceHintIcon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  spaceHintContent: {
    flex: 1,
  },
  spaceHintTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: warmHuman.ink,
    marginBottom: 2,
  },
  spaceHintDesc: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textSecondary,
  },
  spaceHintBtn: {
    backgroundColor: warmHuman.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  spaceHintBtnText: {
    color: warmHuman.ink,
    fontWeight: typography.fontWeight.bold,
  },
  // Primary Services
  primaryServices: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  primaryServiceCard: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    ...shadows.md,
  },
  primaryServiceContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  primaryServiceIcon: {
    fontSize: 32,
    marginRight: spacing.md,
  },
  primaryServiceInfo: {
    flex: 1,
  },
  primaryServiceTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
    marginBottom: 2,
  },
  primaryServiceDesc: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
  },
  primaryServiceArrow: {
    fontSize: 20,
    color: warmHuman.primary,
    fontWeight: typography.fontWeight.bold,
  },
  // Team Planning
  teamPlanningCard: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: warmHuman.primary,
    ...shadows.md,
  },
  teamPlanningIcon: {
    fontSize: 34,
    marginRight: spacing.md,
  },
  teamPlanningTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: 2,
  },
  teamPlanningTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.primary,
  },
  teamPlanningBadge: {
    backgroundColor: warmHuman.surfaceWarm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  teamPlanningBadgeText: {
    color: warmHuman.ink,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  teamPlanningDesc: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    lineHeight: 20,
  },
  // Secondary Services
  secondaryServices: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  secondaryServiceCard: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    ...shadows.sm,
  },
  secondaryServiceCardDisabled: {
    opacity: 0.5,
  },
  secondaryServiceContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  secondaryServiceIcon: {
    fontSize: 24,
    marginRight: spacing.sm,
  },
  secondaryServiceInfo: {
    flex: 1,
  },
  secondaryServiceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  secondaryServiceTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: warmHuman.ink,
  },
  swapBadge: {
    backgroundColor: warmHuman.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  swapBadgeText: {
    color: warmHuman.ink,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  secondaryServiceDesc: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textSecondary,
    marginTop: 2,
  },
  disabledHint: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.accent,
    fontWeight: typography.fontWeight.medium,
    marginTop: 2,
  },
  secondaryServiceArrow: {
    fontSize: 18,
    color: warmHuman.textMuted,
  },
  secondaryServiceArrowDisabled: {
    fontSize: 18,
    color: warmHuman.textMuted,
    opacity: 0.5,
  },
  // Vacation Card (Premium)
  vacationCard: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    ...shadows.md,
  },
  vacationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  vacationEyebrow: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: typography.fontWeight.medium,
  },
  vacationBadge: {
    backgroundColor: warmHuman.accent,
    borderRadius: borderRadius.full,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  vacationBadgeText: {
    color: warmHuman.ink,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  vacationCardTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.primary,
    marginBottom: spacing.xs,
  },
  vacationCardDesc: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  vacationPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  vacationPill: {
    backgroundColor: warmHuman.surfaceWarm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  vacationPillText: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.ink,
    fontWeight: typography.fontWeight.medium,
  },
  vacationActions: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  vacationPrimaryBtn: {
    backgroundColor: warmHuman.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  vacationPrimaryBtnText: {
    color: warmHuman.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  vacationSecondaryBtn: {
    backgroundColor: warmHuman.surfaceWarm,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
  },
  vacationSecondaryBtnText: {
    color: warmHuman.ink,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  vacationNoteText: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textMuted,
    lineHeight: 18,
  },
  // Back Button
  backButton: {
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  // Guard Styles
  guardIcon: {
    fontSize: 56,
    marginBottom: spacing.lg,
  },
  guardTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
    marginBottom: spacing.sm,
  },
  guardDesc: {
    fontSize: typography.fontSize.base,
    color: warmHuman.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
});

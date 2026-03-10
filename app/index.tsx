import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  getProfile,
  getSpaces,
  getShiftPlan,
  getCurrentSpaceId,
  getOpenSwapRequests,
} from '../lib/storage';
import { MultiavatarView } from '../components/MultiavatarView';
import type { UserProfile } from '../types';
import { typography, spacing, borderRadius, shadows, warmHuman } from '../constants/theme';
import { logInfo } from '../lib/log';
import { Button } from '../components/Button';

export default function StartScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasSpaces, setHasSpaces] = useState(false);
  const [hasShiftPlan, setHasShiftPlan] = useState(false);
  const [openSwapCount, setOpenSwapCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Lade alle nötigen Daten bei jedem Focus
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);

      async function load() {
        logInfo('StartScreen', 'loadCurrentContext');
        const p = await getProfile();
        const s = await getSpaces();
        let hasShift = false;
        let swapCount = 0;
        if (p) {
          const plan = await getShiftPlan(p.id);
          hasShift = plan !== null && plan.pattern.length > 0;
          // Swap-Badge: offene Anfragen im aktuellen Space zaehlen
          const currentId = await getCurrentSpaceId();
          if (currentId) {
            const openSwaps = await getOpenSwapRequests(currentId);
            swapCount = openSwaps.length;
          }
        }
        if (!active) return;
        setProfile(p);
        setHasSpaces(s.length > 0);
        setHasShiftPlan(hasShift);
        setOpenSwapCount(swapCount);
        setLoading(false);
      }

      load();
      return () => { active = false; };
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.titleHero}>YASA</Text>
        <Text style={styles.subtitleHero}>Dein Schichtbegleiter</Text>
        <ActivityIndicator size="large" color={warmHuman.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Hero / Identity Bereich */}
      <View style={styles.heroSection}>
        <Text style={styles.titleHero}>YASA</Text>
        <Text style={styles.subtitleHero}>Dein Schichtbegleiter</Text>
      </View>

      {profile ? (
        <>
          {/* Profil-Card integriert im Hero */}
          <View style={styles.profileCard}>
            <View style={styles.profileRow}>
              <MultiavatarView uri={profile.avatarUrl} size={48} />
              <View style={styles.profileInfo}>
                <Text style={styles.profileLabel}>Angemeldet als</Text>
                <Text style={styles.profileName}>{profile.displayName}</Text>
              </View>
            </View>
          </View>

          {/* Swap-Badge Banner */}
          {openSwapCount > 0 && (
            <TouchableOpacity
              style={styles.swapBanner}
              onPress={() => router.push('/(swap)')}
              activeOpacity={0.7}
            >
              <View style={styles.swapBadge}>
                <Text style={styles.swapBadgeText}>{openSwapCount}</Text>
              </View>
              <Text style={styles.swapBannerText}>
                {openSwapCount === 1
                  ? '1 offene Tauschanfrage'
                  : `${openSwapCount} offene Tauschanfragen`}
              </Text>
            </TouchableOpacity>
          )}

          {/* Hinweise wenn Space oder Shift fehlt */}
          {!hasSpaces && (
            <Text style={styles.hintText}>
              Du hast noch keinen Space. Erstelle einen oder trete einem bei.
            </Text>
          )}
          {hasSpaces && !hasShiftPlan && (
            <Text style={styles.hintText}>
              Richte deinen Schichtplan ein, um alle Features zu nutzen.
            </Text>
          )}

          {/* Primary Action Zone */}
          <View style={styles.sectionLabel}>
            <Text style={styles.sectionLabelText}>Aktionen</Text>
          </View>
          
          <View style={styles.primaryActions}>
            {/* YASA Services - Hero Card */}
            <TouchableOpacity
              style={styles.heroCard}
              onPress={() => router.push('/(services)')}
              activeOpacity={0.85}
            >
              <View style={styles.heroCardContent}>
                <Text style={styles.heroCardIcon}>✨</Text>
                <Text style={styles.heroCardTitle}>YASA Services</Text>
                <Text style={styles.heroCardDesc}>
                  Alle Features im Überblick
                </Text>
              </View>
              <Text style={styles.heroCardArrow}>→</Text>
            </TouchableOpacity>

            {/* Mein Kalender - Secondary Hero Card */}
            <TouchableOpacity
              style={styles.secondaryHeroCard}
              onPress={() => router.push('/(shift)/calendar')}
              activeOpacity={0.85}
            >
              <View style={styles.heroCardContent}>
                <Text style={styles.heroCardIcon}>📅</Text>
                <Text style={styles.secondaryHeroCardTitle}>Mein Kalender</Text>
                <Text style={styles.secondaryHeroCardDesc}>
                  Schichtplan im Blick
                </Text>
              </View>
              <Text style={styles.secondaryHeroCardArrow}>→</Text>
            </TouchableOpacity>
          </View>

          {/* Secondary Action Zone */}
          <View style={styles.secondaryActions}>
            {/* Mein Space */}
            <TouchableOpacity
              style={styles.secondaryActionCard}
              onPress={() => router.push('/(space)/choose')}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryActionIcon}>🏠</Text>
              <Text style={styles.secondaryActionText}>
                {hasSpaces ? 'Mein Space' : 'Space beitreten'}
              </Text>
            </TouchableOpacity>

            {/* Admin Bereich */}
            <TouchableOpacity
              style={styles.secondaryActionCard}
              onPress={() => router.push('/(admin)')}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryActionIcon}>🔐</Text>
              <Text style={styles.secondaryActionText}>Admin</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        // ── Kein Profil ──────────────────────────────────────────────
        <>
          <Text style={styles.welcomeText}>
            Willkommen bei YASA! Erstelle ein Profil, um zu starten.
          </Text>
          <Button
            label="ID-Profil erstellen"
            onPress={() => router.push('/(auth)/create-profile')}
            fullWidth
            variant="hero"
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: warmHuman.surface,
    paddingHorizontal: spacing.lg,
  },
  container: {
    flexGrow: 1,
    backgroundColor: warmHuman.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing['2xl'],
  },
  // Hero Section
  heroSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  titleHero: {
    fontSize: typography.fontSize['5xl'],
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
    color: warmHuman.ink,
  },
  subtitleHero: {
    fontSize: typography.fontSize.lg,
    color: warmHuman.textSecondary,
  },
  // Profile Card
  profileCard: {
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    ...shadows.md,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileInfo: {
    flex: 1,
  },
  profileLabel: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textMuted,
    marginBottom: 2,
  },
  profileName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: warmHuman.ink,
  },
  // Section Label
  sectionLabel: {
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  sectionLabelText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: warmHuman.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Hint Text
  hintText: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  // Primary Actions
  primaryActions: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  heroCard: {
    backgroundColor: warmHuman.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.lg,
  },
  heroCardContent: {
    flex: 1,
  },
  heroCardIcon: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  heroCardTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.textInverse,
    marginBottom: 2,
  },
  heroCardDesc: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  heroCardArrow: {
    fontSize: 24,
    color: warmHuman.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
  secondaryHeroCard: {
    backgroundColor: warmHuman.accent,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.md,
  },
  secondaryHeroCardTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
    marginBottom: 2,
  },
  secondaryHeroCardDesc: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.inkLight,
  },
  secondaryHeroCardArrow: {
    fontSize: 24,
    color: warmHuman.ink,
    fontWeight: typography.fontWeight.bold,
  },
  // Secondary Actions
  secondaryActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  secondaryActionCard: {
    flex: 1,
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    ...shadows.sm,
  },
  secondaryActionIcon: {
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  secondaryActionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: warmHuman.textSecondary,
    textAlign: 'center',
  },
  // Swap Banner
  swapBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: warmHuman.accentLight,
    borderRadius: borderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: warmHuman.accent,
    gap: spacing.sm,
  },
  swapBadge: {
    backgroundColor: warmHuman.accent,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  swapBadgeText: {
    color: warmHuman.ink,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  swapBannerText: {
    color: warmHuman.ink,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    flex: 1,
  },
  // Welcome
  welcomeText: {
    color: warmHuman.textSecondary,
    fontSize: typography.fontSize.base,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
});

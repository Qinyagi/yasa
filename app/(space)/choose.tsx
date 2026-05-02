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
import { getCurrentSpaceId, getProfile, getSpaces, setSpaces as saveSpaces } from '../../lib/storage';
import { syncTeamSpaces } from '../../lib/backend/teamSync';
import { useRealtimeMemberSync } from '../../lib/backend/realtimeMembers';
import { MultiavatarView } from '../../components/MultiavatarView';
import { resolveAvatarSeed } from '../../lib/avatarSeed';
import type { UserProfile, Space } from '../../types';
import { colors, typography, spacing, borderRadius, accessibility } from '../../constants/theme';

export default function ChooseScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // useFocusEffect: reload bei jedem Screen-Fokus → sofort nach Create sichtbar
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      Promise.all([getProfile(), getSpaces(), getCurrentSpaceId()]).then(async ([p, s, activeSpaceId]) => {
        if (active) {
          let resolvedSpaces = s;
          if (p) {
            try {
              const syncResult = await syncTeamSpaces(p.id, s, { allowCached: true, ttlMs: 10_000 });
              resolvedSpaces = syncResult.spaces;
              await saveSpaces(resolvedSpaces);
              setSyncMessage(
                `Team-Sync aktiv: lokal ${syncResult.pushedCount}, backend ${syncResult.pulledCount}`
              );
            } catch (error) {
              const reason = error instanceof Error ? error.message : 'unbekannter Sync-Fehler';
              setSyncMessage(`Team-Sync eingeschränkt: ${reason}`);
            }
          } else {
            setSyncMessage(null);
          }
          setProfile(p);
          setSpaces(resolvedSpaces);
          setCurrentSpaceId(activeSpaceId);
          setLoading(false);
        }
      });
      return () => {
        active = false;
      };
    }, [])
  );

  // Realtime member sync: listen to member changes for all spaces
  // This ensures choose.tsx shows fresh member counts without manual refresh
  useRealtimeMemberSync(
    profile?.id,
    spaces.map((s) => s.id),
    useCallback(async () => {
      if (!profile) return;
      const localSpaces = await getSpaces();
      try {
        const syncResult = await syncTeamSpaces(profile.id, localSpaces);
        const updated = syncResult.spaces;
        await saveSpaces(updated);
        setSpaces(updated);
      } catch {
        // best-effort — focus-sync on next focus will recover
      }
    }, [profile?.id])
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <Text style={styles.title}>Deine Spaces</Text>
      {profile && (
        <View style={styles.profileRow}>
          <MultiavatarView
            seed={resolveAvatarSeed(profile.id, profile.displayName, profile.avatarUrl)}
            size={32}
          />
          <Text style={styles.profileHint}>
            <Text style={styles.profileName}>{profile.displayName}</Text>
          </Text>
        </View>
      )}
      {syncMessage && <Text style={styles.syncHint}>{syncMessage}</Text>}

      {spaces.length === 0 ? (
        // ── Kein Space vorhanden ────────────────────────────────────
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>Du bist noch in keinem Space.</Text>

          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/(space)/create')}
          >
            <Text style={styles.buttonText}>Space erstellen</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={() => router.push('/(space)/join')}
          >
            <Text style={styles.buttonText}>Per QR beitreten</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // ── Space(s) vorhanden ───────────────────────────────────────
        <>
          {spaces.map((space) => {
            const profileId = profile?.id ?? '';
            const isOwner = profileId === space.ownerProfileId;
            const isCoAdmin = space.coAdminProfileIds.includes(profileId);
            const isMember = space.memberProfileIds.includes(profileId);
            const memberCount = space.memberProfileIds.length;
            const isActiveSpace = currentSpaceId === space.id;

            // Kann QR sehen: Owner oder CoAdmin
            const canSeeQR = isOwner || isCoAdmin;

            // Rollenbezeichnung: Owner > CoAdmin > Mitglied > Gast
            const roleLabel = isOwner
              ? 'Host'
              : isCoAdmin
              ? 'CoAdmin'
              : isMember
              ? 'Mitglied'
              : 'Gast';
            const roleStyle = isOwner
              ? styles.roleOwner
              : isCoAdmin
              ? styles.roleCoAdmin
              : styles.roleMember;

            return (
              <View key={space.id} style={styles.spaceCard}>
                <Text style={styles.spaceName}>{space.name}</Text>
                <Text style={[styles.activeSpaceHint, isActiveSpace && styles.activeSpaceHintOn]}>
                  {isActiveSpace ? 'Aktiver Arbeits-Space' : 'Nicht aktiv'}
                </Text>
                <View style={styles.spaceMetaRow}>
                  <View style={[styles.roleBadge, roleStyle]}>
                    <Text style={styles.roleBadgeText}>{roleLabel}</Text>
                  </View>
                  <Text style={styles.spaceOwnerText}>
                    Host: {space.ownerDisplayName}
                  </Text>
                  <Text style={styles.memberCount}>👥 {memberCount}</Text>
                </View>

                {isActiveSpace ? (
                  <View style={styles.btnRow}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnShift]}
                      onPress={() => router.push('/(shift)/setup')}
                    >
                      <Text style={styles.btnShiftText}>📋 Dienstplan</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnToday]}
                      onPress={() => router.push('/(team)/today')}
                    >
                      <Text style={styles.btnTodayText}>👥 Heute im Team</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.inactiveBox}>
                    <Text style={styles.inactiveText}>
                      Schreibzugriff ist nur im aktiven Space möglich.
                    </Text>
                  </View>
                )}

                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={[styles.btn, isActiveSpace ? styles.btnAdmin : styles.btnActivate]}
                    onPress={() => router.push('/(admin)')}
                  >
                    <Text style={styles.btnAdminText}>
                      {isActiveSpace ? '🔐 Admin Bereich' : '🔐 Im Admin aktivieren'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <TouchableOpacity
            style={[styles.button, { marginTop: 16 }]}
            onPress={() => router.push('/(space)/create')}
          >
            <Text style={styles.buttonText}>Weiteren Space erstellen</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, { marginTop: 12 }]}
            onPress={() => router.push('/(space)/join')}
          >
            <Text style={styles.buttonText}>Per QR beitreten</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity
        style={[styles.button, styles.buttonBack, { marginTop: 24 }]}
        onPress={() => router.replace('/')}
      >
        <Text style={styles.buttonText}>Zurück zum Start</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  profileHint: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  syncHint: {
    width: '100%',
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textAlign: 'left',
  },
  profileName: {
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.sm,
  },
  emptyBox: {
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  spaceCard: {
    width: '100%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#C7D7FD',
  },
  spaceName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  activeSpaceHint: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  activeSpaceHintOn: {
    color: colors.primary,
  },
  spaceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
  },
  roleBadge: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  roleOwner: {
    backgroundColor: colors.primary,
  },
  roleMember: {
    backgroundColor: colors.secondary,
  },
  roleCoAdmin: {
    backgroundColor: '#7C3AED',
  },
  roleBadgeText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  spaceOwnerText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  memberCount: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginLeft: 'auto',
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  btn: {
    flex: 1,
    minHeight: 52,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: colors.primary,
  },
  btnAdmin: {
    backgroundColor: '#7C3AED',
    flex: 1,
  },
  btnActivate: {
    backgroundColor: '#0F766E',
    flex: 1,
  },
  btnAdminText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
  },
  btnShift: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  btnShiftText: {
    color: '#065F46',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
  },
  btnToday: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  btnTodayText: {
    color: colors.primaryDark,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
  },
  inactiveBox: {
    width: '100%',
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  inactiveText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    lineHeight: 19,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.md,
    minHeight: accessibility.minTapHeight,
  },
  buttonSecondary: {
    backgroundColor: colors.secondary,
  },
  buttonBack: {
    backgroundColor: colors.secondaryLight,
  },
  buttonText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
  },
});

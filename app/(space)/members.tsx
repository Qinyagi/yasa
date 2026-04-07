/**
 * members.tsx – Space-Mitgliederliste (HOST-ONLY)
 *
 * Zeigt für jeden Mitglied:
 * - Großen Avatar (~72 px), Name, Rollenabzeichen
 * - Beitrittszeitpunkt + Einladeweg (via Host / via Co-Admin: <Name>)
 * - Co-Admin-Toggle (für aktive Nicht-Host-Mitglieder)
 * - Entfernte Mitglieder in separatem Verlauf-Abschnitt mit removedAt
 *
 * Zugriffsschutz:
 * - Nur zugänglich für profile.id === activeSpace.ownerProfileId
 * - Anderen Rollen (Co-Admin, Mitglied) wird eine Zugang-verweigert-Seite gezeigt
 *   und sie werden nicht zu diesem Screen weitergeleitet.
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  getProfile,
  getSpaces,
  setSpaces,
  updateCoAdmins,
} from '../../lib/storage';
import { syncTeamSpaces } from '../../lib/backend/teamSync';
import { MultiavatarView } from '../../components/MultiavatarView';
import { resolveAvatarSeed } from '../../lib/avatarSeed';
import type { Space, UserProfile, MemberLifecycleEntry } from '../../types';
import { colors, typography, spacing, borderRadius } from '../../constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MembersScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace(`/(space)/manage?spaceId=${spaceId ?? ''}`);
  }, [navigation, router, spaceId]);

  const [loading, setLoading] = useState(true);
  const [space, setSpace] = useState<Space | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [coAdmins, setCoAdmins] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!spaceId) {
      setLoading(false);
      return;
    }

    const [p, localSpaces] = await Promise.all([getProfile(), getSpaces()]);
    setProfile(p);

    // Best-effort sync: refresh member list + history from backend
    let spaces = localSpaces;
    if (p) {
      try {
        const syncResult = await syncTeamSpaces(p.id, localSpaces);
        spaces = syncResult.spaces;
        await setSpaces(spaces);
      } catch {
        // best-effort – continue with local data
      }
    }

    const found = spaces.find((s) => s.id === spaceId) ?? null;
    setSpace(found);
    setCoAdmins(found?.coAdminProfileIds ?? []);
    setLoading(false);
  }, [spaceId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      loadData().then(() => {
        if (!active) return;
      });
      return () => {
        active = false;
      };
    }, [loadData])
  );

  async function handleToggleCoAdmin(memberId: string) {
    if (!space || saving) return;
    // Prevent toggling removed/inactive members
    const history = space.memberHistory ?? [];
    const entry = history.find((h) => h.id === memberId);
    if (entry && !entry.active) return;

    const next = coAdmins.includes(memberId)
      ? coAdmins.filter((id) => id !== memberId)
      : [...coAdmins, memberId];

    setCoAdmins(next);
    setSaving(true);
    await updateCoAdmins(space.id, next);
    setSaving(false);
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── Space nicht gefunden ─────────────────────────────────────────────────────
  if (!space) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Space nicht gefunden.</Text>
        <TouchableOpacity style={styles.button} onPress={handleBack}>
          <Text style={styles.buttonText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── HOST-ONLY GUARD ──────────────────────────────────────────────────────────
  // Co-Admins und reguläre Mitglieder haben keinen Zugriff auf diese Seite.
  if (!profile || profile.id !== space.ownerProfileId) {
    return (
      <View style={styles.center}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.guardTitle}>Kein Zugriff</Text>
        <Text style={styles.guardDesc}>
          Diese Seite ist ausschließlich für den Space-Host zugänglich.
          Co-Admins und Member haben hier keinen Zutritt.
        </Text>
        <TouchableOpacity style={styles.button} onPress={handleBack}>
          <Text style={styles.buttonText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Data preparation ─────────────────────────────────────────────────────────
  const history: MemberLifecycleEntry[] = space.memberHistory ?? [];
  const activeEntries = history.filter((h) => h.active !== false);
  const removedEntries = history.filter((h) => h.active === false);

  // Current snapshot map for live avatar/name data
  const snapshotMap = new Map(space.memberProfiles.map((m) => [m.id, m]));

  function inviterLabel(joinedViaProfileId: string): string {
    if (joinedViaProfileId === space!.ownerProfileId) return 'via Host';
    // Check current members then history for the inviter's name
    const inviterSnapshot = snapshotMap.get(joinedViaProfileId);
    if (inviterSnapshot) return `via Co-Admin: ${inviterSnapshot.displayName}`;
    const inviterHistory = history.find((h) => h.id === joinedViaProfileId);
    if (inviterHistory) return `via Co-Admin: ${inviterHistory.displayName}`;
    return 'via Einladung';
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <Text style={styles.title}>{space.name}</Text>
      <Text style={styles.subtitle}>Memberliste</Text>

      {/* ── Active Members ────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>
        Aktive Member ({activeEntries.length})
      </Text>

      {activeEntries.length === 0 ? (
        <Text style={styles.metaText}>Keine aktiven Member.</Text>
      ) : (
        activeEntries.map((entry) => {
          const snapshot = snapshotMap.get(entry.id);
          const displayName = snapshot?.displayName ?? entry.displayName;
          const avatarUrl = snapshot?.avatarUrl ?? entry.avatarUrl;
          const seed = resolveAvatarSeed(entry.id, displayName, avatarUrl);
          const isOwner = entry.id === space.ownerProfileId;
          const isCoAdmin = coAdmins.includes(entry.id);

          return (
            <View key={entry.id} style={styles.memberCard}>
              <View style={styles.cardRow}>
                {/* Large Avatar (~1/3 card width) */}
                <View style={styles.avatarWrap}>
                  <MultiavatarView seed={seed} size={72} />
                </View>

                {/* Info column */}
                <View style={styles.cardInfo}>
                  {/* Name + Role badge */}
                  <View style={styles.nameRow}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {displayName}
                    </Text>
                    <View
                      style={[
                        styles.roleBadge,
                        isOwner
                          ? styles.roleHost
                          : isCoAdmin
                          ? styles.roleCoAdmin
                          : styles.roleMember,
                      ]}
                    >
                      <Text style={styles.roleBadgeText}>
                        {isOwner ? 'Host' : isCoAdmin ? 'CoAdmin' : 'Member'}
                      </Text>
                    </View>
                  </View>

                  {/* Lifecycle metadata */}
                  <Text style={styles.metaText}>
                    Beigetreten: {formatTimestamp(entry.joinedAt)}
                  </Text>
                  <Text style={styles.metaText}>
                    {inviterLabel(entry.joinedViaProfileId)}
                  </Text>

                  {/* Co-Admin toggle — Host cannot be toggled */}
                  {!isOwner && (
                    <View style={styles.coAdminRow}>
                      <Text style={styles.coAdminLabel}>Co-Admin</Text>
                      <Switch
                        value={isCoAdmin}
                        onValueChange={() => handleToggleCoAdmin(entry.id)}
                        trackColor={{
                          false: colors.grayLight,
                          true: colors.primaryVariant,
                        }}
                        thumbColor={
                          isCoAdmin ? colors.primary : colors.textTertiary
                        }
                        disabled={saving}
                      />
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        })
      )}

      {saving && (
        <Text style={styles.savingText}>Speichern…</Text>
      )}

      {/* ── Removed / History ─────────────────────────────────────────── */}
      {removedEntries.length > 0 && (
        <>
          <View style={styles.sectionDivider} />
          <Text style={styles.sectionLabel}>
            Verlauf – Entfernte Member ({removedEntries.length})
          </Text>
          {removedEntries.map((entry) => (
            <View key={entry.id} style={[styles.memberCard, styles.memberCardRemoved]}>
              <View style={styles.removedStripeWrap}>
                <Text style={styles.removedStripeText}>AUSGETRETEN</Text>
              </View>
              <View style={styles.cardRow}>
                {/* Smaller avatar for removed members */}
                <View style={[styles.avatarWrap, styles.avatarWrapRemoved]}>
                  <MultiavatarView
                    seed={resolveAvatarSeed(entry.id, entry.displayName, entry.avatarUrl)}
                    size={56}
                  />
                </View>
                <View style={styles.cardInfo}>
                  <View style={styles.nameRow}>
                    <Text
                      style={[styles.memberName, styles.memberNameRemoved]}
                      numberOfLines={1}
                    >
                      {entry.displayName}
                    </Text>
                    <View style={styles.roleRemoved}>
                      <Text style={styles.roleRemovedText}>Entfernt</Text>
                    </View>
                  </View>
                  <Text style={styles.metaText}>
                    Beigetreten: {formatTimestamp(entry.joinedAt)}
                  </Text>
                  {entry.removedAt && (
                    <Text style={[styles.metaText, styles.removedAtText]}>
                      Entfernt: {formatTimestamp(entry.removedAt)}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Back button with safe bottom spacing */}
      <TouchableOpacity
        style={[styles.button, styles.buttonBack]}
        onPress={handleBack}
      >
        <Text style={styles.buttonBackText}>← Zurück</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
    paddingTop: 60,
    paddingBottom: 48,
  },

  // ── Header ──────────────────────────────────────────────────────────
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },

  // ── Section Labels ───────────────────────────────────────────────────
  sectionLabel: {
    alignSelf: 'flex-start',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.secondaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  sectionDivider: {
    width: '100%',
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xl,
  },

  // ── Member Cards ─────────────────────────────────────────────────────
  memberCard: {
    width: '100%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memberCardRemoved: {
    backgroundColor: colors.backgroundTertiary,
    borderColor: colors.grayLight,
    opacity: 0.75,
    overflow: 'hidden',
    position: 'relative',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  avatarWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarWrapRemoved: {
    width: 56,
    height: 56,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  memberName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  memberNameRemoved: {
    color: colors.textTertiary,
  },

  // ── Role Badges ──────────────────────────────────────────────────────
  roleBadge: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  roleHost: {
    backgroundColor: colors.primary,
  },
  roleCoAdmin: {
    backgroundColor: colors.purple,
  },
  roleMember: {
    backgroundColor: '#16A34A',
  },
  roleBadgeText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  roleRemoved: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: colors.grayDark,
  },
  roleRemovedText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },

  // ── Metadata ─────────────────────────────────────────────────────────
  metaText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  removedAtText: {
    color: colors.error,
  },
  removedStripeWrap: {
    position: 'absolute',
    top: 10,
    right: -38,
    backgroundColor: 'rgba(185, 28, 28, 0.82)',
    paddingVertical: 3,
    paddingHorizontal: 44,
    transform: [{ rotate: '35deg' }],
    zIndex: 2,
  },
  removedStripeText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.7,
  },

  // ── CoAdmin Toggle ───────────────────────────────────────────────────
  coAdminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  coAdminLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.semibold,
  },
  savingText: {
    fontSize: typography.fontSize.sm,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },

  // ── Guard Screen ─────────────────────────────────────────────────────
  lockIcon: {
    fontSize: 56,
    marginBottom: spacing.md,
  },
  guardTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  guardDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  errorText: {
    fontSize: typography.fontSize.base,
    color: colors.error,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },

  // ── Buttons ──────────────────────────────────────────────────────────
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    width: '100%',
    alignItems: 'center',
    marginTop: spacing.md,
    minHeight: 48,
  },
  buttonBack: {
    backgroundColor: colors.backgroundTertiary,
    marginTop: spacing.xl,
  },
  buttonText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  buttonBackText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
});

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  getCurrentSpaceId,
  getProfile,
  getSpaces,
  listGhosts,
  setSpaces,
} from '../../lib/storage';
import { syncTeamSpaces } from '../../lib/backend/teamSync';
import { useRealtimeMemberSync } from '../../lib/backend/realtimeMembers';
import { resolveAvatarSeed } from '../../lib/avatarSeed';
import { MultiavatarView } from '../../components/MultiavatarView';
import { Button } from '../../components/Button';
import { borderRadius, spacing, typography, warmHuman } from '../../constants/theme';
import type { MemberLifecycleEntry, Space, UserProfile } from '../../types';

function formatTimestamp(iso?: string): string {
  if (!iso) return '–';
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

export default function SpaceMembersReadonlyScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [ghosts, setGhosts] = useState<UserProfile[]>([]);

  const loadData = useCallback(async (allowCachedSync = false) => {
    const [p, currentSpaceId, localSpaces] = await Promise.all([
      getProfile(),
      getCurrentSpaceId(),
      getSpaces(),
    ]);
    setProfile(p);

    if (!p || !currentSpaceId) {
      setSpace(null);
      setGhosts([]);
      setLoading(false);
      return;
    }

    let spaces = localSpaces;
    try {
      const syncResult = await syncTeamSpaces(
        p.id,
        localSpaces,
        allowCachedSync ? { allowCached: true, ttlMs: 10_000 } : {}
      );
      spaces = syncResult.spaces;
      await setSpaces(spaces);
    } catch {
      // Best effort: continue with local snapshot.
    }

    const found = spaces.find((s) => s.id === currentSpaceId) ?? null;
    setSpace(found);
    if (found) {
      try {
        const g = await listGhosts(found.id);
        setGhosts(g);
      } catch {
        setGhosts([]);
      }
    } else {
      setGhosts([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      loadData(true).finally(() => {
        if (!active) return;
      });
      return () => {
        active = false;
      };
    }, [loadData])
  );

  useRealtimeMemberSync(
    profile?.id,
    space ? [space.id] : [],
    useCallback(async () => {
      await loadData();
    }, [loadData])
  );

  const history = space?.memberHistory ?? [];
  const activeMembers = useMemo(
    () => history.filter((h) => h.active !== false),
    [history]
  );
  const removedMembers = useMemo(
    () => history.filter((h) => h.active === false),
    [history]
  );

  const snapshotMap = useMemo(() => {
    const map = new Map<string, { displayName: string; avatarUrl?: string }>();
    for (const member of space?.memberProfiles ?? []) {
      map.set(member.id, { displayName: member.displayName, avatarUrl: member.avatarUrl });
    }
    return map;
  }, [space?.memberProfiles]);

  function inviterLabel(entry: MemberLifecycleEntry): string {
    if (!space) return 'via Einladung';
    if (entry.joinedViaProfileId === space.ownerProfileId) return 'via Host';
    const currentInviter = snapshotMap.get(entry.joinedViaProfileId);
    if (currentInviter) return `via Co-Admin: ${currentInviter.displayName}`;
    const historyInviter = history.find((h) => h.id === entry.joinedViaProfileId);
    if (historyInviter) return `via Co-Admin: ${historyInviter.displayName}`;
    return 'via Einladung';
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={warmHuman.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.guardTitle}>Profil benötigt</Text>
        <Text style={styles.guardText}>
          Erstelle zuerst ein ID-Profil, um Space-Member zu sehen.
        </Text>
        <Button
          label="ID-Profil erstellen"
          onPress={() => router.replace('/(auth)/create-profile')}
          variant="hero"
          fullWidth
        />
      </View>
    );
  }

  if (!space) {
    return (
      <View style={styles.center}>
        <Text style={styles.guardTitle}>Kein aktiver Space</Text>
        <Text style={styles.guardText}>
          Wähle einen Space aus, um Member und Ghosts anzuzeigen.
        </Text>
        <Button
          label="Space wählen"
          onPress={() => router.replace('/(space)/choose')}
          variant="hero"
          fullWidth
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{space.name}</Text>
      <Text style={styles.subtitle}>Space-Member (nur Ansicht)</Text>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Du siehst hier die aktuelle Belegung, Join-Timeline und Ghosts. Änderungen sind nur für Host/CoAdmin im Space-Admin möglich.
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Aktive Member ({activeMembers.length})</Text>
      {activeMembers.length === 0 ? (
        <Text style={styles.emptyText}>Keine aktiven Member.</Text>
      ) : (
        activeMembers.map((entry) => {
          const current = snapshotMap.get(entry.id);
          const displayName = current?.displayName ?? entry.displayName;
          const avatarUrl = current?.avatarUrl ?? entry.avatarUrl;
          const seed = resolveAvatarSeed(entry.id, displayName, avatarUrl);
          const isHost = entry.id === space.ownerProfileId;
          const isCoAdmin = space.coAdminProfileIds.includes(entry.id);

          return (
            <View key={entry.id} style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.avatarArea}>
                  <MultiavatarView seed={seed} size={72} />
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{displayName}</Text>
                    <View
                      style={[
                        styles.roleBadge,
                        isHost
                          ? styles.roleHost
                          : isCoAdmin
                          ? styles.roleCoAdmin
                          : styles.roleMember,
                      ]}
                    >
                      <Text style={styles.roleText}>
                        {isHost ? 'Host' : isCoAdmin ? 'CoAdmin' : 'Member'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.metaText}>
                    Beigetreten: {formatTimestamp(entry.joinedAt)}
                  </Text>
                  <Text style={styles.metaText}>{inviterLabel(entry)}</Text>
                </View>
              </View>
            </View>
          );
        })
      )}

      <Text style={styles.sectionLabel}>Ghost-Teammitglieder ({ghosts.length})</Text>
      {ghosts.length === 0 ? (
        <Text style={styles.emptyText}>Keine aktiven Ghosts.</Text>
      ) : (
        ghosts.map((ghost) => (
          <View key={ghost.id} style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.avatarArea}>
                <MultiavatarView
                  seed={resolveAvatarSeed(ghost.id, ghost.ghostLabel ?? ghost.displayName, ghost.avatarUrl)}
                  size={72}
                />
              </View>
              <View style={styles.cardBody}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{ghost.ghostLabel ?? ghost.displayName}</Text>
                  <View style={[styles.roleBadge, styles.roleGhost]}>
                    <Text style={styles.roleText}>Ghost</Text>
                  </View>
                </View>
                <Text style={styles.metaText}>Status: Aktiv (nur Host/CoAdmin verwaltbar)</Text>
              </View>
            </View>
          </View>
        ))
      )}

      {removedMembers.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>
            Verlauf – Entfernte Member ({removedMembers.length})
          </Text>
          {removedMembers.map((entry) => (
            <View key={entry.id} style={[styles.card, styles.removedCard]}>
              <View style={styles.removedStripeWrap}>
                <Text style={styles.removedStripeText}>AUSGETRETEN</Text>
              </View>
              <View style={styles.cardRow}>
                <View style={styles.avatarAreaRemoved}>
                  <MultiavatarView
                    seed={resolveAvatarSeed(entry.id, entry.displayName, entry.avatarUrl)}
                    size={56}
                  />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.name}>{entry.displayName}</Text>
                  <Text style={styles.metaText}>
                    Beigetreten: {formatTimestamp(entry.joinedAt)}
                  </Text>
                  <Text style={styles.removedText}>
                    Entfernt: {formatTimestamp(entry.removedAt)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </>
      )}

      <Button
        label="Zurück zu Services"
        onPress={() => router.replace('/(services)')}
        variant="subtle"
        fullWidth
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: warmHuman.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  guardTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
    textAlign: 'center',
  },
  guardText: {
    fontSize: typography.fontSize.base,
    color: warmHuman.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  container: {
    flexGrow: 1,
    backgroundColor: warmHuman.surface,
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
    marginBottom: spacing.sm,
  },
  infoBox: {
    backgroundColor: warmHuman.primaryLight,
    borderColor: warmHuman.primary,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  infoText: {
    color: warmHuman.ink,
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },
  sectionLabel: {
    marginTop: spacing.sm,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: warmHuman.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: warmHuman.textSecondary,
  },
  card: {
    borderWidth: 1,
    borderColor: warmHuman.borderLight,
    backgroundColor: warmHuman.surfaceCard,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
  },
  removedCard: {
    opacity: 0.8,
    overflow: 'hidden',
    position: 'relative',
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  avatarArea: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarAreaRemoved: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  name: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: warmHuman.ink,
    flexShrink: 1,
  },
  roleBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  roleHost: {
    backgroundColor: warmHuman.primary,
  },
  roleCoAdmin: {
    backgroundColor: warmHuman.accent,
  },
  roleMember: {
    backgroundColor: '#16A34A',
  },
  roleGhost: {
    backgroundColor: '#8B5CF6',
  },
  roleText: {
    color: '#fff',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  metaText: {
    fontSize: typography.fontSize.xs,
    color: warmHuman.textSecondary,
    lineHeight: 18,
  },
  removedText: {
    fontSize: typography.fontSize.xs,
    color: '#B91C1C',
    lineHeight: 18,
  },
  removedStripeWrap: {
    position: 'absolute',
    top: 10,
    right: -42,
    backgroundColor: 'rgba(185, 28, 28, 0.82)',
    paddingVertical: 3,
    paddingHorizontal: 46,
    transform: [{ rotate: '35deg' }],
    zIndex: 2,
  },
  removedStripeText: {
    color: '#fff',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.7,
  },
});

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Switch,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import {
  getProfile,
  getSpaces,
  getCurrentSpaceId,
  setSpaces,
  updateCoAdmins,
  createGhost,
  listGhosts,
  archiveGhost,
} from '../../lib/storage';
import { syncTeamSpaces } from '../../lib/backend/teamSync';
import { useRealtimeMemberSync } from '../../lib/backend/realtimeMembers';
import { pushGhostsForSpace } from '../../lib/backend/ghostSync';
import { colors } from '../../constants/theme';
import { MultiavatarView } from '../../components/MultiavatarView';
import { resolveAvatarSeed } from '../../lib/avatarSeed';
import { ResponsiveModal } from '../../components/ResponsiveModal';
import type { Space, UserProfile, MemberSnapshot } from '../../types';

export default function ManageScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(space)/choose');
  }, [navigation, router]);

  const [loading, setLoading] = useState(true);
  const [space, setSpace] = useState<Space | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // lokale Kopie coAdminProfileIds für optimistisches UI
  const [coAdmins, setCoAdmins] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Ghost State
  const [ghosts, setGhosts] = useState<UserProfile[]>([]);
  const [showGhostModal, setShowGhostModal] = useState(false);
  const [ghostLabel, setGhostLabel] = useState('');
  const [creatingGhost, setCreatingGhost] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!spaceId) {
      setLoading(false);
      return;
    }
    const [p, spaces] = await Promise.all([getProfile(), getSpaces()]);
    const found = spaces.find((s) => s.id === spaceId) ?? null;
    setProfile(p);
    setSpace(found);
    setCoAdmins(found?.coAdminProfileIds ?? []);

    // Ghosts laden
    if (spaceId) {
      const g = await listGhosts(spaceId);
      setGhosts(g);
    }

    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime member sync: listen to member changes for this space
  // This ensures manage.tsx shows fresh member list without manual refresh
  useRealtimeMemberSync(
    profile?.id,
    spaceId ? [spaceId] : [],
    useCallback(async () => {
      if (!profile || !spaceId) return;
      const localSpaces = await getSpaces();
      const current = localSpaces.find((s) => s.id === spaceId);
      if (!current) return;
      try {
        const syncResult = await syncTeamSpaces(profile.id, localSpaces);
        const updated = syncResult.spaces.find((s) => s.id === spaceId);
        if (updated) {
          await setSpaces(localSpaces.map((s) => (s.id === updated.id ? updated : s)));
          setSpace(updated);
          setCoAdmins(updated.coAdminProfileIds ?? []);
        }
      } catch {
        // best-effort — focus-sync on next focus will recover
      }
    }, [profile?.id, spaceId])
  );

  async function handleToggleCoAdmin(memberId: string) {
    if (!space || saving) return;

    const next = coAdmins.includes(memberId)
      ? coAdmins.filter((id) => id !== memberId)
      : [...coAdmins, memberId];

    setCoAdmins(next);
    setSaving(true);
    await updateCoAdmins(space.id, next);
    setSaving(false);
  }

  // ── Ghost Handlers ────────────────────────────────────────────────────────────

  async function handleCreateGhost() {
    if (!space || !profile || !ghostLabel.trim()) return;
    setCreatingGhost(true);
    try {
      const newGhost = await createGhost(space.id, ghostLabel.trim(), profile.id);
      setGhosts((prev) => [...prev, newGhost]);

      // Push updated ghost list to backend so other devices can discover this ghost
      try {
        const updatedGhosts = await listGhosts(space.id);
        await pushGhostsForSpace(space.id, updatedGhosts);
      } catch {
        // best-effort — members will pick up ghosts on next pull
      }

      setGhostLabel('');
      setShowGhostModal(false);
    } catch {
      Alert.alert('Fehler', 'Ghost konnte nicht erstellt werden.');
    } finally {
      setCreatingGhost(false);
    }
  }

  async function handleArchiveGhost(ghostId: string) {
    if (!space) return;
    Alert.alert(
      'Ghost archivieren',
      'Diesen Ghost wirklich archivieren? Die Historie bleibt erhalten.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Archivieren',
          style: 'destructive',
          onPress: async () => {
            setArchivingId(ghostId);
            await archiveGhost(space.id, ghostId);
            setGhosts((prev) => prev.filter((g) => g.id !== ghostId));

            // Push updated ghost list (archived ghost no longer in active list)
            try {
              const remaining = await listGhosts(space.id);
              await pushGhostsForSpace(space.id, remaining);
            } catch {
              // best-effort
            }

            setArchivingId(null);
          },
        },
      ]
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── Space nicht gefunden ─────────────────────────────────────────────────────
  if (!space) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Space nicht gefunden.</Text>
        <TouchableOpacity style={styles.button} onPress={handleBack}>
          <Text style={styles.buttonText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Kein Owner ───────────────────────────────────────────────────────────────
  if (!profile || profile.id !== space.ownerProfileId) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{space.name}</Text>
        <Text style={styles.restrictedText}>
          Nur der Space-Ersteller kann verwalten.
        </Text>
        <TouchableOpacity style={styles.button} onPress={handleBack}>
          <Text style={styles.buttonText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Owner-View ───────────────────────────────────────────────────────────────
  const memberHistory = space.memberHistory ?? [];
  const removedEntries = memberHistory.filter((h) => h.active === false);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{space.name}</Text>
      <Text style={styles.subtitle}>Space verwalten</Text>

      {/* CoAdmin Hinweis */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          CoAdmins dürfen den QR-Code anzeigen, um neue Kollegen vor Ort einzuladen.
        </Text>
      </View>

      {/* Memberliste Button (Host-only) */}
      <TouchableOpacity
        style={styles.membersNavBtn}
        onPress={() => router.push(`/(space)/members?spaceId=${space.id}`)}
      >
        <Text style={styles.membersNavBtnText}>👥 Memberliste & Timeline</Text>
      </TouchableOpacity>

      {/* Memberliste */}
      <Text style={styles.sectionLabel}>Member ({space.memberProfiles.length})</Text>

      {space.memberProfiles.length === 0 ? (
        <Text style={styles.emptyText}>Keine Member gefunden.</Text>
      ) : (
        <View style={styles.memberList}>
          {space.memberProfiles.map((member: MemberSnapshot) => {
            const isOwner = member.id === space.ownerProfileId;
            const isCoAdmin = coAdmins.includes(member.id);

            return (
              <View key={member.id} style={styles.memberRow}>
                {/* Avatar */}
                <MultiavatarView
                  seed={resolveAvatarSeed(member.id, member.displayName, member.avatarUrl)}
                  size={40}
                />

                {/* Name + Rolle */}
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.displayName}</Text>
                  <Text style={styles.memberRole}>
                    {isOwner ? 'Host' : isCoAdmin ? 'CoAdmin' : 'Member'}
                  </Text>
                </View>

                {/* CoAdmin Toggle – Owner kann nicht abgewählt werden */}
                {isOwner ? (
                  <View style={styles.ownerBadge}>
                    <Text style={styles.ownerBadgeText}>Owner</Text>
                  </View>
                ) : (
                  <Switch
                    value={isCoAdmin}
                    onValueChange={() => handleToggleCoAdmin(member.id)}
                    trackColor={{ false: colors.grayLight, true: colors.primaryVariant }}
                    thumbColor={isCoAdmin ? colors.primary : colors.textTertiary}
                    disabled={saving}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}

      {saving && (
        <Text style={styles.savingText}>Speichern…</Text>
      )}

      {/* ── Ausgetretene Member (readonly history) ───────────────────── */}
      {removedEntries.length > 0 && (
        <View style={styles.removedSection}>
          <Text style={styles.sectionLabel}>Ausgetretene Member ({removedEntries.length})</Text>
          <Text style={styles.removedHint}>
            Diese Einträge sind Verlauf (nur lesbar) und dokumentieren den Austritt.
          </Text>
          {removedEntries.map((entry) => (
            <View key={entry.id} style={styles.removedCard}>
              <View style={styles.removedStripeWrap}>
                <Text style={styles.removedStripeText}>AUSGETRETEN</Text>
              </View>
              <View style={styles.memberRow}>
                <MultiavatarView
                  seed={resolveAvatarSeed(entry.id, entry.displayName, entry.avatarUrl)}
                  size={40}
                />
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{entry.displayName}</Text>
                  <Text style={styles.memberRole}>
                    Beigetreten: {new Date(entry.joinedAt).toLocaleString('de-DE')}
                  </Text>
                  {entry.removedAt && (
                    <Text style={styles.removedAtText}>
                      Ausgetreten: {new Date(entry.removedAt).toLocaleString('de-DE')}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── Ghost-Teammitglieder ──────────────────────────────────────── */}
      <View style={styles.ghostSection}>
        <Text style={styles.sectionLabel}>Ghost-Teammitglieder ({ghosts.length})</Text>

        <View style={styles.ghostInfoBox}>
          <Text style={styles.ghostInfoText}>
            👻 Ghosts sind Platzhalter für Kollegen, die noch kein eigenes Profil haben.
            Alle Member können Ghosts als „anwesend" markieren.
          </Text>
        </View>

        {/* Ghost Liste */}
        {ghosts.length > 0 && (
          <View style={styles.memberList}>
            {ghosts.map((ghost) => {
              const seed = resolveAvatarSeed(ghost.id, ghost.ghostLabel ?? ghost.displayName, ghost.avatarUrl);
              return (
                <View key={ghost.id} style={styles.memberRow}>
                  <MultiavatarView seed={seed} size={40} />
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{ghost.ghostLabel}</Text>
                    <Text style={styles.ghostRoleText}>Ghost</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.archiveBtn}
                    onPress={() => handleArchiveGhost(ghost.id)}
                    disabled={archivingId === ghost.id}
                  >
                    {archivingId === ghost.id ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <Text style={styles.archiveBtnText}>Archivieren</Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {ghosts.length === 0 && (
          <Text style={styles.emptyText}>Keine aktiven Ghosts.</Text>
        )}

        {/* Ghost hinzufügen Button */}
        <TouchableOpacity
          style={styles.addGhostBtn}
          onPress={() => setShowGhostModal(true)}
        >
          <Text style={styles.addGhostBtnText}>+ Ghost hinzufügen</Text>
        </TouchableOpacity>
      </View>

      {/* ── Ghost Modal ───────────────────────────────────────────────── */}
      <ResponsiveModal
        visible={showGhostModal}
        onRequestClose={() => setShowGhostModal(false)}
        contentStyle={styles.modalContent}
      >
            <Text style={styles.modalTitle}>Ghost hinzufügen</Text>
            <Text style={styles.modalDesc}>
              Gib einen Namen oder ein Kürzel für den Platzhalter ein.
            </Text>

            <TextInput
              style={styles.modalInput}
              value={ghostLabel}
              onChangeText={setGhostLabel}
              placeholder="z.B. Kollege A, Nachtschicht-Max..."
              placeholderTextColor={colors.textTertiary}
              maxLength={30}
              autoFocus
            />

            {/* Avatar-Vorschau */}
            {ghostLabel.trim().length > 0 && (
              <View style={styles.modalPreview}>
                <MultiavatarView
                  seed={`${space.id}:${ghostLabel.trim()}`.toLowerCase()}
                  size={48}
                />
                <Text style={styles.modalPreviewName}>{ghostLabel.trim()}</Text>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setShowGhostModal(false); setGhostLabel(''); }}
              >
                <Text style={styles.modalCancelBtnText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  (!ghostLabel.trim() || creatingGhost) && styles.modalConfirmBtnDisabled,
                ]}
                onPress={handleCreateGhost}
                disabled={!ghostLabel.trim() || creatingGhost}
              >
                {creatingGhost ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>Erstellen</Text>
                )}
              </TouchableOpacity>
            </View>
      </ResponsiveModal>

      <TouchableOpacity
        style={[styles.button, styles.buttonBack, { marginTop: 32 }]}
        onPress={handleBack}
      >
        <Text style={styles.buttonText}>Zurück</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  restrictedText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    marginTop: 16,
    lineHeight: 22,
  },
  infoBox: {
    backgroundColor: colors.primaryBackground,
    borderRadius: 10,
    padding: 14,
    width: '100%',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.primaryVariant,
  },
  infoText: {
    fontSize: 13,
    color: colors.primaryDark,
    lineHeight: 20,
  },
  sectionLabel: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '700',
    color: colors.secondaryDark,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  memberList: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.backgroundTertiary,
    gap: 12,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  memberRole: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  ownerBadge: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ownerBadgeText: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: '700',
  },
  savingText: {
    marginTop: 12,
    fontSize: 13,
    color: colors.textTertiary,
  },
  removedSection: {
    width: '100%',
    marginTop: 20,
    marginBottom: 8,
  },
  removedHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
    lineHeight: 18,
  },
  removedCard: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.errorLight,
    borderRadius: 12,
    backgroundColor: '#FFF7F7',
    marginBottom: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  removedStripeWrap: {
    position: 'absolute',
    top: 10,
    right: -40,
    backgroundColor: 'rgba(185, 28, 28, 0.8)',
    paddingVertical: 3,
    paddingHorizontal: 44,
    transform: [{ rotate: '35deg' }],
    zIndex: 2,
  },
  removedStripeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  removedAtText: {
    fontSize: 12,
    color: colors.error,
    marginTop: 2,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: colors.error,
    marginBottom: 24,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  buttonBack: {
    backgroundColor: colors.textSecondary,
  },
  buttonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '600',
  },
  // ── Members Nav Button ─────────────────────────────────────────────
  membersNavBtn: {
    width: '100%',
    backgroundColor: colors.primaryBackground,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.primaryVariant,
  },
  membersNavBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  // ── Ghost Section ──────────────────────────────────────────────────
  ghostSection: {
    width: '100%',
    marginTop: 32,
  },
  ghostInfoBox: {
    backgroundColor: '#F5F3FF',
    borderRadius: 10,
    padding: 14,
    width: '100%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  ghostInfoText: {
    fontSize: 13,
    color: '#5B21B6',
    lineHeight: 20,
  },
  ghostRoleText: {
    fontSize: 12,
    color: colors.purple,
    marginTop: 2,
    fontWeight: '600',
  },
  archiveBtn: {
    borderWidth: 1,
    borderColor: colors.errorLight,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.errorBackground,
  },
  archiveBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.error,
  },
  addGhostBtn: {
    borderWidth: 1,
    borderColor: colors.purple,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#F5F3FF',
  },
  addGhostBtnText: {
    color: colors.purple,
    fontSize: 14,
    fontWeight: '600',
  },
  // ── Modal ────────────────────────────────────────────────────────
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.grayLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundTertiary,
    marginBottom: 16,
  },
  modalPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.successBackground,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  modalPreviewName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
  },
  modalCancelBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: colors.purple,
  },
  modalConfirmBtnDisabled: {
    opacity: 0.5,
  },
  modalConfirmBtnText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },
});


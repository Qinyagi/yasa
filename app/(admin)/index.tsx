import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  getProfile,
  getSpaces,
  deleteSpace,
  clearProfile,
  clearCurrentSpaceId,
  getCurrentSpaceId,
  setCurrentSpaceId,
  setSpaces,
  STORAGE_KEYS,
} from '../../lib/storage';
import { deleteSpaceForProfile, removeSpaceMembershipsForProfile, syncTeamSpaces } from '../../lib/backend/teamSync';
import { useRealtimeMemberSync } from '../../lib/backend/realtimeMembers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { isBiometricAvailable, authenticateWithBiometrics, getBiometricType } from '../../lib/auth';
import { MultiavatarView } from '../../components/MultiavatarView';
import { ResponsiveModal } from '../../components/ResponsiveModal';
import type { UserProfile, Space } from '../../types';
import { colors, typography, spacing, borderRadius, accessibility } from '../../constants/theme';

export default function AdminScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(services)');
  }, [navigation, router]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [spaces, setSpacesState] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('Biometric');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [currentSpaceId, setCurrentSpaceIdState] = useState<string | null>(null);

  // Profile Delete: 3-Step Safetylock
  const [showProfileDeleteModal, setShowProfileDeleteModal] = useState(false);
  const [profileDeleteStep, setProfileDeleteStep] = useState(0); // 0=initial, 1=first confirm, 2=final

  // Initial authentication check
  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function checkAuth() {
        setAuthenticating(true);

        const available = await isBiometricAvailable();
        const type = await getBiometricType();

        if (active) {
          setBiometricType(type);

          if (!available) {
            // Biometrics not available/enrolled — fall back to device PIN/password
            const pinResult = await LocalAuthentication.authenticateAsync({
              promptMessage: 'Admin-Bereich',
              disableDeviceFallback: false,
              cancelLabel: 'Abbrechen',
            });
            if (pinResult.success) {
              setIsAuthenticated(true);
              setAuthenticating(false);
            } else {
              setAuthenticating(false);
              Alert.alert(
                'Zugang verweigert',
                'Für den Admin-Bereich ist eine Geräte-Sperre (PIN, Passwort oder Biometrie) erforderlich.',
              );
            }
            return;
          }

          const success = await authenticateWithBiometrics();
          setIsAuthenticated(success);
          setAuthenticating(false);
        }
      }

      checkAuth();

      return () => { active = false; };
    }, [])
  );

  // Load data after authentication
  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) return;

      let active = true;
      setLoading(true);
      setDeleteConfirm(null);
      setShowProfileDeleteModal(false);
      setProfileDeleteStep(0);

      Promise.all([getProfile(), getSpaces(), getCurrentSpaceId()]).then(([p, s, activeSpaceId]) => {
        (async () => {
          if (!active) return;
          setProfile(p);
          setCurrentSpaceIdState(activeSpaceId);

          let resolvedSpaces = s;
          if (p) {
            try {
              const syncResult = await syncTeamSpaces(p.id, s, { allowCached: true, ttlMs: 10_000 });
              resolvedSpaces = syncResult.spaces;
              await setSpaces(resolvedSpaces);
            } catch {
              // best-effort: continue with local state
            }
          }

          if (!active) return;
          setSpacesState(resolvedSpaces);
          setLoading(false);
        })();
      });
      return () => { active = false; };
    }, [isAuthenticated])
  );

  // Realtime refresh for space membership changes while admin view is open.
  useRealtimeMemberSync(
    profile?.id,
    spaces.map((s) => s.id),
    useCallback(async () => {
      if (!profile) return;
      const localSpaces = await getSpaces();
      try {
        const syncResult = await syncTeamSpaces(profile.id, localSpaces);
        await setSpaces(syncResult.spaces);
        setSpacesState(syncResult.spaces);
      } catch {
        // best-effort
      }
    }, [profile?.id])
  );

  // ── Space löschen (2-Step: Tap → Confirm Tap) ────────────────────────────
  async function handleDeleteSpace(spaceId: string) {
    if (deleteConfirm !== spaceId) {
      setDeleteConfirm(spaceId);
      return;
    }
    const target = spaces.find((s) => s.id === spaceId);
    if (profile && target) {
      try {
        await deleteSpaceForProfile(spaceId, profile.id, target.ownerProfileId === profile.id);
      } catch {
        // Backend-Cleanup ist best-effort; lokales Löschen darf dadurch nicht blockieren.
      }
    }
    await deleteSpace(spaceId);
    const updated = await getSpaces();
    setSpacesState(updated);
    const active = await getCurrentSpaceId();
    setCurrentSpaceIdState(active);
    setDeleteConfirm(null);
  }

  async function handleActivateSpace(spaceId: string) {
    await setCurrentSpaceId(spaceId);
    setCurrentSpaceIdState(spaceId);
    Alert.alert('Space aktiviert', 'YASA arbeitet jetzt in diesem Space.');
  }

  // ── Profil löschen – kompletter Cleanup ────────────────────────────────────
  // Löscht: Profil, alle Spaces, currentSpaceId, Shifts, Ghosts, Vacation, Swaps,
  // Time-Account-Daten (SpaceRules, UserProfile, UiState)
  async function executeProfileDelete() {
    try {
      // Best-effort: remove this profile's rows from space_members on the backend
      // so other devices stop seeing this user in their Shiftpals/member lists.
      // This is fire-and-forget — local cleanup proceeds regardless of network errors.
      if (profile) {
        const currentSpaces = await getSpaces();
        const spaceIds = currentSpaces.map((s) => s.id);
        try {
          await removeSpaceMembershipsForProfile(profile.id, spaceIds);
        } catch {
          // Backend delete is best-effort; local delete always proceeds.
        }
      }

      await setSpaces([]);
      await clearCurrentSpaceId();
      await clearProfile();
      // Zusätzliche Storage Keys bereinigen
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.SHIFTS,
        STORAGE_KEYS.GHOSTS,
        STORAGE_KEYS.VACATION,
        STORAGE_KEYS.SWAPS,
        STORAGE_KEYS.TIME_ACCOUNT_SPACE_RULES,
        STORAGE_KEYS.TIME_ACCOUNT_USER,
        STORAGE_KEYS.TIME_ACCOUNT_UI,
        STORAGE_KEYS.TIMECLOCK_EVENTS,
        STORAGE_KEYS.TIMECLOCK_CONFIG,
        STORAGE_KEYS.TIMECLOCK_TEST_PROMPT,
        STORAGE_KEYS.TIMECLOCK_UI,
        STORAGE_KEYS.TIMECLOCK_QA_CALENDAR,
        STORAGE_KEYS.SHIFT_OVERRIDES,
        STORAGE_KEYS.DAY_CHANGES,
        STORAGE_KEYS.VACATION_SHORTSHIFT_REMINDERS,
        STORAGE_KEYS.STRATEGY_HOURS_BANK,
        STORAGE_KEYS.STRATEGY_HOURS_JOURNAL,
        STORAGE_KEYS.SHIFT_COLOR_OVERRIDES,
      ]);
      setShowProfileDeleteModal(false);
      setProfileDeleteStep(0);
      router.replace('/');
    } catch {
      Alert.alert('Fehler', 'Profil konnte nicht vollständig gelöscht werden.');
    }
  }

  // ── Loading / Auth States ──────────────────────────────────────────────────
  if (authenticating) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.authText}>Authentifiziere...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.center}>
        <Text style={styles.lockIcon}>🔐</Text>
        <Text style={styles.title}>Admin Bereich</Text>
        <Text style={styles.authFailed}>
          Authentifizierung fehlgeschlagen oder abgebrochen.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={async () => {
            const success = await authenticateWithBiometrics();
            setIsAuthenticated(success);
          }}
        >
          <Text style={styles.buttonText}>Erneut versuchen</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={handleBack}
        >
          <Text style={styles.buttonText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── Guard: kein Profil ───────────────────────────────────────────────────
  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.lockIcon}>👤</Text>
        <Text style={styles.title}>Profil benötigt</Text>
        <Text style={styles.authFailed}>
          Du brauchst ein Profil, um den Admin-Bereich zu nutzen.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('/(auth)/create-profile')}
        >
          <Text style={styles.buttonText}>Profil erstellen</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={handleBack}
        >
          <Text style={styles.buttonText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      {/* Header */}
      <Text style={styles.headerTitle}>🔐 Admin Bereich</Text>

      {/* Profile Badge */}
      {profile && (
        <View style={styles.profileBadge}>
          <MultiavatarView uri={profile.avatarUrl} size={48} />
          <Text style={styles.profileLabel}>Angemeldet als</Text>
          <Text style={styles.profileName}>{profile.displayName}</Text>
        </View>
      )}

      {/* ── Spaces Section ──────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>📱 Deine Spaces</Text>

      {spaces.length === 0 ? (
        <Text style={styles.emptyText}>Keine Spaces vorhanden.</Text>
      ) : (
        spaces.map((space) => {
          const profileId = profile?.id ?? '';
          const isOwner = profileId === space.ownerProfileId;
          const isCoAdmin = space.coAdminProfileIds.includes(profileId);
          const isMember = space.memberProfileIds.includes(profileId);
          const canSeeQR = isOwner || isCoAdmin;
          const confirmingThisSpace = deleteConfirm === space.id;
          const isActiveSpace = currentSpaceId === space.id;
          const removedCount = (space.memberHistory ?? []).filter((h) => h.active === false).length;

          return (
            <View key={space.id} style={styles.spaceCard}>
              <View style={styles.spaceHeader}>
                <Text style={styles.spaceName}>{space.name}</Text>
                <Text style={styles.memberCount}>👥 {space.memberProfileIds.length}</Text>
              </View>
              <Text style={[styles.activeSpaceHint, isActiveSpace && styles.activeSpaceHintOn]}>
                {isActiveSpace ? 'Aktiver Arbeits-Space' : 'Nicht aktiv'}
              </Text>
              {removedCount > 0 && (
                <Text style={styles.historyHint}>
                  Verlauf: {removedCount} ausgetreten
                </Text>
              )}

              {/* Role Badge */}
              <View style={styles.roleRow}>
                <View style={[styles.roleBadge, isOwner ? styles.roleOwner : isCoAdmin ? styles.roleCoAdmin : styles.roleMember]}>
                  <Text style={styles.roleBadgeText}>
                    {isOwner ? 'Host' : isCoAdmin ? 'CoAdmin' : 'Member'}
                  </Text>
                </View>
              </View>

              {(isMember || isOwner) && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      isActiveSpace ? styles.actionBtnActiveSpace : styles.actionBtnActivate,
                    ]}
                    onPress={() => handleActivateSpace(space.id)}
                    disabled={isActiveSpace}
                  >
                    <Text style={styles.actionBtnText}>
                      {isActiveSpace ? 'Aktiv' : 'Aktivieren'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Admin Actions - Only for Owner/CoAdmin */}
              {(canSeeQR || isOwner) && (
                <View style={styles.actionRow}>
                  {canSeeQR && (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnPrimary]}
                      onPress={() => router.push(`/(space)/qr?spaceId=${space.id}`)}
                    >
                      <Text style={styles.actionBtnText}>📱 QR</Text>
                    </TouchableOpacity>
                  )}
                  {isOwner && (
                    <>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnManage]}
                        onPress={() => router.push(`/(space)/manage?spaceId=${space.id}`)}
                      >
                        <Text style={styles.actionBtnText}>⚙️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnRules]}
                        onPress={() => router.push(`/(admin)/space-rules?spaceId=${space.id}`)}
                      >
                        <Text style={styles.actionBtnText}>📋</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.actionBtn,
                          styles.actionBtnDelete,
                          confirmingThisSpace && styles.actionBtnDeleteConfirm,
                        ]}
                        onPress={() => handleDeleteSpace(space.id)}
                      >
                        <Text style={[
                          styles.actionBtnText,
                          styles.actionBtnDeleteText,
                          confirmingThisSpace && styles.actionBtnDeleteTextConfirm,
                        ]}>
                          {confirmingThisSpace ? '⚠️ Löschen?' : '🗑️'}
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}

              {isOwner && (
                <TouchableOpacity
                  style={styles.profileTransferBtn}
                  onPress={() => router.push(`/(space)/profile-transfer?spaceId=${space.id}`)}
                >
                  <Text style={styles.profileTransferBtnText}>ID-Profil Transfer</Text>
                </TouchableOpacity>
              )}

              {/* Cancel delete */}
              {confirmingThisSpace && (
                <TouchableOpacity onPress={() => setDeleteConfirm(null)}>
                  <Text style={styles.cancelLink}>Abbrechen</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}

      {/* ── Profil löschen Section ──────────────────────────────────── */}
      <Text style={styles.sectionTitle}>⚙️ Profil verwalten</Text>

      <View style={styles.profileEditCard}>
        <Text style={styles.profileEditTitle}>🪪 Profil einmalig bearbeiten</Text>
        <Text style={styles.profileEditDesc}>
          Name und Avatar können genau einmal geändert werden. Danach bleibt das Profil gesperrt,
          damit die Team-Identifikation stabil bleibt.
        </Text>
        <TouchableOpacity
          style={[
            styles.profileEditBtn,
            profile.profileEditLocked && styles.profileEditBtnDisabled,
          ]}
          onPress={() => router.push('/(admin)/edit-profile')}
          disabled={profile.profileEditLocked}
        >
          <Text style={[styles.profileEditBtnText, profile.profileEditLocked && styles.profileEditBtnTextDisabled]}>
            {profile.profileEditLocked ? 'Bearbeitung gesperrt' : 'Profil bearbeiten'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.dangerZone}>
        <Text style={styles.dangerZoneLabel}>⚠️ Gefahrenzone</Text>
        <Text style={styles.dangerZoneDesc}>
          Profil löschen entfernt dein Profil, alle Spaces, Schichtpläne, Urlaubsdaten und Tauschanfragen unwiderruflich.
        </Text>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => setShowProfileDeleteModal(true)}
        >
          <Text style={styles.deleteButtonText}>🗑️ Profil löschen</Text>
        </TouchableOpacity>
      </View>

      {/* Back Button */}
      <TouchableOpacity
        testID="admin-back"
        style={[styles.button, styles.buttonBack]}
        onPress={handleBack}
      >
        <Text style={styles.buttonBackText}>← Zurück</Text>
      </TouchableOpacity>

      {/* ── Profil-Löschen-Modal (3-Step Safetylock) ────────────────── */}
      <ResponsiveModal
        visible={showProfileDeleteModal}
        onRequestClose={() => { setShowProfileDeleteModal(false); setProfileDeleteStep(0); }}
        contentStyle={styles.modalCard}
      >
            {profileDeleteStep === 0 && (
              <>
                <Text style={styles.modalTitle}>Profil löschen?</Text>
                <Text style={styles.modalDesc}>
                  Dein gesamtes Profil wird unwiderruflich gelöscht.
                </Text>
                {spaces.length > 0 && (
                  <View style={styles.modalWarningBox}>
                    <Text style={styles.modalWarningText}>
                      ⚠️ Du hast {spaces.length} Space(s). Diese werden ebenfalls gelöscht!
                    </Text>
                  </View>
                )}
                <Text style={styles.modalDetailLabel}>Folgende Daten werden gelöscht:</Text>
                <Text style={styles.modalDetailItem}>• Dein ID-Profil</Text>
                <Text style={styles.modalDetailItem}>• Alle Spaces ({spaces.length})</Text>
                <Text style={styles.modalDetailItem}>• Alle Schichtpläne</Text>
                <Text style={styles.modalDetailItem}>• Alle Urlaubsdaten</Text>
                <Text style={styles.modalDetailItem}>• Alle Tauschanfragen</Text>
                <Text style={styles.modalDetailItem}>• Alle Ghost-Teammitglieder</Text>

                <View style={styles.modalBtnRow}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => { setShowProfileDeleteModal(false); setProfileDeleteStep(0); }}
                  >
                    <Text style={styles.modalCancelBtnText}>Abbrechen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalDeleteBtn}
                    onPress={() => setProfileDeleteStep(1)}
                  >
                    <Text style={styles.modalDeleteBtnText}>Weiter</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {profileDeleteStep === 1 && (
              <>
                <Text style={styles.modalTitle}>⚠️ Bist du sicher?</Text>
                <Text style={styles.modalDesc}>
                  Diese Aktion kann nicht rückgängig gemacht werden. Alle deine Daten gehen verloren.
                </Text>
                <View style={styles.modalBtnRow}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => { setShowProfileDeleteModal(false); setProfileDeleteStep(0); }}
                  >
                    <Text style={styles.modalCancelBtnText}>Abbrechen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalFinalDeleteBtn}
                    onPress={executeProfileDelete}
                  >
                    <Text style={styles.modalDeleteBtnText}>Ich bin sicher – löschen</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
      </ResponsiveModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  scrollContainer: {
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
    paddingTop: 60,
    paddingBottom: 48,
  },
  headerTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },
  profileBadge: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.xl,
  },
  profileLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  profileName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    width: '100%',
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
  spaceCard: {
    width: '100%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  spaceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  spaceName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  memberCount: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  historyHint: {
    fontSize: typography.fontSize.xs,
    color: colors.error,
    marginBottom: spacing.md,
    fontWeight: typography.fontWeight.semibold,
  },
  activeSpaceHint: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginBottom: spacing.md,
    fontWeight: typography.fontWeight.semibold,
  },
  activeSpaceHintOn: {
    color: colors.primary,
  },
  roleRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  roleBadge: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  roleOwner: { backgroundColor: colors.primary },
  roleCoAdmin: { backgroundColor: colors.purple },
  roleMember: { backgroundColor: '#16A34A' },
  roleBadgeText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimary: { backgroundColor: colors.primary },
  actionBtnActivate: { backgroundColor: '#0F766E' },
  actionBtnActiveSpace: { backgroundColor: colors.secondary },
  actionBtnManage: { backgroundColor: colors.purple },
  actionBtnRules: { backgroundColor: '#0E7490' }, // teal-700
  actionBtnDelete: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.error,
  },
  actionBtnDeleteConfirm: { backgroundColor: colors.error },
  actionBtnText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  actionBtnDeleteText: { color: colors.error },
  actionBtnDeleteTextConfirm: { color: colors.textInverse },
  profileTransferBtn: {
    minHeight: 48,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    marginTop: spacing.md,
  },
  profileTransferBtnText: {
    color: '#065F46',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
  },
  cancelLink: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.base,
    marginBottom: spacing.lg,
  },
  // Danger Zone
  dangerZone: {
    width: '100%',
    backgroundColor: colors.errorBackground,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.errorLight,
  },
  profileEditCard: {
    width: '100%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileEditTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  profileEditDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  profileEditBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileEditBtnDisabled: {
    backgroundColor: colors.backgroundTertiary,
  },
  profileEditBtnText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  profileEditBtnTextDisabled: {
    color: colors.textSecondary,
  },
  dangerZoneLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.error,
    marginBottom: spacing.md,
  },
  dangerZoneDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.errorDark,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  deleteButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.error,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: colors.error,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    width: '100%',
    alignItems: 'center',
    marginTop: spacing.lg,
    minHeight: accessibility.minTapHeight,
  },
  buttonSecondary: { backgroundColor: colors.secondary },
  buttonBack: { backgroundColor: colors.backgroundTertiary },
  buttonText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
  },
  buttonBackText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
  },
  // Auth states
  lockIcon: { fontSize: 64, marginBottom: spacing.lg },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  authText: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  authFailed: {
    fontSize: typography.fontSize.base,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  // Modal
  modalCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  modalDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  modalWarningBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  modalWarningText: {
    fontSize: typography.fontSize.sm,
    color: '#92400E',
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
  },
  modalDetailLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  modalDetailItem: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: 2,
    paddingLeft: spacing.sm,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  modalCancelBtn: {
    flex: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
  },
  modalCancelBtnText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  modalDeleteBtn: {
    flex: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.error,
  },
  modalFinalDeleteBtn: {
    flex: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#991B1B',
  },
  modalDeleteBtnText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
});

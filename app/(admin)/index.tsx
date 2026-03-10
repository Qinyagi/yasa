import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  getProfile,
  getSpaces,
  deleteSpace,
  clearProfile,
  clearCurrentSpaceId,
  setSpaces,
  STORAGE_KEYS,
} from '../../lib/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isBiometricAvailable, authenticateWithBiometrics, getBiometricType } from '../../lib/auth';
import { MultiavatarView } from '../../components/MultiavatarView';
import type { UserProfile, Space } from '../../types';
import { colors, typography, spacing, borderRadius, accessibility } from '../../constants/theme';

export default function AdminScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [spaces, setSpacesState] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('Biometric');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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
            setIsAuthenticated(true);
            setAuthenticating(false);
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

      Promise.all([getProfile(), getSpaces()]).then(([p, s]) => {
        if (active) {
          setProfile(p);
          setSpacesState(s);
          setLoading(false);
        }
      });
      return () => { active = false; };
    }, [isAuthenticated])
  );

  // ── Space löschen (2-Step: Tap → Confirm Tap) ────────────────────────────
  async function handleDeleteSpace(spaceId: string) {
    if (deleteConfirm !== spaceId) {
      setDeleteConfirm(spaceId);
      return;
    }
    await deleteSpace(spaceId);
    const updated = await getSpaces();
    setSpacesState(updated);
    setDeleteConfirm(null);
  }

  // ── Profil löschen – kompletter Cleanup ────────────────────────────────────
  // Löscht: Profil, alle Spaces, currentSpaceId, Shifts, Ghosts, Vacation, Swaps,
  // Time-Account-Daten (SpaceRules, UserProfile, UiState)
  async function executeProfileDelete() {
    try {
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
          onPress={() => router.back()}
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
          onPress={() => router.back()}
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
          const canSeeQR = isOwner || isCoAdmin;
          const confirmingThisSpace = deleteConfirm === space.id;

          return (
            <View key={space.id} style={styles.spaceCard}>
              <View style={styles.spaceHeader}>
                <Text style={styles.spaceName}>{space.name}</Text>
                <Text style={styles.memberCount}>👥 {space.memberProfileIds.length}</Text>
              </View>

              {/* Role Badge */}
              <View style={styles.roleRow}>
                <View style={[styles.roleBadge, isOwner ? styles.roleOwner : isCoAdmin ? styles.roleCoAdmin : styles.roleMember]}>
                  <Text style={styles.roleBadgeText}>
                    {isOwner ? 'Eigentümer' : isCoAdmin ? 'CoAdmin' : 'Mitglied'}
                  </Text>
                </View>
              </View>

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
        style={[styles.button, styles.buttonBack]}
        onPress={() => router.back()}
      >
        <Text style={styles.buttonBackText}>← Zurück</Text>
      </TouchableOpacity>

      {/* ── Profil-Löschen-Modal (3-Step Safetylock) ────────────────── */}
      <Modal
        visible={showProfileDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowProfileDeleteModal(false); setProfileDeleteStep(0); }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
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
          </View>
        </View>
      </Modal>
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
    paddingBottom: 40,
  },
  headerTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  profileBadge: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
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
    marginTop: spacing.md,
  },
  spaceCard: {
    width: '100%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  spaceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
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
  roleRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  roleBadge: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  roleOwner: { backgroundColor: colors.primary },
  roleCoAdmin: { backgroundColor: colors.purple },
  roleMember: { backgroundColor: colors.secondary },
  roleBadgeText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimary: { backgroundColor: colors.primary },
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
  cancelLink: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginTop: spacing.xs,
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
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.errorLight,
  },
  dangerZoneLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.error,
    marginBottom: spacing.sm,
  },
  dangerZoneDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.errorDark,
    lineHeight: 20,
    marginBottom: spacing.md,
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
    marginTop: spacing.md,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
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

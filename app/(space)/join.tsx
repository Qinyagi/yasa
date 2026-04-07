import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { getProfile, getSpaces, joinSpace, importSpaceFromInvite } from '../../lib/storage';
import { colors, typography, spacing, borderRadius, accessibility } from '../../constants/theme';

// ─── Payload Parser ────────────────────────────────────────────────────────────

interface InvitePayload {
  spaceId: string;
  name?: string;
  ownerProfileId?: string;
  ownerDisplayName?: string;
  /** Avatar-Seed des Hosts – seit R2 im QR-Payload enthalten */
  ownerAvatarUrl?: string;
  token: string;
}

/**
 * Parst QR-Payload (unterstützt alte und neue Format).
 * 
 * Neues Format (ab R1):
 *   yasa://join?spaceId=<id>&name=<name>&ownerId=<ownerId>&ownerName=<ownerName>&token=<token>
 * 
 * Altes Format (Legacy):
 *   yasa://join?spaceId=<id>&token=<token>
 */
function parseInvitePayload(value: string): InvitePayload | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'yasa:') return null;
    if (url.hostname !== 'join') return null;
    
    const spaceId = url.searchParams.get('spaceId');
    const token = url.searchParams.get('token');
    if (!spaceId || !token) return null;
    
    // Neues Format mit Space-Metadaten
    const name = url.searchParams.get('name') ?? undefined;
    const ownerProfileId = url.searchParams.get('ownerId') ?? undefined;
    const ownerDisplayName = url.searchParams.get('ownerName') ?? undefined;
    // ownerAvatar seit R2: Avatar-Seed des Hosts direkt im QR-Payload
    const ownerAvatarRaw = url.searchParams.get('ownerAvatar') ?? undefined;
    const ownerAvatarUrl = ownerAvatarRaw && ownerAvatarRaw.length > 0 ? ownerAvatarRaw : undefined;

    return { spaceId, name, ownerProfileId, ownerDisplayName, ownerAvatarUrl, token };
  } catch {
    return null;
  }
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function JoinScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [permission, requestPermission] = useCameraPermissions();
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(space)/choose');
  }, [navigation, router]);

  // Scanning-Zustand
  const [scanning, setScanning] = useState(true);
  const lastScan = useRef<string | null>(null);

  // Confirmation Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<InvitePayload | null>(null);
  const [spaceName, setSpaceName] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  // Scanning bei jedem Focus-Eintritt zurücksetzen
  useFocusEffect(
    useCallback(() => {
      setScanning(true);
      lastScan.current = null;
      setModalVisible(false);
      setPendingPayload(null);
      setSpaceName(null);
    }, [])
  );

  // ── QR erkannt ─────────────────────────────────────────────────────────────
  async function handleBarCodeScanned({ data }: { data: string }) {
    // Debounce: selben Code nicht mehrfach verarbeiten
    if (!scanning || lastScan.current === data) return;
    lastScan.current = data;
    setScanning(false);

    const payload = parseInvitePayload(data);
    if (!payload) {
      Alert.alert(
        'Ungültiger QR-Code',
        'Dies ist kein YASA-Einlade-Code.',
        [{ text: 'Erneut scannen', onPress: () => { setScanning(true); lastScan.current = null; } }]
      );
      return;
    }

    // Space-Name: erst aus Payload, dann aus lokalem Storage
    let displayName = payload.name ?? null;
    if (!displayName) {
      const spaces = await getSpaces();
      const found = spaces.find((s) => s.id === payload.spaceId);
      displayName = found?.name ?? null;
    }
    
    setSpaceName(displayName);
    setPendingPayload(payload);
    setModalVisible(true);
  }

  // ── Beitritt bestätigen ────────────────────────────────────────────────────
  async function handleConfirmJoin() {
    if (!pendingPayload) return;
    setJoining(true);

    const profile = await getProfile();
    if (!profile) {
      Alert.alert('Fehler', 'Kein Profil gefunden. Bitte erstelle zuerst ein ID-Profil.');
      setJoining(false);
      setModalVisible(false);
      router.replace('/');
      return;
    }

    // Prüfe ob neues Format mit Space-Metadaten vorhanden
    const hasFullPayload = pendingPayload.name && pendingPayload.ownerProfileId && pendingPayload.ownerDisplayName;

    if (hasFullPayload) {
      // Neues Format: Space lokal importieren
      const result = await importSpaceFromInvite(
        {
          spaceId: pendingPayload.spaceId,
          name: pendingPayload.name!,
          ownerProfileId: pendingPayload.ownerProfileId!,
          ownerDisplayName: pendingPayload.ownerDisplayName!,
          ownerAvatarUrl: pendingPayload.ownerAvatarUrl,
          inviteToken: pendingPayload.token,
        },
        profile
      );

      if (result.ok) {
        setModalVisible(false);
        router.replace('/(space)/choose');
      } else {
        setJoining(false);
        setModalVisible(false);
        Alert.alert('Import fehlgeschlagen', result.reason, [
          { text: 'Erneut scannen', onPress: () => { setScanning(true); lastScan.current = null; } },
          { text: 'Abbrechen', onPress: handleBack },
        ]);
      }
    } else {
      // Legacy-Format: alte joinSpace-Funktion nutzen
      const result = await joinSpace(pendingPayload.spaceId, pendingPayload.token, profile);

      if (result.ok) {
        setModalVisible(false);
        router.replace('/(space)/choose');
      } else {
        setJoining(false);
        setModalVisible(false);
        Alert.alert('Beitritt fehlgeschlagen', result.reason, [
          { text: 'Erneut scannen', onPress: () => { setScanning(true); lastScan.current = null; } },
          { text: 'Abbrechen', onPress: handleBack },
        ]);
      }
    }
  }

  function handleCancelJoin() {
    setModalVisible(false);
    setPendingPayload(null);
    setSpaceName(null);
    setScanning(true);
    lastScan.current = null;
  }

  // ── Permission-States ──────────────────────────────────────────────────────
  if (!permission) {
    // Noch nicht geladen
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.permissionTitle}>Kamerazugriff benötigt</Text>
        <Text style={styles.permissionText}>
          Um QR-Codes zu scannen, braucht YASA Zugriff auf deine Kamera.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Kamera erlauben</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonBack]}
          onPress={handleBack}
        >
          <Text style={styles.buttonText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Haupt-UI mit Kamera ────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Kamera Fullscreen */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanning ? handleBarCodeScanned : undefined}
      />

      {/* Overlay + Scan-Rahmen */}
      <View style={styles.overlay}>
        {/* Titel oben */}
        <View style={styles.topBar}>
          <Text style={styles.overlayTitle}>Per QR beitreten</Text>
          <Text style={styles.overlayHint}>Halte die Kamera auf den YASA-QR-Code</Text>
        </View>

        {/* Scan-Bereich */}
        <View style={styles.scanArea}>
          {/* Ecken-Rahmen */}
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />

          {!scanning && (
            <View style={styles.scanDoneOverlay}>
              <Text style={styles.scanDoneText}>✓</Text>
            </View>
          )}
        </View>

        {/* Abbrechen unten */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleBack}
          >
            <Text style={styles.cancelButtonText}>Abbrechen</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Bestätigungs-Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelJoin}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Space beitreten?</Text>

            {spaceName ? (
              <Text style={styles.modalSpaceName}>„{spaceName}"</Text>
            ) : (
              <Text style={styles.modalSpaceUnknown}>
                Space-Name konnte nicht geladen werden.
              </Text>
            )}

            <Text style={styles.modalHint}>
              Du wirst als Mitglied hinzugefügt.
            </Text>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonGhost]}
                onPress={handleCancelJoin}
                disabled={joining}
              >
                <Text style={styles.modalButtonGhostText}>Abbrechen</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, joining && styles.buttonDisabled]}
                onPress={handleConfirmJoin}
                disabled={joining}
              >
                {joining ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalButtonText}>Beitreten</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const CORNER_SIZE = 28;
const CORNER_THICKNESS = 4;
const CORNER_COLOR = '#2563EB';
const SCAN_AREA = 260;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  // ── Overlay ────────────────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBar: {
    paddingTop: 64,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  overlayTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textInverse,
    marginBottom: spacing.xs,
  },
  overlayHint: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },
  // ── Scan-Bereich ───────────────────────────────────────────────────────────
  scanArea: {
    width: SCAN_AREA,
    height: SCAN_AREA,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: CORNER_COLOR,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: CORNER_COLOR,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: CORNER_COLOR,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: CORNER_COLOR,
    borderBottomRightRadius: 4,
  },
  scanDoneOverlay: {
    position: 'absolute',
    width: SCAN_AREA,
    height: SCAN_AREA,
    backgroundColor: 'rgba(37,99,235,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  scanDoneText: {
    fontSize: 64,
    color: '#fff',
  },
  // ── Bottom Bar ─────────────────────────────────────────────────────────────
  bottomBar: {
    paddingBottom: 52,
  },
  cancelButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: borderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cancelButtonText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  // ── Permission Screen ──────────────────────────────────────────────────────
  permissionTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
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
  buttonBack: {
    backgroundColor: colors.secondary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  // ── Modal ──────────────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  modalSpaceName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  modalSpaceUnknown: {
    fontSize: typography.fontSize.sm,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  modalHint: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  modalButtonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  modalButtonGhostText: {
    color: '#374151',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
});

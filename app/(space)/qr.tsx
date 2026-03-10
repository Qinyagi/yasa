import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { getSpaces, getProfile } from '../../lib/storage';
import type { Space, UserProfile } from '../../types';

export default function QRScreen() {
  const router = useRouter();
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();

  const [space, setSpace] = useState<Space | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!spaceId) {
      setLoading(false);
      return;
    }
    Promise.all([getProfile(), getSpaces()]).then(([p, all]) => {
      const found = all.find((s) => s.id === spaceId) ?? null;
      setProfile(p);
      setSpace(found);
      setLoading(false);
    });
  }, [spaceId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!space) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Space nicht gefunden.</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('/(space)/choose')}
        >
          <Text style={styles.buttonText}>Zurück zu Spaces</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Zugriffsprüfung: nur Owner oder CoAdmin ──────────────────────────────────
  const profileId = profile?.id ?? '';
  const isOwner = profileId === space.ownerProfileId;
  const isCoAdmin = space.coAdminProfileIds.includes(profileId);
  const canSeeQR = isOwner || isCoAdmin;

  if (!canSeeQR) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{space.name}</Text>
        <View style={styles.restrictedBox}>
          <Text style={styles.restrictedText}>
            QR nur für Space-Ersteller / CoAdmins sichtbar.
          </Text>
          <Text style={styles.restrictedHint}>
            Bitte den Eigentümer oder einen CoAdmin, dir den QR-Code vor Ort zu zeigen.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('/(space)/choose')}
        >
          <Text style={styles.buttonText}>Zurück zu Spaces</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── QR anzeigen (Owner / CoAdmin) ────────────────────────────────────────────
  // QR-Payload enthält Space-Metadaten für Offline-Import auf Gerät B
  const payload = `yasa://join?spaceId=${space.id}&name=${encodeURIComponent(space.name)}&ownerId=${space.ownerProfileId}&ownerName=${encodeURIComponent(space.ownerDisplayName)}&token=${space.inviteToken}`;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{space.name}</Text>
      <Text style={styles.subtitle}>Einlade-QR</Text>

      {/* Echtes QR-Rendering – kein Copy, kein Share */}
      <View style={styles.qrWrapper}>
        <QRCode
          value={payload}
          size={240}
          color="#111111"
          backgroundColor="#FFFFFF"
        />
      </View>

      {/* Sicherheitshinweis */}
      <View style={styles.infoBox}>
        <Text style={styles.infoLabel}>⚠️  Nur vor Ort zeigen</Text>
        <Text style={styles.infoText}>
          QR nur vor Ort zeigen. Nicht weiterschicken oder teilen.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.replace('/(space)/choose')}
      >
        <Text style={styles.buttonText}>Zu meinen Spaces</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 28,
  },
  // ── Kein Zugriff ─────────────────────────────────────────────────────────────
  restrictedBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 16,
    width: '100%',
    marginTop: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
  },
  restrictedText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 8,
  },
  restrictedHint: {
    fontSize: 13,
    color: '#B91C1C',
    textAlign: 'center',
    lineHeight: 20,
  },
  // ── QR Wrapper ────────────────────────────────────────────────────────────────
  qrWrapper: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  infoBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 14,
    width: '100%',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 19,
  },
  button: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    marginBottom: 24,
    textAlign: 'center',
  },
});

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getProfile, addSpace, setCurrentSpaceId, generateUUID } from '../../lib/storage';
import type { Space } from '../../types';
import { colors, typography, spacing, borderRadius, accessibility } from '../../constants/theme';

// Zufälliges Invite-Token (8 Zeichen alphanumerisch)
function generateToken(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export default function CreateSpaceScreen() {
  const router = useRouter();
  const [spaceName, setSpaceName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    const name = spaceName.trim();
    if (name.length < 2) {
      Alert.alert('Ungültiger Name', 'Bitte mindestens 2 Zeichen eingeben.');
      return;
    }

    setSaving(true);
    try {
      const profile = await getProfile();
      if (!profile) {
        Alert.alert(
          'Kein Profil',
          'Du benötigst ein ID-Profil um einen Space zu erstellen.',
          [{ text: 'OK', onPress: () => router.replace('/') }]
        );
        return;
      }

      const space: Space = {
        id: generateUUID(),
        name,
        createdAt: new Date().toISOString(),
        ownerProfileId: profile.id,
        ownerDisplayName: profile.displayName,
        inviteToken: generateToken(),
        coAdminProfileIds: [],
        // Owner ist automatisch erstes Mitglied
        memberProfileIds: [profile.id],
        // Owner-Snapshot für Mitgliederliste in manage.tsx
        memberProfiles: [
          { id: profile.id, displayName: profile.displayName, avatarUrl: profile.avatarUrl },
        ],
      };

      await addSpace(space);
      await setCurrentSpaceId(space.id);

      // Direkt zum QR-Screen (replace vermeidet Back-Loop)
      router.replace(`/(space)/qr?spaceId=${space.id}`);
    } catch {
      Alert.alert('Fehler', 'Space konnte nicht erstellt werden.');
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Space erstellen</Text>
      <Text style={styles.hint}>
        Wähle einen Namen für deinen Space.{'\n'}
        Du bist automatisch Eigentümer.
      </Text>

      <Text style={styles.label}>Space-Name</Text>
      <TextInput
        style={styles.input}
        value={spaceName}
        onChangeText={setSpaceName}
        maxLength={40}
        placeholder="z.B. Spätschicht Team A"
        placeholderTextColor="#9CA3AF"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleCreate}
      />

      <TouchableOpacity
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Space erstellen</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.buttonBack]}
        onPress={() => router.back()}
        disabled={saving}
      >
        <Text style={styles.buttonText}>Zurück</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  hint: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  label: {
    alignSelf: 'flex-start',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: '#374151',
    marginBottom: spacing.sm,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    backgroundColor: '#F9FAFB',
    marginBottom: spacing.sm,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    width: '100%',
    alignItems: 'center',
    marginTop: spacing.md,
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
});

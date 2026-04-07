import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MultiavatarView } from '../../components/MultiavatarView';
import { generateNamesFromInitials } from '../../services/nameGenerator';
import { getProfile, updateProfileOnce } from '../../lib/storage';

interface Suggestion {
  displayName: string;
  avatarSeed: string;
}

const DEBOUNCE_MS = 250;
const CUSTOM_NAME_MIN = 3;
const CUSTOM_NAME_MAX = 30;
const CUSTOM_NAME_REGEX = /^[A-Za-zÄÖÜäöüß\s'\-]+$/;

export default function EditProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initials, setInitials] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);
  const [customName, setCustomName] = useState('');
  const [locked, setLocked] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const profile = await getProfile();
      if (!active) return;
      if (!profile) {
        Alert.alert('Fehler', 'Kein Profil gefunden.');
        router.replace('/(admin)');
        return;
      }
      setLocked(Boolean(profile.profileEditLocked));
      setCustomName(profile.displayName);
      setSelectedSuggestion({
        displayName: profile.displayName,
        avatarSeed: profile.avatarUrl,
      });
      setLoading(false);
    };
    void load();
    return () => {
      active = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [router]);

  function generateDebounced(raw: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const cleaned = raw.replace(/[^A-Za-zÄÖÜäöüß]/g, '').slice(0, 6);
    if (cleaned.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const result = generateNamesFromInitials(cleaned);
      const list: Suggestion[] = result.names.map((name) => ({
        displayName: name,
        avatarSeed: name.trim().toLowerCase(),
      }));
      setSuggestions(list);
    }, DEBOUNCE_MS);
  }

  function handleInitialsChange(raw: string) {
    const cleaned = raw.replace(/[^A-Za-zÄÖÜäöüß]/g, '').slice(0, 6);
    setInitials(cleaned);
    generateDebounced(cleaned);
  }

  function handleSelectSuggestion(suggestion: Suggestion) {
    setSelectedSuggestion(suggestion);
    setCustomName('');
    Keyboard.dismiss();
  }

  function handleCustomNameChange(raw: string) {
    setCustomName(raw.slice(0, CUSTOM_NAME_MAX));
    if (raw.trim().length > 0) setSelectedSuggestion(null);
  }

  const customTrimmed = customName.trim();
  const isCustomValid =
    customTrimmed.length >= CUSTOM_NAME_MIN &&
    customTrimmed.length <= CUSTOM_NAME_MAX &&
    CUSTOM_NAME_REGEX.test(customTrimmed);

  const finalDisplayName = useMemo(() => {
    if (customTrimmed.length > 0 && isCustomValid) return customTrimmed;
    if (selectedSuggestion) return selectedSuggestion.displayName;
    return null;
  }, [customTrimmed, isCustomValid, selectedSuggestion]);

  const finalAvatarSeed = useMemo(() => {
    if (customTrimmed.length > 0 && isCustomValid) return customTrimmed.toLowerCase();
    if (selectedSuggestion) return selectedSuggestion.avatarSeed;
    return '';
  }, [customTrimmed, isCustomValid, selectedSuggestion]);

  async function handleSave() {
    if (!finalDisplayName || !finalAvatarSeed) return;
    setSaving(true);
    const result = await updateProfileOnce({
      displayName: finalDisplayName,
      avatarUrl: finalAvatarSeed,
    });
    setSaving(false);
    if (!result.ok) {
      Alert.alert('Nicht möglich', result.reason);
      return;
    }
    Alert.alert('Gespeichert', 'Profil wurde einmalig aktualisiert und ist nun gesperrt.');
    router.replace('/(admin)');
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (locked) {
    return (
      <View style={styles.center}>
        <Text style={styles.lockTitle}>Profil ist gesperrt</Text>
        <Text style={styles.lockText}>
          Dein Profil wurde bereits einmal bearbeitet und bleibt jetzt stabil für die Space-Identifikation.
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(admin)')}>
          <Text style={styles.backButtonText}>Zurück zum Admin</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Profil einmalig bearbeiten</Text>
      <Text style={styles.hint}>
        Du kannst Name und Avatar einmal ändern. Danach wird das Profil gesperrt.
      </Text>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Initialen / Kürzel (2-6 Zeichen)</Text>
        <TextInput
          style={styles.input}
          value={initials}
          onChangeText={handleInitialsChange}
          placeholder="z. B. AB"
          maxLength={6}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {suggestions.length > 0 && (
        <View style={styles.suggestionsBox}>
          <Text style={styles.suggestionsLabel}>Namensvorschläge</Text>
          {suggestions.map((suggestion) => {
            const isActive = selectedSuggestion?.displayName === suggestion.displayName && customTrimmed.length === 0;
            return (
              <TouchableOpacity
                key={suggestion.displayName}
                style={[styles.suggestionRow, isActive && styles.suggestionRowSelected]}
                onPress={() => handleSelectSuggestion(suggestion)}
                disabled={saving}
              >
                <MultiavatarView seed={suggestion.avatarSeed} size={40} />
                <Text style={[styles.suggestionName, isActive && styles.suggestionNameSelected]}>
                  {suggestion.displayName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Eigener Fantasiename</Text>
        <TextInput
          style={styles.input}
          value={customName}
          onChangeText={handleCustomNameChange}
          placeholder="z. B. Night Owl"
          maxLength={CUSTOM_NAME_MAX}
          autoCapitalize="words"
          autoCorrect={false}
        />
      </View>

      {finalDisplayName && (
        <View style={styles.previewBox}>
          <MultiavatarView seed={finalAvatarSeed} size={56} />
          <View>
            <Text style={styles.previewLabel}>Neue Identität</Text>
            <Text style={styles.previewName}>{finalDisplayName}</Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.saveButton, (!finalDisplayName || saving) && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!finalDisplayName || saving}
      >
        <Text style={styles.saveButtonText}>{saving ? 'Speichern...' : 'Einmalig speichern'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(admin)')} disabled={saving}>
        <Text style={styles.backButtonText}>Zurück</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 60,
    paddingBottom: 36,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 20,
    lineHeight: 20,
  },
  fieldBlock: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#F9FAFB',
  },
  suggestionsBox: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 14,
  },
  suggestionsLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  suggestionRowSelected: {
    backgroundColor: '#EFF6FF',
  },
  suggestionName: {
    fontSize: 16,
    color: '#111',
    fontWeight: '600',
  },
  suggestionNameSelected: {
    color: '#1D4ED8',
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  previewLabel: {
    fontSize: 11,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  previewName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  saveButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 10,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  backButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 13,
  },
  backButtonText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  },
  lockTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  lockText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
});


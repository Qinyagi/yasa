import { useState, useRef, useCallback } from 'react';
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
import { generateNamesFromInitials } from '../../services/nameGenerator';
import { setProfile, generateUUID } from '../../lib/storage';
import { MultiavatarView } from '../../components/MultiavatarView';
import type { UserProfile } from '../../types';

// ─── Konstanten ────────────────────────────────────────────────────────────────
const DEBOUNCE_MS = 300;
const CUSTOM_NAME_MIN = 3;
const CUSTOM_NAME_MAX = 30;
const CUSTOM_NAME_REGEX = /^[A-Za-zÄÖÜäöüß\s'\-]+$/;

interface Suggestion {
  displayName: string;
  avatarSeed: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreateProfileScreen() {
  const router = useRouter();

  // Kürzel-Feld (Feld A)
  const [initials, setInitials] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);

  // Manueller Fantasiename (Feld B)
  const [customName, setCustomName] = useState('');

  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Debounced Vorschlags-Generierung ──────────────────────────────────────
  const generateDebounced = useCallback((raw: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const cleaned = raw.replace(/[^A-Za-zÄÖÜäöüß]/g, '').slice(0, 6);
    if (cleaned.length < 2) {
      setSuggestions([]);
      setSelectedSuggestion(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const result = generateNamesFromInitials(cleaned);
      if (result.names.length > 0) {
        const list: Suggestion[] = result.names.map((name) => ({
          displayName: name,
          avatarSeed: name.trim().toLowerCase(),
        }));
        setSuggestions(list);
      } else {
        setSuggestions([]);
      }
      setSelectedSuggestion(null);
    }, DEBOUNCE_MS);
  }, []);

  // ── Kürzel-Input Handler ──────────────────────────────────────────────────
  function handleInitialsChange(raw: string) {
    // Nur Buchstaben, max 6
    const cleaned = raw.replace(/[^A-Za-zÄÖÜäöüß]/g, '').slice(0, 6);
    setInitials(cleaned);
    // Wenn custom eingetippt war → löscht die Eingabe der Kürzel die Selektion nicht,
    // aber Vorschläge werden aktualisiert
    generateDebounced(cleaned);
  }

  // ── Vorschlag auswählen ───────────────────────────────────────────────────
  function handleSelectSuggestion(s: Suggestion) {
    setSelectedSuggestion(s);
    // Custom-Name leeren → Vorschlag hat Vorrang visuell
    setCustomName('');
    Keyboard.dismiss();
  }

  // ── Custom-Name Handler ───────────────────────────────────────────────────
  function handleCustomNameChange(raw: string) {
    const trimmed = raw.slice(0, CUSTOM_NAME_MAX);
    setCustomName(trimmed);
    // Sobald Custom eingegeben → Vorschlag abwählen
    if (trimmed.trim().length > 0) {
      setSelectedSuggestion(null);
    }
  }

  // ── Finalen Namen bestimmen ───────────────────────────────────────────────
  const customTrimmed = customName.trim();
  const isCustomValid =
    customTrimmed.length >= CUSTOM_NAME_MIN &&
    customTrimmed.length <= CUSTOM_NAME_MAX &&
    CUSTOM_NAME_REGEX.test(customTrimmed);

  // Custom hat Priorität wenn ausgefüllt + valid
  const finalDisplayName: string | null = (() => {
    if (customTrimmed.length > 0 && isCustomValid) return customTrimmed;
    if (selectedSuggestion) return selectedSuggestion.displayName;
    return null;
  })();

  const finalAvatarSeed: string = (() => {
    if (customTrimmed.length > 0 && isCustomValid) return customTrimmed.toLowerCase();
    if (selectedSuggestion) return selectedSuggestion.avatarSeed;
    return '';
  })();

  const canCreate = !!finalDisplayName && !saving;

  // ── Profil erstellen ──────────────────────────────────────────────────────
  async function handleCreate() {
    if (!finalDisplayName) return;
    setSaving(true);
    try {
      const profile: UserProfile = {
        id: generateUUID(),
        displayName: finalDisplayName,
        avatarUrl: finalAvatarSeed,
        createdAt: new Date().toISOString(),
      };
      await setProfile(profile);
      router.replace('/(space)/choose');
    } catch {
      Alert.alert('Fehler', 'Profil konnte nicht gespeichert werden.');
      setSaving(false);
    }
  }

  // ── Custom-Name Validierungsfeedback ──────────────────────────────────────
  const showCustomError =
    customTrimmed.length > 0 &&
    customTrimmed.length < CUSTOM_NAME_MIN;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>ID-Profil erstellen</Text>
      <Text style={styles.hint}>
        Gib ein Kürzel ein – dein echter Name wird nicht gespeichert.
      </Text>

      {/* ── Feld A: Kürzel / Initialen ─────────────────────────────── */}
      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Initialen / Kürzel (2–6 Zeichen)</Text>
        <TextInput
          style={styles.input}
          value={initials}
          onChangeText={handleInitialsChange}
          maxLength={6}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="z. B. ThMu oder TM"
          placeholderTextColor="#9CA3AF"
          returnKeyType="done"
        />
      </View>

      {/* ── Vorschlagsliste ────────────────────────────────────────── */}
      {suggestions.length > 0 && (
        <View style={styles.suggestionsBox}>
          <Text style={styles.suggestionsLabel}>Wähle einen Anzeigenamen:</Text>
          {suggestions.map((s) => {
            const isSelected =
              selectedSuggestion?.displayName === s.displayName &&
              customTrimmed.length === 0;
            return (
              <TouchableOpacity
                key={s.displayName}
                style={[
                  styles.suggestionRow,
                  isSelected && styles.suggestionRowSelected,
                ]}
                onPress={() => handleSelectSuggestion(s)}
                disabled={saving}
                activeOpacity={0.7}
              >
                <MultiavatarView seed={s.avatarSeed} size={44} />
                <Text
                  style={[
                    styles.suggestionName,
                    isSelected && styles.suggestionNameSelected,
                  ]}
                >
                  {s.displayName}
                </Text>
                {isSelected && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Trennlinie ─────────────────────────────────────────────── */}
      {suggestions.length > 0 && (
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>oder</Text>
          <View style={styles.dividerLine} />
        </View>
      )}

      {/* ── Feld B: Manueller Fantasiename ─────────────────────────── */}
      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Eigener Fantasiename (optional)</Text>
        <TextInput
          style={styles.input}
          value={customName}
          onChangeText={handleCustomNameChange}
          maxLength={CUSTOM_NAME_MAX}
          autoCapitalize="words"
          autoCorrect={false}
          placeholder="z. B. Rori McClaussen"
          placeholderTextColor="#9CA3AF"
          returnKeyType="done"
          onSubmitEditing={canCreate ? handleCreate : undefined}
        />
        {showCustomError && (
          <Text style={styles.fieldError}>Mindestens {CUSTOM_NAME_MIN} Zeichen</Text>
        )}
      </View>

      {/* ── Avatar-Vorschau + Name ─────────────────────────────────── */}
      {finalDisplayName && (
        <View style={styles.previewBox}>
          <MultiavatarView seed={finalAvatarSeed} size={56} />
          <View style={styles.previewTextCol}>
            <Text style={styles.previewLabel}>Dein Profil wird:</Text>
            <Text style={styles.previewName}>{finalDisplayName}</Text>
          </View>
        </View>
      )}

      {/* ── CTA Button ─────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.ctaButton, !canCreate && styles.ctaButtonDisabled]}
        onPress={handleCreate}
        disabled={!canCreate}
        activeOpacity={0.8}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.ctaButtonText}>Profil erstellen</Text>
        )}
      </TouchableOpacity>

      {/* ── Zurück ─────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.replace('/')}
        disabled={saving}
      >
        <Text style={styles.backButtonText}>Zurück</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    color: '#111',
    textAlign: 'center',
  },
  hint: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
  // Felder
  fieldBlock: {
    width: '100%',
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    color: '#374151',
    marginBottom: 6,
    fontWeight: '700',
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
  fieldError: {
    color: '#DC2626',
    fontSize: 12,
    marginTop: 4,
  },
  // Vorschläge
  suggestionsBox: {
    width: '100%',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    overflow: 'hidden',
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
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 12,
  },
  suggestionRowSelected: {
    backgroundColor: '#EFF6FF',
    borderTopColor: '#DBEAFE',
  },
  suggestionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    flex: 1,
  },
  suggestionNameSelected: {
    color: '#1D4ED8',
  },
  checkmark: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2563EB',
  },
  // Trennlinie
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  // Vorschau-Box
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 12,
    padding: 14,
    gap: 14,
    marginBottom: 20,
  },
  previewTextCol: {
    flex: 1,
  },
  previewLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  previewName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#065F46',
  },
  // CTA
  ctaButton: {
    backgroundColor: '#059669',
    paddingVertical: 15,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  ctaButtonDisabled: {
    backgroundColor: '#A7F3D0',
  },
  ctaButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Zurück
  backButton: {
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  backButtonText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  },
});

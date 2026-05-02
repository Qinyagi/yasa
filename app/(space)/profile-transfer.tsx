import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useNavigation } from '@react-navigation/native';
import { MultiavatarView } from '../../components/MultiavatarView';
import { colors, typography, spacing, borderRadius, accessibility, SHIFT_META, SHIFT_SEQUENCE } from '../../constants/theme';
import { buildProfileTransferPayload } from '../../lib/profileTransfer';
import { pushSpacesToBackend } from '../../lib/backend/teamSync';
import {
  deletePreparedIdProfile,
  formatDateISO,
  generateUUID,
  getPreparedIdProfiles,
  getProfile,
  getSpaceShiftPatternVault,
  getSpaces,
  todayISO,
  upsertPreparedIdProfile,
} from '../../lib/storage';
import { generateNamesFromInitials } from '../../services/nameGenerator';
import type { ShiftType, Space, UserProfile } from '../../types';
import type { ShiftPatternTemplate } from '../../types/timeAccount';
import type { PreparedIdProfile, PreparedProfileStatus } from '../../types/preparedProfile';

const DEBOUNCE_MS = 300;
const CUSTOM_NAME_MIN = 3;
const CUSTOM_NAME_MAX = 30;
const CUSTOM_NAME_REGEX = /^[A-Za-zÄÖÜäöüß\s'\-]+$/;

interface Suggestion {
  displayName: string;
  avatarSeed: string;
}

function statusLabel(status: PreparedProfileStatus): string {
  switch (status) {
    case 'configured':
      return 'Dienstplan zugewiesen';
    case 'ready-to-transfer':
      return 'Bereit zur Übergabe';
    case 'transferred':
      return 'Übertragen';
    default:
      return 'Vorbereitet';
  }
}

function normalizeTemplatePattern(template: ShiftPatternTemplate): ShiftType[] {
  const cycleLength = Math.max(1, Math.round(template.cycleLengthDays));
  return template.pattern
    .slice(0, cycleLength)
    .map((code) => (SHIFT_SEQUENCE.includes(code as ShiftType) ? (code as ShiftType) : 'R'));
}

function addDaysISO(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDateISO(date);
}

function diffDaysUTC(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split('-').map(Number);
  const [by, bm, bd] = bISO.split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.floor((b - a) / 86_400_000);
}

function todayIndexFromAnchor(anchorDateISO: string, cycleLengthDays: number): number {
  const cycle = Math.max(1, Math.round(cycleLengthDays));
  const diff = diffDaysUTC(anchorDateISO, todayISO());
  return ((diff % cycle) + cycle) % cycle;
}

export default function ProfileTransferScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [preparedProfiles, setPreparedProfiles] = useState<PreparedIdProfile[]>([]);
  const [patternVault, setPatternVault] = useState<ShiftPatternTemplate[]>([]);
  const [selectedPreparedId, setSelectedPreparedId] = useState<string | null>(null);
  const [initials, setInitials] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);
  const [customName, setCustomName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedPatternTodayIndex, setSelectedPatternTodayIndex] = useState<number | null>(null);
  const [editingPreparedId, setEditingPreparedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(admin)');
  }, [navigation, router]);

  const loadData = useCallback(async () => {
    if (!spaceId) {
      setLoading(false);
      return;
    }
    const [p, spaces, prepared, vault] = await Promise.all([
      getProfile(),
      getSpaces(),
      getPreparedIdProfiles(spaceId),
      getSpaceShiftPatternVault(spaceId),
    ]);
    setProfile(p);
    setSpace(spaces.find((item) => item.id === spaceId) ?? null);
    setPreparedProfiles(prepared);
    setPatternVault(vault);
    setSelectedPreparedId((current) => current ?? prepared[0]?.id ?? null);
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    loadData().catch(() => setLoading(false));
  }, [loadData]);

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
      setSuggestions(
        result.names.map((name) => ({
          displayName: name,
          avatarSeed: name.trim().toLowerCase(),
        }))
      );
      setSelectedSuggestion(null);
    }, DEBOUNCE_MS);
  }, []);

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
    const next = raw.slice(0, CUSTOM_NAME_MAX);
    setCustomName(next);
    if (next.trim().length > 0) setSelectedSuggestion(null);
  }

  function resetForm() {
    setInitials('');
    setSuggestions([]);
    setSelectedSuggestion(null);
    setCustomName('');
    setSelectedTemplateId(null);
    setSelectedPatternTodayIndex(null);
    setEditingPreparedId(null);
  }

  function buildAssignedPattern(template: ShiftPatternTemplate) {
    if (selectedPatternTodayIndex == null) return null;
    const pattern = normalizeTemplatePattern(template);
    const cycleLengthDays = Math.max(1, Math.round(template.cycleLengthDays));
    const patternTodayIndex = Math.max(0, Math.min(cycleLengthDays - 1, selectedPatternTodayIndex));
    return {
      templateId: template.id,
      templateName: template.name,
      pattern,
      cycleLengthDays,
      anchorDateISO: addDaysISO(todayISO(), -patternTodayIndex),
      patternTodayIndex,
    };
  }

  function handleStartEdit(item: PreparedIdProfile) {
    setEditingPreparedId(item.id);
    setSelectedPreparedId(item.id);
    setInitials('');
    setSuggestions([]);
    setSelectedSuggestion(null);
    setCustomName(item.displayName);
    setSelectedTemplateId(item.assignedPattern?.templateId ?? null);
    setSelectedPatternTodayIndex(
      item.assignedPattern
        ? item.assignedPattern.patternTodayIndex ??
            todayIndexFromAnchor(item.assignedPattern.anchorDateISO, item.assignedPattern.cycleLengthDays)
        : null
    );
  }

  async function pushPreparedRosterBestEffort(ownerProfileId: string) {
    try {
      await pushSpacesToBackend(await getSpaces(), ownerProfileId);
    } catch {
      // best effort; the next Host-side team sync retries the roster push
    }
  }

  async function handleSavePreparedProfile() {
    if (!profile || !space || saving) return;
    const displayName = finalDisplayName;
    const avatarUrl = finalAvatarSeed;
    if (!displayName || !avatarUrl) {
      Alert.alert('Hinweis', 'Bitte erst ein ID-Profil auswählen oder einen Fantasienamen eingeben.');
      return;
    }

    const template = patternVault.find((item) => item.id === selectedTemplateId) ?? null;
    if (template && selectedPatternTodayIndex == null) {
      Alert.alert('Heute im Muster fehlt', 'Bitte wähle aus, welcher Tag im Schichtmuster heute ist.');
      return;
    }
    const existing = preparedProfiles.find((item) => item.id === editingPreparedId) ?? null;
    const assignedPattern = template ? buildAssignedPattern(template) ?? undefined : undefined;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const item: PreparedIdProfile = {
        id: existing?.id ?? generateUUID(),
        spaceId: space.id,
        profileId: existing?.profileId ?? generateUUID(),
        displayName,
        avatarUrl,
        status: assignedPattern ? 'ready-to-transfer' : 'prepared',
        assignedPattern,
        createdByProfileId: profile.id,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        transferredAt: existing?.transferredAt,
      };
      const next = await upsertPreparedIdProfile(item);
      await pushPreparedRosterBestEffort(profile.id);
      setPreparedProfiles(next);
      setSelectedPreparedId(item.id);
      resetForm();
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkTransferred(item: PreparedIdProfile) {
    const now = new Date().toISOString();
    const next = await upsertPreparedIdProfile({
      ...item,
      status: 'transferred',
      transferredAt: now,
      updatedAt: now,
    });
    if (profile) await pushPreparedRosterBestEffort(profile.id);
    setPreparedProfiles(next);
  }

  async function handleDelete(item: PreparedIdProfile) {
    Alert.alert('Vorbereitetes Profil löschen?', item.displayName, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          const next = await deletePreparedIdProfile(item.spaceId, item.id);
          if (profile) await pushPreparedRosterBestEffort(profile.id);
          setPreparedProfiles(next);
          setSelectedPreparedId((current) => (current === item.id ? next[0]?.id ?? null : current));
        },
      },
    ]);
  }

  const customTrimmed = customName.trim();
  const isCustomValid =
    customTrimmed.length >= CUSTOM_NAME_MIN &&
    customTrimmed.length <= CUSTOM_NAME_MAX &&
    CUSTOM_NAME_REGEX.test(customTrimmed);
  const finalDisplayName =
    customTrimmed.length > 0 && isCustomValid
      ? customTrimmed
      : selectedSuggestion?.displayName ?? null;
  const finalAvatarSeed =
    customTrimmed.length > 0 && isCustomValid
      ? customTrimmed.toLowerCase()
      : selectedSuggestion?.avatarSeed ?? '';
  const selectedTemplate = patternVault.find((item) => item.id === selectedTemplateId) ?? null;
  const selectedTemplatePattern = selectedTemplate ? normalizeTemplatePattern(selectedTemplate) : [];
  const computedAnchorDateISO =
    selectedTemplate && selectedPatternTodayIndex != null
      ? addDaysISO(todayISO(), -selectedPatternTodayIndex)
      : null;
  const selectedPrepared = preparedProfiles.find((item) => item.id === selectedPreparedId) ?? null;
  const isOwner = !!profile && !!space && profile.id === space.ownerProfileId;
  const ownerSnapshot = space?.memberProfiles.find((m) => m.id === space.ownerProfileId);
  const transferPayload =
    profile && space && selectedPrepared
      ? buildProfileTransferPayload({
          version: '1',
          profileId: selectedPrepared.profileId,
          displayName: selectedPrepared.displayName,
          avatarUrl: selectedPrepared.avatarUrl,
          createdAt: selectedPrepared.createdAt,
          createdByProfileId: selectedPrepared.createdByProfileId,
          spaceId: space.id,
          spaceName: space.name,
          ownerProfileId: space.ownerProfileId,
          ownerDisplayName: space.ownerDisplayName,
          ownerAvatarUrl: ownerSnapshot?.avatarUrl ?? profile.avatarUrl,
          inviteToken: space.inviteToken,
          assignedPattern: selectedPrepared.assignedPattern,
        })
      : null;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!space || !profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Space oder Profil nicht gefunden.</Text>
        <TouchableOpacity style={styles.button} onPress={handleBack}>
          <Text style={styles.buttonText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!isOwner) {
    return (
      <View style={styles.center}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.title}>Kein Zugriff</Text>
        <Text style={styles.hint}>Schlüsselfertige ID-Profile kann nur der Space-Host vorbereiten.</Text>
        <TouchableOpacity style={styles.button} onPress={handleBack}>
          <Text style={styles.buttonText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>ID-Profile vorbereiten</Text>
      <Text style={styles.subtitle}>{space.name}</Text>
      <Text style={styles.hint}>
        Lege schlüsselfertige YASA-Accounts für dein reales Team an und übergib sie später per QR.
      </Text>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Account-Vault</Text>
        <Text style={styles.infoText}>
          Ein vorbereitetes ID-Profil kann bereits ein Schichtmuster enthalten. Der Transfer richtet
          Profil, Space und Dienstplan auf dem neuen Gerät ein.
        </Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Neues ID-Profil</Text>
        <Text style={styles.label}>Initialen / Kürzel</Text>
        <TextInput
          style={styles.input}
          value={initials}
          onChangeText={handleInitialsChange}
          maxLength={6}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="z. B. TM"
          placeholderTextColor="#9CA3AF"
        />

        {suggestions.length > 0 && (
          <View style={styles.suggestionsBox}>
            {suggestions.map((suggestion) => {
              const isSelected =
                selectedSuggestion?.displayName === suggestion.displayName &&
                customTrimmed.length === 0;
              return (
                <TouchableOpacity
                  key={suggestion.displayName}
                  style={[styles.suggestionRow, isSelected && styles.suggestionRowSelected]}
                  onPress={() => handleSelectSuggestion(suggestion)}
                >
                  <MultiavatarView seed={suggestion.avatarSeed} size={36} />
                  <Text style={[styles.suggestionName, isSelected && styles.suggestionNameSelected]}>
                    {suggestion.displayName}
                  </Text>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={styles.label}>Eigener Fantasiename</Text>
        <TextInput
          style={styles.input}
          value={customName}
          onChangeText={handleCustomNameChange}
          maxLength={CUSTOM_NAME_MAX}
          autoCapitalize="words"
          autoCorrect={false}
          placeholder="z. B. Rori McClaussen"
          placeholderTextColor="#9CA3AF"
        />

        {finalDisplayName && (
          <View style={styles.previewBox}>
            <MultiavatarView seed={finalAvatarSeed} size={48} />
            <View style={styles.previewTextCol}>
              <Text style={styles.previewLabel}>Neuer Account</Text>
              <Text style={styles.previewName}>{finalDisplayName}</Text>
            </View>
          </View>
        )}

        <Text style={styles.label}>Schichtmuster zuweisen</Text>
        {patternVault.length === 0 ? (
          <Text style={styles.emptyText}>Noch kein Muster im Space-Schichtmuster Vault.</Text>
        ) : (
          <View style={styles.templateList}>
            <TouchableOpacity
              style={[styles.templateChip, selectedTemplateId === null && styles.templateChipActive]}
              onPress={() => {
                setSelectedTemplateId(null);
                setSelectedPatternTodayIndex(null);
              }}
            >
              <Text style={[styles.templateChipText, selectedTemplateId === null && styles.templateChipTextActive]}>
                Später zuweisen
              </Text>
            </TouchableOpacity>
            {patternVault.map((template) => {
              const selected = selectedTemplateId === template.id;
              return (
                <TouchableOpacity
                  key={template.id}
                  style={[styles.templateChip, selected && styles.templateChipActive]}
                  onPress={() => {
                    setSelectedTemplateId(template.id);
                    setSelectedPatternTodayIndex(null);
                  }}
                >
                  <Text style={[styles.templateChipText, selected && styles.templateChipTextActive]}>
                    {template.name}
                  </Text>
                  <Text style={styles.templateChipMeta}>
                    {template.cycleLengthDays} Tage
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {selectedTemplate && (
          <>
            <Text style={styles.label}>Wo steht dieses Muster heute?</Text>
            <Text style={styles.patternFitHint}>
              Wähle den Zyklus-Tag, der für dieses Team-Member heute gilt. YASA berechnet daraus
              denselben Startanker wie im normalen Schichtmuster-Setup.
            </Text>
            <View style={styles.patternIndexGrid}>
              {selectedTemplatePattern.map((code, index) => {
                const meta = SHIFT_META[code];
                const selected = selectedPatternTodayIndex === index;
                return (
                  <TouchableOpacity
                    key={`${selectedTemplate.id}-${index}`}
                    style={[
                      styles.patternIndexChip,
                      { backgroundColor: meta.bg, borderColor: selected ? colors.primary : meta.bg },
                      selected && styles.patternIndexChipSelected,
                    ]}
                    onPress={() => setSelectedPatternTodayIndex(index)}
                  >
                    <Text style={[styles.patternIndexNumber, { color: meta.fg }]}>Tag {index + 1}</Text>
                    <Text style={[styles.patternIndexCode, { color: meta.fg }]}>{code}</Text>
                    {selected && <Text style={styles.patternIndexToday}>Heute</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
            {computedAnchorDateISO && (
              <Text style={styles.anchorPreview}>
                Startanker: {computedAnchorDateISO} · Heute = Tag {(selectedPatternTodayIndex ?? 0) + 1}
              </Text>
            )}
          </>
        )}

        <TouchableOpacity
          style={[styles.button, (!finalDisplayName || saving) && styles.buttonDisabled]}
          onPress={handleSavePreparedProfile}
          disabled={!finalDisplayName || saving}
        >
          <Text style={styles.buttonText}>
            {saving
              ? 'Speichert...'
              : editingPreparedId
                ? 'ID-Profil aktualisieren'
                : 'ID-Profil im Vault anlegen'}
          </Text>
        </TouchableOpacity>
        {editingPreparedId && (
          <TouchableOpacity style={[styles.button, styles.buttonBack]} onPress={resetForm}>
            <Text style={styles.buttonBackText}>Bearbeiten abbrechen</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Vorbereitete ID-Profile ({preparedProfiles.length})</Text>
        {preparedProfiles.length === 0 ? (
          <Text style={styles.emptyText}>Noch kein vorbereitetes ID-Profil.</Text>
        ) : (
          preparedProfiles.map((item) => {
            const selected = selectedPreparedId === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.preparedCard, selected && styles.preparedCardSelected]}
                onPress={() => setSelectedPreparedId(item.id)}
              >
                <View style={styles.preparedHeader}>
                  <MultiavatarView seed={item.avatarUrl} size={42} />
                  <View style={styles.preparedInfo}>
                    <Text style={styles.preparedName}>{item.displayName}</Text>
                    <Text style={styles.preparedMeta}>{statusLabel(item.status)}</Text>
                  </View>
                </View>
                <Text style={styles.preparedPattern}>
                  {item.assignedPattern
                    ? `Muster: ${item.assignedPattern.templateName} · Heute = Tag ${
                        (item.assignedPattern.patternTodayIndex ??
                          todayIndexFromAnchor(item.assignedPattern.anchorDateISO, item.assignedPattern.cycleLengthDays)) + 1
                      } · Start ${item.assignedPattern.anchorDateISO}`
                    : 'Noch kein Dienstplanmuster zugewiesen'}
                </Text>
                <View style={styles.preparedActions}>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => handleStartEdit(item)}>
                    <Text style={styles.smallBtnText}>Bearbeiten</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => handleMarkTransferred(item)}>
                    <Text style={styles.smallBtnText}>Als übertragen markieren</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.smallBtn, styles.smallBtnDanger]} onPress={() => handleDelete(item)}>
                    <Text style={styles.smallBtnDangerText}>Löschen</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {selectedPrepared && transferPayload && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Transfer-QR</Text>
          <Text style={styles.transferIntro}>
            Übergabe für {selectedPrepared.displayName}
          </Text>
          <View style={styles.qrWrapper}>
            <QRCode value={transferPayload} size={230} color="#111111" backgroundColor="#FFFFFF" />
          </View>
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>Nur vor Ort zeigen</Text>
            <Text style={styles.warningText}>
              Dieser QR überträgt den vorbereiteten YASA-Account. Nicht weiterschicken.
            </Text>
          </View>
        </View>
      )}

      <TouchableOpacity style={[styles.button, styles.buttonBack]} onPress={handleBack}>
        <Text style={styles.buttonBackText}>Zurück</Text>
      </TouchableOpacity>
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
  container: {
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
    paddingTop: 60,
    paddingBottom: 48,
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  hint: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  lockIcon: {
    fontSize: 54,
    marginBottom: spacing.md,
  },
  infoBox: {
    width: '100%',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  infoTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: '#065F46',
    marginBottom: 4,
  },
  infoText: {
    fontSize: typography.fontSize.sm,
    color: '#166534',
    lineHeight: 20,
  },
  sectionCard: {
    width: '100%',
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: spacing.sm,
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    marginBottom: spacing.sm,
  },
  suggestionsBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
  },
  suggestionRowSelected: {
    backgroundColor: '#EFF6FF',
  },
  suggestionName: {
    flex: 1,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
  },
  suggestionNameSelected: {
    color: colors.primary,
  },
  checkmark: {
    color: colors.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  previewTextCol: {
    flex: 1,
  },
  previewLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 2,
    textTransform: 'uppercase',
    fontWeight: typography.fontWeight.semibold,
  },
  previewName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  templateList: {
    gap: spacing.sm,
  },
  templateChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  templateChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBackground,
  },
  templateChipText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  templateChipTextActive: {
    color: colors.primary,
  },
  templateChipMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  patternFitHint: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  patternIndexGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  patternIndexChip: {
    width: 76,
    minHeight: 66,
    borderWidth: 1.5,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  patternIndexChipSelected: {
    borderWidth: 3,
    transform: [{ scale: 1.03 }],
  },
  patternIndexNumber: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    opacity: 0.75,
    marginBottom: 2,
  },
  patternIndexCode: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  patternIndexToday: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
    backgroundColor: colors.background,
    borderRadius: 7,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  anchorPreview: {
    fontSize: typography.fontSize.xs,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.sm,
  },
  anchorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  anchorInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  todayBtn: {
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtnText: {
    color: colors.textInverse,
    fontWeight: typography.fontWeight.semibold,
  },
  preparedCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  preparedCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBackground,
  },
  preparedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  preparedInfo: {
    flex: 1,
  },
  preparedName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  preparedMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  preparedPattern: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  preparedActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  smallBtn: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 38,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.sm,
  },
  smallBtnText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
  },
  smallBtnDanger: {
    borderColor: colors.errorLight,
  },
  smallBtnDangerText: {
    fontSize: typography.fontSize.xs,
    color: colors.error,
    fontWeight: typography.fontWeight.semibold,
  },
  transferIntro: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  qrWrapper: {
    alignSelf: 'center',
    padding: spacing.md,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  warningBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: '#FCD34D',
    padding: spacing.md,
  },
  warningTitle: {
    color: '#92400E',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 4,
  },
  warningText: {
    color: '#78350F',
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  button: {
    width: '100%',
    minHeight: accessibility.minTapHeight,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
  },
  buttonBack: {
    backgroundColor: colors.backgroundTertiary,
    marginTop: spacing.lg,
  },
  buttonBackText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  errorText: {
    fontSize: typography.fontSize.base,
    color: colors.error,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
});

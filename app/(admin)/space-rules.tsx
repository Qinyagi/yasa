/**
 * Admin: Space-Regelprofil pflegen
 * Nur Owner/CoAdmin dürfen diese Daten bearbeiten.
 * Kein Rechtsanspruch – Prognose-Regelwerk.
 */
import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Switch, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  getProfile, getSpaces, getSpaceRuleProfile, setSpaceRuleProfile,
} from '../../lib/storage';
import type { Space, UserProfile } from '../../types';
import type { SpaceRuleProfile } from '../../types/timeAccount';
import {
  BUNDESLAND_LABELS, SUPPORTED_BUNDESLAENDER,
  type Bundesland,
} from '../../data/schoolHolidays';
import { colors, typography, spacing, borderRadius, accessibility } from '../../constants/theme';

// ─── Branchen-Vorschläge ──────────────────────────────────────────────────────

const BRANCHE_OPTIONS = [
  'Gesundheit / Pflege',
  'Öffentlicher Dienst',
  'Einzelhandel',
  'Produktion / Industrie',
  'Transport / Logistik',
  'Sonstiges',
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function SpaceRulesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(admin)');
  }, [navigation, router]);

  const [loading, setLoading]     = useState(true);
  const [saving,  setSaving]      = useState(false);
  const [profile, setProfile]     = useState<UserProfile | null>(null);
  const [space,   setSpace]       = useState<Space | null>(null);
  const [canEdit, setCanEdit]     = useState(false);

  // Formular-State
  const [bundesland,        setBundesland]        = useState('NW');
  const [branche,           setBranche]           = useState('');
  const [ruleProfileName,   setRuleProfileName]   = useState('');
  const [sourceLabel,       setSourceLabel]       = useState('');
  const [sourceUrl,         setSourceUrl]         = useState('');
  const [wEnabled,          setWEnabled]          = useState(false);
  const [tEnabled,          setTEnabled]          = useState(false);
  const [holidayCreditOn,   setHolidayCreditOn]   = useState(false);
  const [holidayHours,      setHolidayHours]      = useState('7.7');
  const [preHolidayCreditOn,setPreHolidayCreditOn]= useState(false);
  const [preHolidayHours,   setPreHolidayHours]   = useState('3.85');
  const [schoolDefault,     setSchoolDefault]     = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      Promise.all([getProfile(), getSpaces()]).then(async ([p, spaces]) => {
        if (!active) return;
        setProfile(p);
        const s = spaces.find((x) => x.id === spaceId) ?? null;
        setSpace(s);

        if (p && s) {
          const isOwner   = p.id === s.ownerProfileId;
          const isCoAdmin = s.coAdminProfileIds.includes(p.id);
          setCanEdit(isOwner || isCoAdmin);
        }

        if (spaceId) {
          const existing = await getSpaceRuleProfile(spaceId);
          if (active && existing) {
            setBundesland(existing.bundesland);
            setBranche(existing.branche);
            setRuleProfileName(existing.ruleProfileName);
            setSourceLabel(existing.sourceLabel);
            setSourceUrl(existing.sourceUrl ?? '');
            setWEnabled(existing.codeRules.W?.enabled ?? false);
            setTEnabled(existing.codeRules.T?.enabled ?? false);
            setHolidayCreditOn(existing.holidayCredit.enabled);
            setHolidayHours(String(existing.holidayCredit.hoursPerHolidayShift));
            setPreHolidayCreditOn(existing.preHolidayCredit.enabled);
            setPreHolidayHours(String(existing.preHolidayCredit.hoursPerOccurrence));
            setSchoolDefault(existing.schoolHolidaysEnabledByDefault);
          }
        }
        if (active) setLoading(false);
      });
      return () => { active = false; };
    }, [spaceId])
  );

  async function handleSave() {
    if (!spaceId) return;
    if (!ruleProfileName.trim()) {
      Alert.alert('Fehler', 'Bitte gib einen Regelprofil-Namen ein.');
      return;
    }
    if (!sourceLabel.trim()) {
      Alert.alert('Fehler', 'Bitte gib ein Quellen-Label ein.');
      return;
    }

    setSaving(true);
    const profile: SpaceRuleProfile = {
      spaceId,
      bundesland,
      branche:        branche.trim(),
      ruleProfileName:ruleProfileName.trim(),
      sourceLabel:    sourceLabel.trim(),
      sourceUrl:      sourceUrl.trim() || undefined,
      codeRules: {
        W: { enabled: wEnabled },
        T: { enabled: tEnabled },
      },
      holidayCredit: {
        enabled:               holidayCreditOn,
        hoursPerHolidayShift:  parseFloat(holidayHours) || 0,
      },
      preHolidayCredit: {
        enabled:               preHolidayCreditOn,
        hoursPerOccurrence:    parseFloat(preHolidayHours) || 0,
      },
      schoolHolidaysEnabledByDefault: schoolDefault,
      updatedAt: new Date().toISOString(),
    };
    await setSpaceRuleProfile(profile);
    setSaving(false);
    Alert.alert('Gespeichert', 'Regelprofil wurde gespeichert.');
  }

  // ── Guards ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!space) {
    return (
      <View style={styles.center}>
        <Text style={styles.guardIcon}>⚠️</Text>
        <Text style={styles.guardTitle}>Space nicht gefunden</Text>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Text style={styles.backBtnText}>← Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!canEdit) {
    return (
      <View style={styles.center}>
        <Text style={styles.guardIcon}>🔒</Text>
        <Text style={styles.guardTitle}>Kein Zugriff</Text>
        <Text style={styles.guardDesc}>
          Nur Owner und Co-Admins dürfen das Regelprofil bearbeiten.
        </Text>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Text style={styles.backBtnText}>← Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>⚙️ Space-Regelprofil</Text>
      <Text style={styles.spaceName}>{space.name}</Text>

      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimerText}>
          ℹ️ Alle Berechnungen sind Prognosen auf Basis ausgewählter Regelinformationen –
          kein Rechtsanspruch.
        </Text>
      </View>

      {/* ── Bundesland ─────────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>Bundesland</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
        {(Object.keys(BUNDESLAND_LABELS) as Bundesland[]).map((bl) => (
          <TouchableOpacity
            key={bl}
            style={[styles.pill, bundesland === bl && styles.pillActive]}
            onPress={() => setBundesland(bl)}
          >
            <Text style={[styles.pillText, bundesland === bl && styles.pillTextActive]}>
              {bl}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={styles.fieldHint}>{BUNDESLAND_LABELS[bundesland as Bundesland] ?? bundesland}</Text>

      {/* ── Branche ─────────────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>Branche</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
        {BRANCHE_OPTIONS.map((b) => (
          <TouchableOpacity
            key={b}
            style={[styles.pill, branche === b && styles.pillActive]}
            onPress={() => setBranche(b)}
          >
            <Text style={[styles.pillText, branche === b && styles.pillTextActive]}>{b}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Regelprofil-Name ─────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>Regelprofil-Name *</Text>
      <TextInput
        style={styles.input}
        value={ruleProfileName}
        onChangeText={setRuleProfileName}
        placeholder="z.B. TVöD Krankenhaus NW"
        placeholderTextColor={colors.textTertiary}
      />

      {/* ── Quellen-Label / URL ──────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>Quellen-Label *</Text>
      <TextInput
        style={styles.input}
        value={sourceLabel}
        onChangeText={setSourceLabel}
        placeholder="z.B. TVöD § 6 Abs. 3"
        placeholderTextColor={colors.textTertiary}
      />
      <Text style={styles.sectionLabel}>Quellen-URL (optional)</Text>
      <TextInput
        style={styles.input}
        value={sourceUrl}
        onChangeText={setSourceUrl}
        placeholder="https://..."
        placeholderTextColor={colors.textTertiary}
        keyboardType="url"
        autoCapitalize="none"
      />

      {/* ── Code-Regeln ─────────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>Code-Regeln</Text>
      <View style={styles.switchRow}>
        <View style={styles.switchLabel}>
          <Text style={styles.switchTitle}>W-Regel aktiv</Text>
          <Text style={styles.switchHint}>Wechselschicht-Zulage</Text>
        </View>
        <Switch
          value={wEnabled}
          onValueChange={setWEnabled}
          trackColor={{ true: colors.primary }}
        />
      </View>
      <View style={styles.switchRow}>
        <View style={styles.switchLabel}>
          <Text style={styles.switchTitle}>T-Regel aktiv</Text>
          <Text style={styles.switchHint}>Tagesdienst-Regel</Text>
        </View>
        <Switch
          value={tEnabled}
          onValueChange={setTEnabled}
          trackColor={{ true: colors.primary }}
        />
      </View>

      {/* ── Feiertagsgutschrift ──────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>Feiertagsgutschrift</Text>
      <View style={styles.switchRow}>
        <View style={styles.switchLabel}>
          <Text style={styles.switchTitle}>Aktiv</Text>
          <Text style={styles.switchHint}>Stunden pro Feiertagsdienst</Text>
        </View>
        <Switch
          value={holidayCreditOn}
          onValueChange={setHolidayCreditOn}
          trackColor={{ true: colors.primary }}
        />
      </View>
      {holidayCreditOn && (
        <TextInput
          style={styles.input}
          value={holidayHours}
          onChangeText={setHolidayHours}
          keyboardType="decimal-pad"
          placeholder="Stunden (z.B. 7.7)"
          placeholderTextColor={colors.textTertiary}
        />
      )}

      {/* ── Vorfest-Gutschrift ───────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>Vorfest-Gutschrift (Heiligabend / Silvester)</Text>
      <View style={styles.switchRow}>
        <View style={styles.switchLabel}>
          <Text style={styles.switchTitle}>Aktiv</Text>
          <Text style={styles.switchHint}>Stunden pro Vorfesttag</Text>
        </View>
        <Switch
          value={preHolidayCreditOn}
          onValueChange={setPreHolidayCreditOn}
          trackColor={{ true: colors.primary }}
        />
      </View>
      {preHolidayCreditOn && (
        <TextInput
          style={styles.input}
          value={preHolidayHours}
          onChangeText={setPreHolidayHours}
          keyboardType="decimal-pad"
          placeholder="Stunden (z.B. 3.85)"
          placeholderTextColor={colors.textTertiary}
        />
      )}

      {/* ── Schulferien ─────────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>Schulferien</Text>
      <View style={styles.switchRow}>
        <View style={styles.switchLabel}>
          <Text style={styles.switchTitle}>Standardmäßig im Kalender anzeigen</Text>
          <Text style={styles.switchHint}>User kann persönlich überschreiben</Text>
        </View>
        <Switch
          value={schoolDefault}
          onValueChange={setSchoolDefault}
          trackColor={{ true: colors.primary }}
        />
      </View>

      {/* ── Speichern ───────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>
          {saving ? 'Speichern...' : '💾 Regelprofil speichern'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
        <Text style={styles.backBtnText}>← Zurück zum Admin</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    paddingTop: 60,
    paddingBottom: 48,
  },
  center: {
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
    marginBottom: spacing.xs,
  },
  spaceName: {
    fontSize: typography.fontSize.base,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.md,
  },
  disclaimerBox: {
    backgroundColor: colors.primaryBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primaryVariant,
  },
  disclaimerText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldHint: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  pillRow: {
    flexGrow: 0,
    marginBottom: 4,
  },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    marginRight: 6,
    backgroundColor: colors.backgroundTertiary,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.semibold,
  },
  pillTextActive: {
    color: colors.textInverse,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundSecondary,
    minHeight: accessibility.minTapHeight,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  switchLabel: {
    flex: 1,
    paddingRight: spacing.md,
  },
  switchTitle: {
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.medium,
  },
  switchHint: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xl,
    minHeight: accessibility.minTapHeight,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  backBtn: {
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.md,
    backgroundColor: colors.backgroundTertiary,
  },
  backBtnText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  guardIcon: { fontSize: 52, marginBottom: spacing.md },
  guardTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  guardDesc: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
});

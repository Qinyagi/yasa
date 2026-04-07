import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SHIFT_META, SHIFT_SEQUENCE, colors, spacing, typography, borderRadius } from '../../constants/theme';
import { getProfile, getShiftColorOverrides, setShiftColorOverrides, resetShiftColorOverrides } from '../../lib/storage';
import { buildShiftMetaWithOverrides } from '../../lib/shiftColors';
import { ResponsiveModal } from '../../components/ResponsiveModal';
import type { ShiftType } from '../../types';

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface HslColor {
  h: number;
  s: number;
  l: number;
}

type MixerMode = 'RGB' | 'HSL';
type PaletteName = 'Grass' | 'Ocean' | 'Sunset' | 'Mono';

const COLOR_PALETTES: Record<PaletteName, string[]> = {
  Grass: ['#D9D5C0', '#A8B545', '#9CAA33', '#56682F', '#12190C'],
  Ocean: ['#DBEAFE', '#93C5FD', '#3B82F6', '#1D4ED8', '#1E3A8A'],
  Sunset: ['#FFF7ED', '#FDBA74', '#F97316', '#EA580C', '#7C2D12'],
  Mono: ['#F3F4F6', '#D1D5DB', '#9CA3AF', '#6B7280', '#111827'],
};

const CHANNEL_STYLES = {
  r: { track: '#EF4444', thumb: '#DC2626' },
  g: { track: '#22C55E', thumb: '#16A34A' },
  b: { track: '#3B82F6', thumb: '#2563EB' },
} as const;

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex: string): RgbColor {
  if (!/^#[0-9A-F]{6}$/i.test(hex)) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function byteToHex(value: number): string {
  return clampByte(value).toString(16).toUpperCase().padStart(2, '0');
}

function rgbToHex(rgb: RgbColor): string {
  return `#${byteToHex(rgb.r)}${byteToHex(rgb.g)}${byteToHex(rgb.b)}`;
}

function rgbToHsl(rgb: RgbColor): HslColor {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToRgb(hsl: HslColor): RgbColor {
  const h = ((hsl.h % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, hsl.s)) / 100;
  const l = Math.max(0, Math.min(100, hsl.l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  return {
    r: clampByte((r1 + m) * 255),
    g: clampByte((g1 + m) * 255),
    b: clampByte((b1 + m) * 255),
  };
}

export default function ShiftColorsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [mixerOpen, setMixerOpen] = useState(false);
  const [mixerCode, setMixerCode] = useState<ShiftType | null>(null);
  const [mixerMode, setMixerMode] = useState<MixerMode>('RGB');
  const [activePalette, setActivePalette] = useState<PaletteName>('Grass');
  const [mixerRgb, setMixerRgb] = useState<RgbColor>({ r: 0, g: 0, b: 0 });
  const [mixerHsl, setMixerHsl] = useState<HslColor>({ h: 0, s: 0, l: 0 });
  const [mixerRText, setMixerRText] = useState('0');
  const [mixerGText, setMixerGText] = useState('0');
  const [mixerBText, setMixerBText] = useState('0');
  const [mixerHText, setMixerHText] = useState('0');
  const [mixerSText, setMixerSText] = useState('0');
  const [mixerLText, setMixerLText] = useState('0');
  const [mixerDraftHex, setMixerDraftHex] = useState('#000000');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        setLoading(true);
        const profile = await getProfile();
        if (!active) return;
        if (!profile) {
          setLoading(false);
          return;
        }
        setProfileId(profile.id);
        const overrides = await getShiftColorOverrides(profile.id);
        if (!active) return;
        const nextInputs: Record<string, string> = {};
        for (const code of SHIFT_SEQUENCE) {
          nextInputs[code] = overrides[code] ?? SHIFT_META[code].bg;
        }
        setInputs(nextInputs);
        setLoading(false);
      };
      void load();
      return () => {
        active = false;
      };
    }, [])
  );

  const mergedMeta = buildShiftMetaWithOverrides(inputs as Partial<Record<ShiftType, string>>);

  function handleChange(code: ShiftType, value: string) {
    const normalized = value.toUpperCase().replace(/[^#0-9A-F]/g, '').slice(0, 7);
    setInputs((prev) => ({ ...prev, [code]: normalized }));
  }

  function openMixer(code: ShiftType) {
    const hex = inputs[code] ?? SHIFT_META[code].bg;
    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb);
    setMixerCode(code);
    setMixerMode('RGB');
    setMixerRgb(rgb);
    setMixerHsl(hsl);
    setMixerRText(String(rgb.r));
    setMixerGText(String(rgb.g));
    setMixerBText(String(rgb.b));
    setMixerHText(String(hsl.h));
    setMixerSText(String(hsl.s));
    setMixerLText(String(hsl.l));
    setMixerDraftHex(hex.toUpperCase());
    setMixerOpen(true);
  }

  function setMixerFromRgb(nextRgb: RgbColor) {
    const normalized = {
      r: clampByte(nextRgb.r),
      g: clampByte(nextRgb.g),
      b: clampByte(nextRgb.b),
    };
    const nextHsl = rgbToHsl(normalized);
    setMixerRgb(normalized);
    setMixerHsl(nextHsl);
    setMixerRText(String(normalized.r));
    setMixerGText(String(normalized.g));
    setMixerBText(String(normalized.b));
    setMixerHText(String(nextHsl.h));
    setMixerSText(String(nextHsl.s));
    setMixerLText(String(nextHsl.l));
    setMixerDraftHex(rgbToHex(normalized));
  }

  function handleMixerChannelChange(channel: 'r' | 'g' | 'b', text: string) {
    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 3);
    if (channel === 'r') setMixerRText(digitsOnly);
    if (channel === 'g') setMixerGText(digitsOnly);
    if (channel === 'b') setMixerBText(digitsOnly);

    const value = clampByte(Number(digitsOnly.length > 0 ? digitsOnly : '0'));
    setMixerFromRgb({
      ...mixerRgb,
      [channel]: value,
    });
  }

  function handleMixerHslChange(channel: 'h' | 's' | 'l', text: string) {
    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 3);
    if (channel === 'h') setMixerHText(digitsOnly);
    if (channel === 's') setMixerSText(digitsOnly);
    if (channel === 'l') setMixerLText(digitsOnly);
    const max = channel === 'h' ? 360 : 100;
    const value = Math.max(0, Math.min(max, Number(digitsOnly.length > 0 ? digitsOnly : '0')));
    const nextHsl: HslColor = { ...mixerHsl, [channel]: value };
    setMixerFromRgb(hslToRgb(nextHsl));
  }

  const activeSwatches = useMemo(() => COLOR_PALETTES[activePalette], [activePalette]);

  function handleCloseMixer() {
    setMixerOpen(false);
    setMixerCode(null);
  }

  function handleApplyMixer() {
    if (!mixerCode) return;
    setInputs((prev) => ({ ...prev, [mixerCode]: mixerDraftHex }));
    handleCloseMixer();
  }

  async function handleSave() {
    if (!profileId) return;
    const invalid = SHIFT_SEQUENCE.find((code) => !/^#[0-9A-F]{6}$/.test(inputs[code] ?? ''));
    if (invalid) {
      Alert.alert('Ungültige Farbe', `Bitte für ${invalid} ein HEX-Format wie #1A2B3C eingeben.`);
      return;
    }
    await setShiftColorOverrides(profileId, inputs as Partial<Record<ShiftType, string>>);
    Alert.alert('Gespeichert', 'Deine Schichtfarben wurden aktualisiert.');
    router.back();
  }

  async function handleReset() {
    if (!profileId) return;
    await resetShiftColorOverrides(profileId);
    const nextInputs: Record<string, string> = {};
    for (const code of SHIFT_SEQUENCE) {
      nextInputs[code] = SHIFT_META[code].bg;
    }
    setInputs(nextInputs);
    Alert.alert('Zurückgesetzt', 'Standardfarben wurden wiederhergestellt.');
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!profileId) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Kein Profil gefunden.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Schichtfarben anpassen</Text>
      <Text style={styles.hint}>Format je Feld: `#RRGGBB`</Text>

      {SHIFT_SEQUENCE.map((code) => {
        const meta = mergedMeta[code];
        return (
          <View key={code} style={styles.row}>
            <View style={[styles.previewBadge, { backgroundColor: meta.bg }]}>
              <Text style={[styles.previewText, { color: meta.fg }]}>{meta.label}</Text>
            </View>
            <View style={styles.textCol}>
              <Text style={styles.desc}>{meta.desc}</Text>
              <TextInput
                style={styles.input}
                value={inputs[code] ?? ''}
                onChangeText={(value) => handleChange(code, value)}
                autoCapitalize="characters"
                placeholder="#AABBCC"
                placeholderTextColor={colors.textTertiary}
              />
              <TouchableOpacity style={styles.mixerBtn} onPress={() => openMixer(code)}>
                <Text style={styles.mixerBtnText}>Farbmischer</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Speichern</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
        <Text style={styles.resetBtnText}>Standard wiederherstellen</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => {
          if (navigation.canGoBack()) router.back();
          else router.replace('/(services)');
        }}
      >
        <Text style={styles.backBtnText}>Zurück</Text>
      </TouchableOpacity>

      <ResponsiveModal visible={mixerOpen} onRequestClose={handleCloseMixer} contentStyle={styles.modalCard}>
            <Text style={styles.modalTitle}>Farbmischer {mixerCode ? `(${mixerCode})` : ''}</Text>
            <Text style={styles.modalSubtitle}>Ziehe die Regler oder tippe einen Preset.</Text>
            <View style={[styles.modalPreview, { backgroundColor: mixerDraftHex }]}>
              <View style={styles.modalPreviewBadge}>
                <Text style={styles.modalPreviewText}>{mixerDraftHex}</Text>
              </View>
            </View>

            <View style={styles.modeTabs}>
              <TouchableOpacity
                style={[styles.modeTab, mixerMode === 'RGB' && styles.modeTabActive]}
                onPress={() => setMixerMode('RGB')}
              >
                <Text style={[styles.modeTabText, mixerMode === 'RGB' && styles.modeTabTextActive]}>RGB</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeTab, mixerMode === 'HSL' && styles.modeTabActive]}
                onPress={() => setMixerMode('HSL')}
              >
                <Text style={[styles.modeTabText, mixerMode === 'HSL' && styles.modeTabTextActive]}>HSL</Text>
              </TouchableOpacity>
            </View>

            {mixerMode === 'RGB' ? (
              (['r', 'g', 'b'] as const).map((channel) => (
                <View key={channel} style={styles.mixerRow}>
                  <View style={styles.channelLabelWrap}>
                    <Text style={styles.mixerLabel}>{channel.toUpperCase()}</Text>
                  </View>
                  <Slider
                    style={styles.channelSlider}
                    minimumValue={0}
                    maximumValue={255}
                    step={1}
                    minimumTrackTintColor={CHANNEL_STYLES[channel].track}
                    maximumTrackTintColor={colors.grayLight}
                    thumbTintColor={CHANNEL_STYLES[channel].thumb}
                    value={mixerRgb[channel]}
                    onValueChange={(value) =>
                      setMixerFromRgb({
                        ...mixerRgb,
                        [channel]: clampByte(value),
                      })
                    }
                  />
                  <TextInput
                    style={styles.mixerInput}
                    keyboardType="number-pad"
                    value={channel === 'r' ? mixerRText : channel === 'g' ? mixerGText : mixerBText}
                    onChangeText={(value) => handleMixerChannelChange(channel, value)}
                  />
                </View>
              ))
            ) : (
              <>
                <View style={styles.mixerRow}>
                  <View style={styles.channelLabelWrap}>
                    <Text style={styles.mixerLabel}>H</Text>
                  </View>
                  <Slider
                    style={styles.channelSlider}
                    minimumValue={0}
                    maximumValue={360}
                    step={1}
                    minimumTrackTintColor="#A855F7"
                    maximumTrackTintColor={colors.grayLight}
                    thumbTintColor="#7E22CE"
                    value={mixerHsl.h}
                    onValueChange={(value) => setMixerFromRgb(hslToRgb({ ...mixerHsl, h: Math.round(value) }))}
                  />
                  <TextInput
                    style={styles.mixerInput}
                    keyboardType="number-pad"
                    value={mixerHText}
                    onChangeText={(value) => handleMixerHslChange('h', value)}
                  />
                </View>
                <View style={styles.mixerRow}>
                  <View style={styles.channelLabelWrap}>
                    <Text style={styles.mixerLabel}>S</Text>
                  </View>
                  <Slider
                    style={styles.channelSlider}
                    minimumValue={0}
                    maximumValue={100}
                    step={1}
                    minimumTrackTintColor="#0EA5E9"
                    maximumTrackTintColor={colors.grayLight}
                    thumbTintColor="#0369A1"
                    value={mixerHsl.s}
                    onValueChange={(value) => setMixerFromRgb(hslToRgb({ ...mixerHsl, s: Math.round(value) }))}
                  />
                  <TextInput
                    style={styles.mixerInput}
                    keyboardType="number-pad"
                    value={mixerSText}
                    onChangeText={(value) => handleMixerHslChange('s', value)}
                  />
                </View>
                <View style={styles.mixerRow}>
                  <View style={styles.channelLabelWrap}>
                    <Text style={styles.mixerLabel}>L</Text>
                  </View>
                  <Slider
                    style={styles.channelSlider}
                    minimumValue={0}
                    maximumValue={100}
                    step={1}
                    minimumTrackTintColor="#F59E0B"
                    maximumTrackTintColor={colors.grayLight}
                    thumbTintColor="#B45309"
                    value={mixerHsl.l}
                    onValueChange={(value) => setMixerFromRgb(hslToRgb({ ...mixerHsl, l: Math.round(value) }))}
                  />
                  <TextInput
                    style={styles.mixerInput}
                    keyboardType="number-pad"
                    value={mixerLText}
                    onChangeText={(value) => handleMixerHslChange('l', value)}
                  />
                </View>
              </>
            )}

            <Text style={styles.swatchLabel}>Palette</Text>
            <View style={styles.paletteTabs}>
              {(Object.keys(COLOR_PALETTES) as PaletteName[]).map((name) => (
                <TouchableOpacity
                  key={name}
                  style={[styles.paletteTab, activePalette === name && styles.paletteTabActive]}
                  onPress={() => setActivePalette(name)}
                >
                  <Text style={[styles.paletteTabText, activePalette === name && styles.paletteTabTextActive]}>{name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.swatchLabel}>Schnellauswahl</Text>
            <View style={styles.swatchGrid}>
              {activeSwatches.map((swatch) => (
                <TouchableOpacity
                  key={swatch}
                  style={[styles.swatchItem, { backgroundColor: swatch }]}
                  onPress={() => setMixerFromRgb(hexToRgb(swatch))}
                >
                  <Text style={styles.swatchText}>{swatch}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={handleCloseMixer}>
                <Text style={styles.modalCancelBtnText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={handleApplyMixer}>
              <Text style={styles.modalCloseBtnText}>Farbe übernehmen</Text>
              </TouchableOpacity>
            </View>
      </ResponsiveModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    paddingTop: 56,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  hint: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  mixerBtn: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  mixerBtnText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.semibold,
  },
  previewBadge: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  textCol: {
    flex: 1,
  },
  desc: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    paddingVertical: 13,
    marginTop: spacing.sm,
  },
  saveBtnText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  resetBtn: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    paddingVertical: 13,
    marginTop: spacing.sm,
  },
  resetBtnText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  backBtn: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: 13,
    marginTop: spacing.sm,
  },
  backBtnText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSize.base,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: colors.background,
    borderRadius: borderRadius['2xl'],
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.full,
    padding: 4,
    marginBottom: spacing.md,
  },
  modeTab: {
    flex: 1,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    paddingVertical: 8,
  },
  modeTabActive: {
    backgroundColor: colors.primary,
  },
  modeTabText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  modeTabTextActive: {
    color: colors.textInverse,
  },
  modalPreview: {
    borderRadius: borderRadius.xl,
    minHeight: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalPreviewBadge: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  modalPreviewText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 1,
  },
  mixerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  channelLabelWrap: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelSlider: {
    flex: 1,
    height: 34,
  },
  mixerLabel: {
    width: 20,
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  mixerInput: {
    width: 64,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
  },
  swatchLabel: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.semibold,
  },
  paletteTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  paletteTab: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  paletteTabActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBackground,
  },
  paletteTabText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
  },
  paletteTabTextActive: {
    color: colors.primaryDark,
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  swatchItem: {
    minWidth: 74,
    height: 32,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  swatchText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1.5,
  },
  modalCloseBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    paddingVertical: 14,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    paddingVertical: 14,
  },
  modalCancelBtnText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  modalCloseBtnText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
});

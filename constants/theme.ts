/**
 * YASA Theme Constants
 * MVP Stabilization: Consistent UI across all screens
 *
 * Usage: import { colors, typography, spacing } from '../constants/theme';
 */

import type { ShiftType } from '../types';

// ─── Colors ───────────────────────────────────────────────────────────────

export const colors = {
  // Primary
  primary: '#2563EB' as const,
  primaryLight: '#3B82F6' as const,
  primaryDark: '#1D4ED8' as const,
  
  // Secondary / Gray Scale
  secondary: '#6B7280' as const,
  secondaryLight: '#9CA3AF' as const,
  secondaryDark: '#4B5563' as const,
  
  // Backgrounds
  background: '#FFFFFF' as const,
  backgroundSecondary: '#F0F4FF' as const,
  backgroundTertiary: '#F3F4F6' as const,
  
  // Text
  textPrimary: '#111827' as const,
  textSecondary: '#6B7280' as const,
  textTertiary: '#9CA3AF' as const,
  textInverse: '#FFFFFF' as const,
  
  // Status
  success: '#10B981' as const,
  warning: '#F59E0B' as const,
  warningDark: '#78350F' as const,
  error: '#DC2626' as const,
  info: '#3B82F6' as const,

  // Extended Status
  successLight: '#86EFAC' as const,
  successDark: '#065F46' as const,
  successBackground: '#F0FDF4' as const,
  errorLight: '#FCA5A5' as const,
  errorBackground: '#FEE2E2' as const,
  errorDark: '#991B1B' as const,

  // Primary Variants
  primaryVariant: '#93C5FD' as const,
  primaryBackground: '#EFF6FF' as const,

  // Purple (Admin/CoAdmin)
  purple: '#7C3AED' as const,
  purpleLight: '#A78BFA' as const,

  // Gray Scale Extended
  gray: '#9CA3AF' as const,
  grayDark: '#4B5563' as const,
  grayLight: '#D1D5DB' as const,

  // Borders
  border: '#E5E7EB' as const,
  borderLight: '#F3F4F6' as const,
};

// ─── Typography ───────────────────────────────────────────────────────────

export const typography = {
  // Font Sizes (consistent across app)
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
  },
  
  // Font Weights (React Native specific)
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  
  // Line Heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

// ─── Spacing (8px Grid) ─────────────────────────────────────────────────

export const spacing = {
  xs: 4 as const,
  sm: 8 as const,
  md: 16 as const,
  lg: 24 as const,
  xl: 32 as const,
  '2xl': 48 as const,
  '3xl': 64 as const,
};

// ─── Border Radius ───────────────────────────────────────────────────────

export const borderRadius = {
  sm: 4 as const,
  md: 8 as const,
  lg: 10 as const,
  xl: 12 as const,
  '2xl': 16 as const,
  full: 9999 as const,
};

// ─── Shadows ─────────────────────────────────────────────────────────────

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
};

// ─── Accessibility ───────────────────────────────────────────────────────

export const accessibility = {
  // Minimum touch target size (44x44 per iOS HIG)
  minTapHeight: 44,
  minTapWidth: 44,
  
  // Minimum font size for readability
  minFontSize: 14,
  
  // Contrast ratio (4.5:1 for normal text, 3:1 for large text)
  contrastRatio: {
    normal: 4.5,
    large: 3.0,
  },
};

// ─── Button Styles ───────────────────────────────────────────────────────

export const buttonStyles = {
  primary: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: borderRadius.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: accessibility.minTapHeight,
  },
  primaryText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center' as const,
  },
  
  secondary: {
    backgroundColor: colors.secondary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: borderRadius.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: accessibility.minTapHeight,
  },
  secondaryText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center' as const,
  },
  
  ghost: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: accessibility.minTapHeight,
  },
  ghostText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center' as const,
  },
  
  danger: {
    backgroundColor: colors.error,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: borderRadius.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: accessibility.minTapHeight,
  },
  dangerText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center' as const,
  },
};

// ─── Shift Constants (Single Source of Truth) ───────────────────────────

export interface ShiftMeta {
  readonly label: string;
  readonly bg: string;
  readonly fg: string;
  readonly desc: string;
}

/** Canonical shift code metadata – single source of truth for all screens */
export const SHIFT_META: Readonly<Record<ShiftType, ShiftMeta>> = {
  F: { label: 'F', bg: '#FEF3C7', fg: '#92400E', desc: 'Frühschicht' },
  S: { label: 'S', bg: '#DBEAFE', fg: '#1D4ED8', desc: 'Spätschicht' },
  N: { label: 'N', bg: '#EDE9FE', fg: '#5B21B6', desc: 'Nachtschicht' },
  T: { label: 'T', bg: '#FFF7ED', fg: '#C2410C', desc: 'Tagesdienst' },
  KS: { label: 'KS', bg: '#FFE4E6', fg: '#BE123C', desc: 'Kurzer Spätdienst' },
  KN: { label: 'KN', bg: '#E0E7FF', fg: '#3730A3', desc: 'Kurzer Nachtdienst' },
  // Legacy-Altcode, bleibt lesbar für alte gespeicherte Pläne
  K: { label: 'K', bg: '#FDF2F8', fg: '#BE185D', desc: 'Kurzer Dienst' },
  R: { label: 'R', bg: '#F3F4F6', fg: '#6B7280', desc: 'Ruhe' },
  U: { label: 'U', bg: '#ECFDF5', fg: '#059669', desc: 'Urlaub' },
  X: { label: 'X', bg: '#F5F5F4', fg: '#78716C', desc: 'Frei' },
} as const;

/** Ordered shift code sequence for cycling through shift types */
export const SHIFT_SEQUENCE: readonly ShiftType[] = ['F', 'S', 'N', 'T', 'KS', 'KN', 'R', 'U', 'X'] as const;

/** Monday-first weekday labels (German) */
export const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

/** Full German month names (0-indexed) */
export const MONTH_LABELS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
] as const;

/** Short German month names (0-indexed) */
export const MONTH_LABELS_SHORT = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
] as const;

// ─── Warm-Human Palette für Startscreen ──────────────────────────────────────
// Warm-human, persönlicher Startbereich
export const warmHuman = {
  ink: '#1E3A5F',
  inkLight: '#2D4A6F',
  primary: '#3B7A9E',
  primaryDark: '#2D5A7B',
  primaryLight: '#5A9BBE',
  accent: '#E8A862',
  accentLight: '#F5C88A',
  surface: '#F8F6F3',
  surfaceWarm: '#F5F2EE',
  surfaceCard: '#FFFFFF',
  textPrimary: '#1E3A5F',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textInverse: '#FFFFFF',
  border: '#E5E7EB',
  borderLight: '#F0EBE6',
};

// ─── Semantic Surface Tokens ─────────────────────────────────────────────────
// R1 Primitive tokens – reusable across Button, Card, etc.

export const semantic = {
  // Surface colors
  surface: {
    default: colors.background,
    secondary: colors.backgroundSecondary,
    tertiary: colors.backgroundTertiary,
    interactive: colors.backgroundSecondary,
    warning: '#FEF3C7',
  },
  // Border tokens
  border: {
    default: colors.border,
    interactive: '#C7D7FD',
    warning: '#FCD34D',
  },
  // Text tokens
  text: {
    muted: colors.textSecondary,
    warning: colors.warningDark,
  },
  // Button variant tokens (reference existing buttonStyles)
  button: {
    primary: {
      bg: colors.primary,
      text: colors.textInverse,
    },
    secondary: {
      bg: colors.secondary,
      text: colors.textInverse,
    },
    ghost: {
      bg: 'transparent',
      text: colors.textSecondary,
      border: colors.border,
    },
    warning: {
      bg: colors.warning,
      text: colors.textInverse,
    },
    // R1 Startscreen-spezifische Varianten für bessere Hierarchie
    soft: {
      bg: colors.primaryLight,
      text: colors.textInverse,
    },
    warm: {
      bg: colors.success,
      text: colors.textInverse,
    },
    subtle: {
      bg: colors.backgroundSecondary,
      text: colors.textPrimary,
      border: colors.border,
    },
    // Warm-Human Varianten für Startscreen-Redesign
    hero: {
      bg: '#3B7A9E',
      text: '#FFFFFF',
    },
    heroSecondary: {
      bg: '#E8A862',
      text: '#1E3A5F',
    },
    card: {
      bg: '#FFFFFF',
      text: '#1E3A5F',
      border: '#F0EBE6',
    },
  },
};

// ─── Container Styles ───────────────────────────────────────────────────

export const containerStyles = {
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
};

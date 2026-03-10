/**
 * Button Primitive R1
 * 
 * Standardisierte Schaltfläche mit klarer semantischer Hierarchie.
 * Nutzt Theme-Tokens für konsistente Farben.
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { colors, typography, spacing, borderRadius, accessibility, semantic } from '../constants/theme';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'warning' | 'soft' | 'warm' | 'subtle' | 'hero' | 'heroSecondary';

export interface ButtonProps {
  /** Button label text */
  label: string;
  /** Press handler */
  onPress: () => void;
  /** Disable interactions */
  disabled?: boolean;
  /** Full width button */
  fullWidth?: boolean;
  /** Optional icon on the left */
  icon?: string;
  /** Visual variant */
  variant?: ButtonVariant;
  /** Optional custom style */
  style?: ViewStyle;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Button({
  label,
  onPress,
  disabled = false,
  fullWidth = false,
  icon,
  variant = 'primary',
  style,
}: ButtonProps) {
  const isDisabled = disabled;
  
  // Get token config based on variant
  const getVariantTokens = (): { bg: string; text: string; border?: string } => {
    switch (variant) {
      case 'primary':
        return semantic.button.primary;
      case 'secondary':
        return semantic.button.secondary;
      case 'ghost':
        return semantic.button.ghost;
      case 'warning':
        return semantic.button.warning;
      case 'soft':
        return semantic.button.soft;
      case 'warm':
        return semantic.button.warm;
      case 'subtle':
        return semantic.button.subtle;
      case 'hero':
        return semantic.button.hero;
      case 'heroSecondary':
        return semantic.button.heroSecondary;
      default:
        return semantic.button.primary;
    }
  };

  const tokens = getVariantTokens();
  const backgroundColor = tokens.bg;
  const textColor = tokens.text;
  const borderColor = tokens.border;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor },
        borderColor && { borderWidth: 1, borderColor },
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
    >
      <Text style={[styles.text, { color: textColor }]}>
        {icon ? `${icon} ${label}` : label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: accessibility.minTapHeight,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
  },
});

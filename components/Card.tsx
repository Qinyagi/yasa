/**
 * Card Primitive R1
 * 
 * Standardisierte Oberflächen-Komponente für Info-, Service- und Status-Blöcke.
 * Nutzt Theme-Tokens für konsistente Farben.
 */

import React from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import { colors, typography, spacing, borderRadius, shadows, semantic } from '../constants/theme';

// ─── Types ───────────────────────────────────────────────────────────────────

export type CardVariant = 'default' | 'interactive' | 'warning';

export interface CardProps {
  /** Card content */
  children: React.ReactNode;
  /** Visual variant */
  variant?: CardVariant;
  /** Make card pressable */
  interactive?: boolean;
  /** Press handler (required if interactive) */
  onPress?: () => void;
  /** Optional custom style */
  style?: ViewStyle;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Card({
  children,
  variant = 'default',
  interactive = false,
  onPress,
  style,
}: CardProps) {
  // Get token config based on variant
  const getVariantTokens = (): { bg: string; border: string } => {
    switch (variant) {
      case 'default':
        return {
          bg: semantic.surface.default,
          border: semantic.border.default,
        };
      case 'interactive':
        return {
          bg: semantic.surface.interactive,
          border: semantic.border.interactive,
        };
      case 'warning':
        return {
          bg: semantic.surface.warning,
          border: semantic.border.warning,
        };
      default:
        return {
          bg: semantic.surface.default,
          border: semantic.border.default,
        };
    }
  };

  const tokens = getVariantTokens();
  const backgroundColor = tokens.bg;
  const borderColor = tokens.border;

  const cardStyle: ViewStyle = {
    backgroundColor,
    borderColor,
    ...styles.card,
  };

  if (interactive && onPress) {
    return (
      <TouchableOpacity
        style={[cardStyle, style]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[cardStyle, style]}>
      {children}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
});

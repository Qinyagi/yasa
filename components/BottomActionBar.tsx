import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type BottomActionBarProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function BottomActionBar({ children, style }: BottomActionBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom + 8, 16) },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 10,
    backgroundColor: 'transparent',
  },
});


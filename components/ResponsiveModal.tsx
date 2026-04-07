import React from 'react';
import {
  Modal,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';

interface ResponsiveModalProps {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
  maxHeightRatio?: number;
  contentStyle?: StyleProp<ViewStyle>;
}

export function ResponsiveModal({
  visible,
  onRequestClose,
  children,
  maxWidth = 460,
  maxHeightRatio = 0.9,
  contentStyle,
}: ResponsiveModalProps) {
  const { height } = useWindowDimensions();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.backdrop}>
        <ScrollView
          style={[styles.scroll, { maxHeight: Math.max(420, height * maxHeightRatio) }]}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, { maxWidth }, contentStyle]}>{children}</View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  scroll: {
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
  },
});


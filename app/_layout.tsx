import { Stack } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(space)" />
          <Stack.Screen name="(shift)" />
          <Stack.Screen name="(team)" />
          <Stack.Screen name="(swap)" />
          <Stack.Screen name="(services)" />
          <Stack.Screen name="(affiliate)" />
          <Stack.Screen name="(admin)" />
        </Stack>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

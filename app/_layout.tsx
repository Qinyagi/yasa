import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
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
  );
}

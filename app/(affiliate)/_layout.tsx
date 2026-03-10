// Affiliate Route Layout
// Basis-Layout für Affiliate-Routen

import { Stack } from 'expo-router';

export default function AffiliateLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: 'Reisen & Freizeit',
        headerStyle: {
          backgroundColor: '#fff',
        },
        headerTintColor: '#333',
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{
          title: 'Reisen & Freizeit',
        }}
      />
      <Stack.Screen 
        name="questionnaire" 
        options={{
          title: 'Finde dein Angebot',
        }}
      />
      <Stack.Screen 
        name="offer/[id]" 
        options={{
          title: 'Angebotsdetails',
        }}
      />
    </Stack>
  );
}


import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../../lib/storage';

/**
 * Layout-Guard für (team).
 * Erste Verteidigungslinie: Kein Profil → Redirect zur Profil-Erstellung.
 * today.tsx behält seinen eigenen Space/Membership-Guard.
 */
export default function TeamLayout() {
  const [state, setState] = useState<'loading' | 'ok' | 'noProfile'>('loading');

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEYS.PROFILE)
      .then((val) => { if (active) setState(val !== null ? 'ok' : 'noProfile'); })
      .catch(() => { if (active) setState('noProfile'); });
    return () => { active = false; };
  }, []);

  if (state === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }
  if (state === 'noProfile') return <Redirect href="/(auth)/create-profile" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}

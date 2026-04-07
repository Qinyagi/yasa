import Constants from 'expo-constants';

interface SupabaseExtraConfig {
  url?: string;
  anonKey?: string;
}

interface ExpoExtraConfig {
  supabase?: SupabaseExtraConfig;
}

function readExtraConfig(): ExpoExtraConfig {
  const expoConfigExtra = (Constants.expoConfig?.extra ?? {}) as ExpoExtraConfig;
  if (expoConfigExtra?.supabase) return expoConfigExtra;

  const manifestExtra = ((Constants as unknown as { manifest2?: { extra?: ExpoExtraConfig } })
    .manifest2?.extra ?? {}) as ExpoExtraConfig;
  return manifestExtra;
}

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const extra = readExtraConfig();
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabase?.url ?? '').trim();
  const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabase?.anonKey ?? '').trim();
  return { url, anonKey };
}

export function hasSupabaseConfig(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  return url.length > 0 && anonKey.length > 0;
}

export function assertSupabaseConfig(): { url: string; anonKey: string } {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) {
    throw new Error(
      'Supabase config missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (preferred), or provide expo.extra.supabase.url and expo.extra.supabase.anonKey in app.json.'
    );
  }
  return config;
}

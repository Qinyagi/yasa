import { getSupabaseClient } from './supabaseClient';

export async function ensureAnonymousSession(): Promise<void> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session) return;

  const signInResult = await supabase.auth.signInAnonymously();
  if (signInResult.error) throw signInResult.error;
}


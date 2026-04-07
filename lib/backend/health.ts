import { ensureAnonymousSession } from './auth';
import { getSupabaseClient } from './supabaseClient';

export async function checkBackendHealth(): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await ensureAnonymousSession();
    const supabase = getSupabaseClient();
    const ping = await supabase.from('profiles').select('id').limit(1);
    if (ping.error) return { ok: false, reason: ping.error.message };
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown backend error';
    return { ok: false, reason };
  }
}


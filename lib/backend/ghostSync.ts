/**
 * ghostSync.ts — Push/pull ghost definitions to/from Supabase spaces.ghosts_json.
 *
 * Ghost definitions (id, label, avatarSeed, status) are stored in the `ghosts_json`
 * JSONB column of the `spaces` table. This gives every space member on any device
 * access to the ghost IDs — a prerequisite for cross-device ghost presence sync,
 * since ghost presence is stored as a `UserShiftPlan` keyed by `ghost.id` in the
 * `shift_plans` table.
 *
 * ─── Prerequisites (one-time Supabase migration) ────────────────────────────────
 *   ALTER TABLE spaces
 *     ADD COLUMN IF NOT EXISTS ghosts_json JSONB DEFAULT '[]'::jsonb;
 * ────────────────────────────────────────────────────────────────────────────────
 *
 * Write path (host/owner only, called from manage.tsx):
 *   createGhost / archiveGhost → pushGhostsForSpace(spaceId, activeGhosts)
 *
 * Read path (all members, called from today.tsx loadData):
 *   pullGhostsForSpace(spaceId) → mergeRemoteGhosts(spaceId, remoteGhosts) [in storage.ts]
 *
 * Ghost presence sync:
 *   markGhostPresent writes to local AsyncStorage (shift_plans via storage.ts).
 *   After markGhostPresent, the ghost's UserShiftPlan is pushed to shift_plans
 *   via pushShiftPlanToBackend (shiftSync.ts) — same path as real member plans.
 *   Other devices pull the ghost plan during loadData when ghost IDs are included
 *   in pullShiftPlansByProfileIds([...memberIds, ...ghostIds]).
 *
 * Graceful degradation:
 *   - Column absent (migration not applied yet) → pullGhostsForSpace returns [] silently.
 *   - Supabase not configured → both functions are no-ops.
 *   - Network error on pull → local ghosts used (best-effort).
 */

import type { UserProfile } from '../../types';
import { ensureAnonymousSession } from './auth';
import { getSupabaseClient } from './supabaseClient';
import { hasSupabaseConfig } from './config';

type SpaceGhostRow = {
  id: string;
  ghosts_json: UserProfile[] | null;
};

/**
 * Push the current list of active ghost definitions for a space to Supabase.
 *
 * Only the space host/owner should call this (enforced in calling UI code).
 * Uses UPDATE (not upsert) to avoid touching other space columns.
 *
 * @param spaceId  The space whose ghosts_json column is updated.
 * @param ghosts   Active ghost profiles to store (archived ghosts excluded).
 */
export async function pushGhostsForSpace(
  spaceId: string,
  ghosts: UserProfile[]
): Promise<void> {
  if (!hasSupabaseConfig()) return;
  await ensureAnonymousSession();
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('spaces')
    .update({ ghosts_json: ghosts })
    .eq('id', spaceId);

  if (error) throw error;
}

/**
 * Pull ghost definitions for a space from Supabase.
 *
 * Called by all members during focus-sync (today.tsx loadData).
 * Returns [] when:
 *   - Supabase not configured
 *   - ghosts_json column does not exist yet (migration pending)
 *   - Network / RLS error (best-effort: never throws)
 *
 * @param spaceId  The space to fetch ghost definitions for.
 */
export async function pullGhostsForSpace(
  spaceId: string
): Promise<UserProfile[]> {
  if (!hasSupabaseConfig()) return [];
  await ensureAnonymousSession();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('spaces')
    .select('id,ghosts_json')
    .eq('id', spaceId)
    .single();

  if (error) return [];

  const row = data as SpaceGhostRow | null;
  if (!row || !Array.isArray(row.ghosts_json)) return [];
  return row.ghosts_json;
}

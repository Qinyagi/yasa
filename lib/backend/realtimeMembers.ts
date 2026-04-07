/**
 * realtimeMembers.ts — Supabase Realtime adapter for space_members events.
 *
 * Architecture:
 *   Supabase Realtime (postgres_changes on space_members)
 *     → client-side spaceId filter (shouldHandleEvent)
 *     → debounce (createDebounce, REALTIME_DEBOUNCE_MS)
 *     → caller's onSync callback (syncTeamSpaces + setState)
 *
 * Graceful degradation:
 *   - If Supabase is not configured → no-op subscription, no crash.
 *   - If channel creation fails → logged in dev, returns no-op cleanup.
 *   - Focus-based sync (useFocusEffect in each screen) is NOT replaced —
 *     realtime is additive only.
 *
 * Exported pure helpers (shouldHandleEvent, createDebounce) are test-safe:
 *   no Supabase client, no React, no __DEV__ references.
 */

import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabaseClient';
import { hasSupabaseConfig } from './config';

/** Debounce window in ms — batches rapid successive Realtime events into one sync. */
export const REALTIME_DEBOUNCE_MS = 2000;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Determines whether a Realtime postgres_changes payload targets one of our spaces.
 * Checks `payload.new.space_id` (INSERT/UPDATE) and `payload.old.space_id` (DELETE).
 * Pure function — safe to use in tests without Supabase.
 */
export function shouldHandleEvent(payload: unknown, spaceIds: string[]): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (spaceIds.length === 0) return false;
  const p = payload as Record<string, unknown>;
  const newRow = p['new'];
  const oldRow = p['old'];
  const fromNew =
    typeof newRow === 'object' && newRow !== null
      ? (newRow as Record<string, unknown>)['space_id']
      : undefined;
  const fromOld =
    typeof oldRow === 'object' && oldRow !== null
      ? (oldRow as Record<string, unknown>)['space_id']
      : undefined;
  const spaceId = fromNew ?? fromOld;
  if (typeof spaceId !== 'string') return false;
  return spaceIds.includes(spaceId);
}

/**
 * Creates a debounce scheduler + cancel pair.
 * Rapid `schedule(fn)` calls reset the timer; the last fn is called once after `delay` ms.
 * Pure function — safe to use in tests.
 */
export function createDebounce(delay: number): {
  schedule: (fn: () => void) => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule(fn: () => void): void {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, delay);
    },
    cancel(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

// ─── Low-level subscription ───────────────────────────────────────────────────

/**
 * Subscribe to `space_members` INSERT/UPDATE/DELETE events for the given spaces.
 * Events are filtered client-side via `shouldHandleEvent`.
 * Debounce is NOT applied here — caller is responsible (see useRealtimeMemberSync).
 *
 * @returns cleanup function — idempotent, safe to call multiple times.
 */
export function subscribeToMemberChanges(
  channelName: string,
  spaceIds: string[],
  onEvent: () => void
): () => void {
  if (!hasSupabaseConfig() || spaceIds.length === 0) {
    return () => {};
  }

  let channel: RealtimeChannel | null = null;
  let cleaned = false;

  try {
    const supabase = getSupabaseClient();
    channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'space_members' },
        (payload) => {
          if (!shouldHandleEvent(payload, spaceIds)) return;
          if (process.env.NODE_ENV === 'development') {
            console.log('[YASA Realtime] member change', {
              event: (payload as { eventType?: string }).eventType ?? '?',
              channel: channelName,
            });
          }
          onEvent();
        }
      )
      .subscribe((status) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[YASA Realtime] channel status', { channel: channelName, status });
        }
      });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[YASA Realtime] subscribe failed — degrading to focus-sync', err);
    }
    return () => {};
  }

  return () => {
    if (cleaned) return; // idempotent
    cleaned = true;
    if (channel !== null) {
      try {
        getSupabaseClient().removeChannel(channel);
      } catch {
        // ignore cleanup errors — channel may already be gone
      }
      channel = null;
    }
  };
}

// ─── React hook ───────────────────────────────────────────────────────────────

/**
 * React hook: subscribe to Realtime member changes for the given spaces.
 * Calls `onSync` (debounced by REALTIME_DEBOUNCE_MS) on any INSERT/DELETE event.
 *
 * Behaviour:
 *   - Re-subscribes automatically when profileId or spaceIds change.
 *   - Cancels pending debounce and removes channel on unmount.
 *   - No-op when Supabase is not configured (focus-sync fallback still active).
 *   - `onSync` is held in a ref — identity changes do not trigger resubscription.
 *
 * @param profileId  Current user's profile ID (used for unique channel name).
 * @param spaceIds   Space IDs to watch; empty array → no subscription.
 * @param onSync     Callback to invoke after debounce; should trigger syncTeamSpaces.
 */
export function useRealtimeMemberSync(
  profileId: string | undefined,
  spaceIds: string[],
  onSync: () => void
): void {
  // Ref-stabilized onSync: always calls the latest version without resubscribing.
  const onSyncRef = useRef(onSync);
  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  const spaceIdsKey = spaceIds.join(',');

  useEffect(() => {
    if (!profileId || spaceIds.length === 0) return;

    const channelName = `yasa-members-${profileId}`;
    const debounce = createDebounce(REALTIME_DEBOUNCE_MS);

    const unsub = subscribeToMemberChanges(channelName, spaceIds, () => {
      debounce.schedule(() => onSyncRef.current());
    });

    return () => {
      debounce.cancel();
      unsub();
    };
    // spaceIdsKey is a stable primitive derived from spaceIds — safe dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, spaceIdsKey]);
}

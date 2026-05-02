/**
 * spaceStatusSync.ts — backend bridge for space-wide YASA information events.
 *
 * v1 stores the latest events in spaces.status_events_json to stay compatible
 * with the existing spaces sync model. If the column is not migrated yet, all
 * functions degrade silently so local status history still works.
 *
 * One-time Supabase migration:
 *   ALTER TABLE spaces
 *     ADD COLUMN IF NOT EXISTS status_events_json JSONB DEFAULT '[]'::jsonb;
 */

import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { SpaceStatusEvent } from '../../types/spaceStatus';
import { ensureAnonymousSession } from './auth';
import { hasSupabaseConfig } from './config';
import { getSupabaseClient } from './supabaseClient';
import { logWarn } from '../log';
import { createDebounce, REALTIME_DEBOUNCE_MS } from './realtimeMembers';

const MAX_REMOTE_STATUS_EVENTS = 80;

type SpaceStatusRow = {
  id: string;
  status_events_json?: SpaceStatusEvent[] | null;
};

function timestampOf(event: SpaceStatusEvent): number {
  const time = Date.parse(event.createdAt);
  return Number.isFinite(time) ? time : 0;
}

function mergeStatusEvents(
  current: SpaceStatusEvent[],
  incoming: SpaceStatusEvent[]
): SpaceStatusEvent[] {
  const byId = new Map<string, SpaceStatusEvent>();
  for (const event of current) {
    if (event?.id) byId.set(event.id, event);
  }
  for (const event of incoming) {
    if (!event?.id) continue;
    const existing = byId.get(event.id);
    if (!existing || timestampOf(event) >= timestampOf(existing)) {
      byId.set(event.id, event);
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => timestampOf(b) - timestampOf(a))
    .slice(0, MAX_REMOTE_STATUS_EVENTS);
}

function isMissingColumnError(error: { message?: string } | null): boolean {
  return String(error?.message ?? '').includes('status_events_json');
}

export async function pullSpaceStatusEvents(spaceId: string): Promise<SpaceStatusEvent[]> {
  if (!hasSupabaseConfig()) return [];
  await ensureAnonymousSession();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('spaces')
    .select('id,status_events_json')
    .eq('id', spaceId)
    .single();

  if (error) {
    if (!isMissingColumnError(error)) {
      logWarn('SpaceStatus', 'pull failed', { spaceId, reason: error.message });
    }
    return [];
  }

  const row = data as SpaceStatusRow | null;
  return Array.isArray(row?.status_events_json) ? row.status_events_json : [];
}

export async function pushSpaceStatusEvent(event: SpaceStatusEvent): Promise<void> {
  if (!hasSupabaseConfig()) return;
  await ensureAnonymousSession();
  const supabase = getSupabaseClient();

  const current = await pullSpaceStatusEvents(event.spaceId);
  const next = mergeStatusEvents(current, [event]);

  const { error } = await supabase
    .from('spaces')
    .update({ status_events_json: next })
    .eq('id', event.spaceId);

  if (error) {
    if (!isMissingColumnError(error)) throw error;
    logWarn('SpaceStatus', 'status_events_json column not available, skipping push');
  }
}

function shouldHandleSpaceStatusPayload(payload: unknown, spaceIds: string[]): boolean {
  if (!payload || typeof payload !== 'object' || spaceIds.length === 0) return false;
  const p = payload as Record<string, unknown>;
  const newRow = p['new'];
  const oldRow = p['old'];
  const fromNew =
    typeof newRow === 'object' && newRow !== null
      ? (newRow as Record<string, unknown>)['id']
      : undefined;
  const fromOld =
    typeof oldRow === 'object' && oldRow !== null
      ? (oldRow as Record<string, unknown>)['id']
      : undefined;
  const spaceId = fromNew ?? fromOld;
  return typeof spaceId === 'string' && spaceIds.includes(spaceId);
}

export function subscribeToSpaceStatusChanges(
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
        { event: 'UPDATE', schema: 'public', table: 'spaces' },
        (payload) => {
          if (!shouldHandleSpaceStatusPayload(payload, spaceIds)) return;
          onEvent();
        }
      )
      .subscribe();
  } catch {
    return () => {};
  }

  return () => {
    if (cleaned) return;
    cleaned = true;
    if (channel) {
      try {
        getSupabaseClient().removeChannel(channel);
      } catch {
        // ignore cleanup errors
      }
      channel = null;
    }
  };
}

export function useRealtimeSpaceStatus(
  profileId: string | undefined,
  spaceIds: string[],
  onSync: () => void
): void {
  const onSyncRef = useRef(onSync);
  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  const spaceIdsKey = spaceIds.join(',');

  useEffect(() => {
    if (!profileId || spaceIds.length === 0) return;

    const debounce = createDebounce(REALTIME_DEBOUNCE_MS);
    const unsub = subscribeToSpaceStatusChanges(
      `yasa-space-status-${profileId}`,
      spaceIds,
      () => debounce.schedule(() => onSyncRef.current())
    );

    return () => {
      debounce.cancel();
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, spaceIdsKey]);
}

import type { MemberSnapshot, MemberLifecycleEntry, Space } from '../../types';
import { ensureAnonymousSession } from './auth';
import { getSupabaseClient } from './supabaseClient';
import { fallbackAvatarSeed, isFallbackAvatarSeed } from '../avatarSeed';

type SpaceRow = {
  id: string;
  name: string;
  created_at: string;
  owner_profile_id: string | null;
  owner_display_name: string | null;
  invite_token: string | null;
  co_admin_profile_ids: string[] | null;
};

type SpaceMemberRow = {
  space_id: string;
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
};

type SpaceWithMembersRow = SpaceRow & {
  space_members: SpaceMemberRow[] | null;
};

function fallbackInviteToken(spaceId: string): string {
  return spaceId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function toSpaceModel(row: SpaceWithMembersRow): Space {
  const members: MemberSnapshot[] = (row.space_members ?? []).map((member) => ({
    id: member.user_id,
    displayName: member.display_name,
    avatarUrl: member.avatar_url ?? fallbackAvatarSeed(member.user_id, member.display_name),
  }));
  const ownerMember = row.owner_profile_id
    ? members.find((member) => member.id === row.owner_profile_id) ?? null
    : null;

  const ownerProfileId = row.owner_profile_id ?? members[0]?.id ?? '';
  const ownerDisplayName =
    row.owner_display_name ?? ownerMember?.displayName ?? members[0]?.displayName ?? 'Unbekannt';

  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    ownerProfileId,
    ownerDisplayName,
    inviteToken: row.invite_token ?? fallbackInviteToken(row.id),
    coAdminProfileIds: Array.isArray(row.co_admin_profile_ids) ? row.co_admin_profile_ids : [],
    memberProfileIds: members.map((member) => member.id),
    memberProfiles: members,
  };
}

/**
 * Push space metadata + own member row to backend.
 *
 * IMPORTANT: only this device's own profile row is upserted into space_members.
 * Pushing all members would re-insert deleted members whose rows have been
 * removed from the backend — defeating the delete-propagation mechanism.
 */
export async function pushSpacesToBackend(spaces: Space[], ownProfileId: string): Promise<void> {
  await ensureAnonymousSession();
  const supabase = getSupabaseClient();

  if (spaces.length === 0) return;

  const spaceRows = spaces.map((space) => ({
    id: space.id,
    name: space.name,
    created_at: space.createdAt,
    owner_profile_id: space.ownerProfileId,
    owner_display_name: space.ownerDisplayName,
    invite_token: space.inviteToken,
    co_admin_profile_ids: space.coAdminProfileIds,
  }));

  const { error: upsertSpaceError } = await supabase.from('spaces').upsert(spaceRows, {
    onConflict: 'id',
  });
  if (upsertSpaceError) throw upsertSpaceError;

  // Only push own profile's member row – never re-insert other members.
  const memberRows = spaces.flatMap((space) =>
    space.memberProfiles
      .filter((member) => member.id === ownProfileId)
      .map((member) => {
        // Only push avatar_url when it's a real user-chosen seed.
        const isRealSeed =
          member.avatarUrl &&
          !isFallbackAvatarSeed(member.avatarUrl, member.id, member.displayName);
        return {
          space_id: space.id,
          user_id: member.id,
          display_name: member.displayName,
          ...(isRealSeed ? { avatar_url: member.avatarUrl } : {}),
        };
      })
  );

  if (memberRows.length === 0) return;
  const { error: upsertMemberError } = await supabase.from('space_members').upsert(memberRows, {
    onConflict: 'space_id,user_id',
  });
  if (upsertMemberError) throw upsertMemberError;
}

/**
 * Remove all space_members rows for a given profileId across the specified spaces.
 * Called from executeProfileDelete (best-effort) so other devices stop seeing this user.
 */
export async function removeSpaceMembershipsForProfile(
  profileId: string,
  spaceIds?: string[]
): Promise<void> {
  await ensureAnonymousSession();
  const supabase = getSupabaseClient();

  // Robust path:
  // - If no spaceIds are provided (or empty), delete all memberships for this profile.
  // - If spaceIds are provided, constrain delete to those spaces.
  // This prevents stale memberships when local space cache is empty/stale at delete time.
  let query = supabase
    .from('space_members')
    .delete()
    .eq('user_id', profileId);

  if (Array.isArray(spaceIds) && spaceIds.length > 0) {
    query = query.in('space_id', spaceIds);
  }

  const { error } = await query;
  if (error) throw error;
}

export async function pullSpacesForProfile(profileId: string): Promise<Space[]> {
  await ensureAnonymousSession();
  const supabase = getSupabaseClient();

  const { data: memberships, error: membershipError } = await supabase
    .from('space_members')
    .select('space_id')
    .eq('user_id', profileId);
  if (membershipError) throw membershipError;

  const spaceIds = Array.from(
    new Set((memberships ?? []).map((row) => row.space_id).filter(Boolean))
  );
  if (spaceIds.length === 0) return [];

  const { data: spaces, error: spaceError } = await supabase
    .from('spaces')
    .select(
      'id,name,created_at,owner_profile_id,owner_display_name,invite_token,co_admin_profile_ids,space_members(space_id,user_id,display_name,avatar_url)'
    )
    .in('id', spaceIds);
  if (spaceError) throw spaceError;

  return (spaces as SpaceWithMembersRow[] | null)?.map(toSpaceModel) ?? [];
}

export async function syncTeamSpaces(
  profileId: string,
  localSpaces: Space[]
): Promise<{ spaces: Space[]; pushedCount: number; pulledCount: number }> {
  await pushSpacesToBackend(localSpaces, profileId);
  const remoteSpaces = await pullSpacesForProfile(profileId);

  const byId = new Map<string, Space>();
  for (const space of localSpaces) byId.set(space.id, space);
  for (const remoteSpace of remoteSpaces) {
    const localSpace = byId.get(remoteSpace.id);
    if (!localSpace) {
      byId.set(remoteSpace.id, remoteSpace);
      continue;
    }

    // Build local lookup for avatar-seed enhancement only.
    const localById = new Map<string, MemberSnapshot>();
    for (const localMember of localSpace.memberProfiles) {
      localById.set(localMember.id, localMember);
    }

    // Remote member list is authoritative: only members present in the backend
    // are kept. Members who have deleted their profile are absent from remote
    // and will not appear in the merged result — this is the delete-propagation fix.
    const memberMap = new Map<string, MemberSnapshot>();
    for (const remoteMember of remoteSpace.memberProfiles) {
      const existing = localById.get(remoteMember.id);
      const resolvedDisplayName = remoteMember.displayName || existing?.displayName || '';

      // Prefer whichever avatarUrl is a real user-chosen seed (not a generated fallback).
      const remoteIsReal =
        !!remoteMember.avatarUrl &&
        !isFallbackAvatarSeed(remoteMember.avatarUrl, remoteMember.id, resolvedDisplayName);
      const existingIsReal =
        !!existing?.avatarUrl &&
        !isFallbackAvatarSeed(existing.avatarUrl, existing.id, resolvedDisplayName);

      memberMap.set(remoteMember.id, {
        id: remoteMember.id,
        displayName: resolvedDisplayName,
        avatarUrl:
          (remoteIsReal ? remoteMember.avatarUrl : null) ||
          (existingIsReal ? existing!.avatarUrl : null) ||
          remoteMember.avatarUrl ||
          existing?.avatarUrl ||
          fallbackAvatarSeed(remoteMember.id, resolvedDisplayName),
      });
    }

    // Safety net: always keep own profile in the merged result.
    // If push failed transiently and the pull didn't include this device's own
    // profile row yet, we preserve it from local storage so the UI never loses
    // self-membership.
    if (!memberMap.has(profileId)) {
      const ownLocal = localById.get(profileId);
      if (ownLocal) memberMap.set(profileId, ownLocal);
    }

    // ── Member lifecycle history ──────────────────────────────────────────────
    // Build/update memberHistory to track join and remove events.
    // Remote memberMap contains only currently active members.
    // Members present in local but absent from remote are marked removed.
    const now = new Date().toISOString();
    const historyMap = new Map<string, MemberLifecycleEntry>();
    for (const entry of localSpace.memberHistory ?? []) {
      historyMap.set(entry.id, entry);
    }

    // Add/update entries for all currently active members (in memberMap)
    for (const [id, merged] of memberMap.entries()) {
      const existing = historyMap.get(id);
      if (!existing) {
        // New member seen for first time → add as joined now
        historyMap.set(id, {
          id: merged.id,
          displayName: merged.displayName,
          avatarUrl: merged.avatarUrl,
          joinedAt: now,
          joinedViaProfileId: remoteSpace.ownerProfileId,
          active: true,
        });
      } else if (!existing.active) {
        // Was removed but is back (re-joined) → reactivate
        historyMap.set(id, {
          ...existing,
          displayName: merged.displayName || existing.displayName,
          avatarUrl: merged.avatarUrl || existing.avatarUrl,
          active: true,
          removedAt: undefined,
        });
      } else {
        // Already active → refresh snapshot data
        historyMap.set(id, {
          ...existing,
          displayName: merged.displayName || existing.displayName,
          avatarUrl: merged.avatarUrl || existing.avatarUrl,
        });
      }
    }

    // Mark removed: members in local.memberProfiles not in remote memberMap
    // (these are members whose backend row was deleted — profile deleted)
    for (const localMember of localSpace.memberProfiles) {
      if (!memberMap.has(localMember.id)) {
        const existing = historyMap.get(localMember.id);
        if (existing) {
          if (existing.active) {
            historyMap.set(localMember.id, { ...existing, removedAt: now, active: false });
          }
        } else {
          // No history entry yet → add as removed
          historyMap.set(localMember.id, {
            id: localMember.id,
            displayName: localMember.displayName,
            avatarUrl: localMember.avatarUrl,
            joinedAt: localSpace.createdAt ?? now,
            joinedViaProfileId: localSpace.ownerProfileId,
            removedAt: now,
            active: false,
          });
        }
      }
    }

    const mergedHistory = Array.from(historyMap.values());
    const mergedMembers = Array.from(memberMap.values());
    const mergedMemberIds = Array.from(new Set(mergedMembers.map((m) => m.id)));
    byId.set(remoteSpace.id, {
      ...localSpace,
      ...remoteSpace,
      memberProfiles: mergedMembers,
      memberProfileIds: mergedMemberIds,
      memberHistory: mergedHistory,
    });
  }

  return {
    spaces: Array.from(byId.values()),
    pushedCount: localSpaces.length,
    pulledCount: remoteSpaces.length,
  };
}

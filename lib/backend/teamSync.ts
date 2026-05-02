import type { MemberSnapshot, MemberLifecycleEntry, Space } from '../../types';
import type { ShiftPatternTemplate, SpaceRuleProfile } from '../../types/timeAccount';
import type { PreparedIdProfile } from '../../types/preparedProfile';
import { ensureAnonymousSession } from './auth';
import { getSupabaseClient } from './supabaseClient';
import { fallbackAvatarSeed, isFallbackAvatarSeed } from '../avatarSeed';
import { logInfo, logWarn } from '../log';
import { filterDeletedSpaces, getDeletedSpaceIds } from '../spaceDeleteTombstones';
import { getPreparedIdProfiles, replacePreparedIdProfilesForSpace } from '../storage';

type SpaceRow = {
  id: string;
  name: string;
  created_at: string;
  owner_profile_id: string | null;
  owner_display_name: string | null;
  invite_token: string | null;
  co_admin_profile_ids: string[] | null;
  rule_profile_json?: SpaceRuleProfile | null;
  prepared_id_profiles_json?: PreparedIdProfile[] | null;
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
type SpaceRuleRow = {
  id: string;
  rule_profile_json?: SpaceRuleProfile | null;
};
type SpacePreparedProfilesRow = {
  id: string;
  prepared_id_profiles_json?: PreparedIdProfile[] | null;
};

type SyncTeamSpacesOptions = {
  allowCached?: boolean;
  ttlMs?: number;
};

type TeamSyncCacheEntry = {
  timestamp: number;
  localSignature: string;
  result: { spaces: Space[]; pushedCount: number; pulledCount: number };
};

const DEFAULT_SYNC_TTL_MS = 30_000;
const teamSyncCache = new Map<string, TeamSyncCacheEntry>();
const preparedRosterPushSignatures = new Map<string, string>();

function timestampOf(value: string | undefined): number {
  const time = value ? Date.parse(value) : 0;
  return Number.isFinite(time) ? time : 0;
}

function spaceSyncSignature(spaces: Space[]): string {
  return spaces
    .map((space) => [
      space.id,
      space.memberProfiles.map((member) => `${member.id}:${member.displayName}:${member.avatarUrl}`).join('|'),
      space.coAdminProfileIds.join('|'),
      space.spaceRuleProfile?.updatedAt ?? '',
      space.preparedIdProfiles?.map((item) => `${item.id}:${item.updatedAt}:${item.status}`).join('|') ?? '',
    ].join('#'))
    .sort()
    .join('||');
}

function preparedRosterSignature(profiles: PreparedIdProfile[]): string {
  return profiles
    .map((item) => [
      item.id,
      item.profileId,
      item.displayName,
      item.avatarUrl,
      item.status,
      item.updatedAt,
      item.transferredAt ?? '',
      item.assignedPattern?.templateId ?? '',
      item.assignedPattern?.anchorDateISO ?? '',
      item.assignedPattern?.patternTodayIndex ?? '',
      item.assignedPattern?.pattern.join(',') ?? '',
    ].join(':'))
    .sort()
    .join('|');
}

function mergeShiftPatternVault(
  localVault: ShiftPatternTemplate[] | undefined,
  remoteVault: ShiftPatternTemplate[] | undefined
): ShiftPatternTemplate[] {
  const byId = new Map<string, ShiftPatternTemplate>();
  for (const item of remoteVault ?? []) {
    if (item?.id) byId.set(item.id, item);
  }
  for (const item of localVault ?? []) {
    if (!item?.id) continue;
    const existing = byId.get(item.id);
    if (!existing || timestampOf(item.updatedAt) >= timestampOf(existing.updatedAt)) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort((a, b) => timestampOf(b.updatedAt) - timestampOf(a.updatedAt));
}

function mergeRuleProfileForPush(
  localProfile: SpaceRuleProfile,
  remoteProfile: SpaceRuleProfile | null
): SpaceRuleProfile {
  if (!remoteProfile) return localProfile;

  const base =
    timestampOf(localProfile.updatedAt) >= timestampOf(remoteProfile.updatedAt)
      ? localProfile
      : remoteProfile;
  const mergedVault = mergeShiftPatternVault(
    localProfile.shiftPatternVault,
    remoteProfile.shiftPatternVault
  );
  const newestUpdate = Math.max(timestampOf(localProfile.updatedAt), timestampOf(remoteProfile.updatedAt));

  return {
    ...base,
    shiftPatternVault: mergedVault,
    updatedAt: newestUpdate > 0 ? new Date(newestUpdate).toISOString() : base.updatedAt,
  };
}

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
    spaceRuleProfile: row.rule_profile_json ?? null,
    preparedIdProfiles: Array.isArray(row.prepared_id_profiles_json)
      ? row.prepared_id_profiles_json
      : [],
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

  // Upsert space metadata WITHOUT rule_profile_json to prevent members
  // (who have spaceRuleProfile=null locally) from overwriting the host's
  // saved rule profile in Supabase.  Rule profiles are pushed separately
  // below only when the local value is non-null.
  const spaceRows = spaces.map((space) => ({
    id: space.id,
    name: space.name,
    created_at: space.createdAt,
    owner_profile_id: space.ownerProfileId,
    owner_display_name: space.ownerDisplayName,
    invite_token: space.inviteToken,
    co_admin_profile_ids: space.coAdminProfileIds,
  }));
  {
    const { error: upsertSpaceError } = await supabase.from('spaces').upsert(spaceRows, {
      onConflict: 'id',
    });
    if (upsertSpaceError) throw upsertSpaceError;
  }

  // Push rule_profile_json only for spaces that actually have a local profile.
  // This ensures members never downgrade a non-null remote value to null.
  const spacesWithRules = spaces.filter((s) => s.spaceRuleProfile != null);
  for (const space of spacesWithRules) {
    const localRuleProfile = space.spaceRuleProfile!;
    let remoteRuleProfile: SpaceRuleProfile | null = null;
    const { data: existingRuleRows, error: existingRuleError } = await supabase
      .from('spaces')
      .select('id,rule_profile_json')
      .eq('id', space.id)
      .limit(1);
    if (!existingRuleError) {
      remoteRuleProfile = ((existingRuleRows?.[0] as SpaceRuleRow | undefined)?.rule_profile_json ?? null);
    } else {
      const msg = String(existingRuleError.message ?? '');
      if (!msg.includes('rule_profile_json')) throw existingRuleError;
      logWarn('RULESYNC', 'rule_profile_json column not available before push');
    }

    const mergedRuleProfile = mergeRuleProfileForPush(localRuleProfile, remoteRuleProfile);
    const { error: ruleError } = await supabase
      .from('spaces')
      .update({ rule_profile_json: mergedRuleProfile })
      .eq('id', space.id);
    if (ruleError) {
      const msg = String(ruleError.message ?? '');
      // Backward-compat: ignore if column doesn't exist yet
      if (!msg.includes('rule_profile_json')) throw ruleError;
      logWarn('RULESYNC', 'rule_profile_json column not available, skipping push');
    } else {
      logInfo('RULESYNC', 'pushed rule profile', {
        spaceId: space.id,
        vaultCount: mergedRuleProfile.shiftPatternVault?.length ?? 0,
      });
    }
  }

  // Prepared ID Profiles are Host-authored onboarding roster data.
  // Only the Space owner may push this JSON buffer; members pull it read-only.
  const ownerSpaces = spaces.filter((space) => space.ownerProfileId === ownProfileId);
  for (const space of ownerSpaces) {
    const preparedProfiles = await getPreparedIdProfiles(space.id);
    const signature = preparedRosterSignature(preparedProfiles);
    const signatureKey = `${ownProfileId}:${space.id}`;
    if (preparedRosterPushSignatures.get(signatureKey) === signature) {
      continue;
    }
    const { error: preparedError } = await supabase
      .from('spaces')
      .update({ prepared_id_profiles_json: preparedProfiles })
      .eq('id', space.id)
      .eq('owner_profile_id', ownProfileId);
    if (preparedError) {
      const msg = String(preparedError.message ?? '');
      if (!msg.includes('prepared_id_profiles_json')) throw preparedError;
      logWarn('PREPAREDSYNC', 'prepared_id_profiles_json column not available, skipping push');
    } else {
      preparedRosterPushSignatures.set(signatureKey, signature);
      logInfo('PREPAREDSYNC', 'pushed prepared profiles', {
        spaceId: space.id,
        count: preparedProfiles.length,
      });
    }
  }

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

export async function deleteSpaceForProfile(
  spaceId: string,
  profileId: string,
  isOwner: boolean
): Promise<void> {
  await ensureAnonymousSession();
  const supabase = getSupabaseClient();

  if (isOwner) {
    const { error: deleteSpaceError } = await supabase
      .from('spaces')
      .delete()
      .eq('id', spaceId)
      .eq('owner_profile_id', profileId);
    if (!deleteSpaceError) return;
    logWarn('TEAMSYNC', 'space delete failed, falling back to membership delete', {
      spaceId,
      profileId,
      message: String(deleteSpaceError.message ?? deleteSpaceError),
    });
  }

  await removeSpaceMembershipsForProfile(profileId, [spaceId]);
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

  // Backward-compatible: select with optional JSON columns and fallback if missing.
  const fullSelect =
    'id,name,created_at,owner_profile_id,owner_display_name,invite_token,co_admin_profile_ids,rule_profile_json,prepared_id_profiles_json,space_members(space_id,user_id,display_name,avatar_url)';
  const fallbackSelect =
    'id,name,created_at,owner_profile_id,owner_display_name,invite_token,co_admin_profile_ids,space_members(space_id,user_id,display_name,avatar_url)';

  let spaces: SpaceWithMembersRow[] | null = null;
  {
    const { data, error } = await supabase.from('spaces').select(fullSelect).in('id', spaceIds);
    if (!error) {
      spaces = data as SpaceWithMembersRow[] | null;
    } else {
      const msg = String(error.message ?? '');
      if (!msg.includes('rule_profile_json') && !msg.includes('prepared_id_profiles_json')) throw error;
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('spaces')
        .select(fallbackSelect)
        .in('id', spaceIds);
      if (fallbackError) throw fallbackError;
      spaces = fallbackData as SpaceWithMembersRow[] | null;
    }
  }

  // Defensive fetch: query rule_profile_json separately and merge by id.
  // This protects against edge-cases where the joined select path returns
  // rows but drops/empties rule_profile_json unexpectedly on some clients.
  const ruleBySpaceId = new Map<string, SpaceRuleProfile | null>();
  {
    const { data: ruleRows, error: ruleRowsError } = await supabase
      .from('spaces')
      .select('id,rule_profile_json')
      .in('id', spaceIds);
    if (!ruleRowsError) {
      for (const row of (ruleRows ?? []) as SpaceRuleRow[]) {
        ruleBySpaceId.set(row.id, row.rule_profile_json ?? null);
      }
    } else {
      const msg = String(ruleRowsError.message ?? '');
      if (!msg.includes('rule_profile_json')) throw ruleRowsError;
      logWarn('RULESYNC', 'rule_profile_json column not available in rule-row fetch');
    }
  }

  const preparedBySpaceId = new Map<string, PreparedIdProfile[]>();
  {
    const { data: preparedRows, error: preparedRowsError } = await supabase
      .from('spaces')
      .select('id,prepared_id_profiles_json')
      .in('id', spaceIds);
    if (!preparedRowsError) {
      for (const row of (preparedRows ?? []) as SpacePreparedProfilesRow[]) {
        preparedBySpaceId.set(
          row.id,
          Array.isArray(row.prepared_id_profiles_json) ? row.prepared_id_profiles_json : []
        );
      }
    } else {
      const msg = String(preparedRowsError.message ?? '');
      if (!msg.includes('prepared_id_profiles_json')) throw preparedRowsError;
      logWarn('PREPAREDSYNC', 'prepared_id_profiles_json column not available in fetch');
    }
  }

  const result =
    spaces?.map((row) => {
      const mergedRule = ruleBySpaceId.has(row.id)
        ? ruleBySpaceId.get(row.id) ?? null
        : row.rule_profile_json ?? null;
      const preparedIdProfiles = preparedBySpaceId.has(row.id)
        ? preparedBySpaceId.get(row.id) ?? []
        : Array.isArray(row.prepared_id_profiles_json)
          ? row.prepared_id_profiles_json
          : [];
      return toSpaceModel({
        ...row,
        rule_profile_json: mergedRule,
        prepared_id_profiles_json: preparedIdProfiles,
      });
    }) ?? [];
  for (const s of result) {
    logInfo('RULESYNC', 'pulled space', {
      spaceId: s.id,
      hasRuleProfile: s.spaceRuleProfile != null,
    });
    if (s.preparedIdProfiles) {
      logInfo('PREPAREDSYNC', 'pulled prepared profiles', {
        spaceId: s.id,
        count: s.preparedIdProfiles.length,
      });
    }
  }
  return result;
}

export async function syncTeamSpaces(
  profileId: string,
  localSpaces: Space[],
  options: SyncTeamSpacesOptions = {}
): Promise<{ spaces: Space[]; pushedCount: number; pulledCount: number }> {
  const ttlMs = options.ttlMs ?? DEFAULT_SYNC_TTL_MS;
  const cacheKey = profileId;
  const localSignature = spaceSyncSignature(localSpaces);
  if (options.allowCached) {
    const cached = teamSyncCache.get(cacheKey);
    if (
      cached &&
      cached.localSignature === localSignature &&
      Date.now() - cached.timestamp < ttlMs
    ) {
      return cached.result;
    }
  }

  const deletedSpaceIds = await getDeletedSpaceIds();
  const activeLocalSpaces = filterDeletedSpaces(localSpaces, deletedSpaceIds);
  await pushSpacesToBackend(activeLocalSpaces, profileId);
  const remoteSpaces = filterDeletedSpaces(await pullSpacesForProfile(profileId), deletedSpaceIds);

  const byId = new Map<string, Space>();
  for (const space of activeLocalSpaces) byId.set(space.id, space);
  for (const remoteSpace of remoteSpaces) {
    const localSpace = byId.get(remoteSpace.id);
    if (!localSpace) {
      if (remoteSpace.preparedIdProfiles && remoteSpace.ownerProfileId !== profileId) {
        await replacePreparedIdProfilesForSpace(remoteSpace.id, remoteSpace.preparedIdProfiles);
      }
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
    const mergedPreparedIdProfiles =
      remoteSpace.ownerProfileId === profileId
        ? localSpace.preparedIdProfiles ?? remoteSpace.preparedIdProfiles ?? []
        : remoteSpace.preparedIdProfiles ?? localSpace.preparedIdProfiles ?? [];

    if (remoteSpace.ownerProfileId !== profileId) {
      await replacePreparedIdProfilesForSpace(remoteSpace.id, mergedPreparedIdProfiles);
    }

    byId.set(remoteSpace.id, {
      ...localSpace,
      ...remoteSpace,
      // Keep a local rule profile snapshot if remote doesn't provide one yet
      // (e.g. backend column missing or not populated on older hosts).
      spaceRuleProfile: (() => {
        const merged =
          localSpace.spaceRuleProfile || remoteSpace.spaceRuleProfile
            ? mergeRuleProfileForPush(
                localSpace.spaceRuleProfile ?? remoteSpace.spaceRuleProfile!,
                remoteSpace.spaceRuleProfile ?? null
              )
            : null;
        const source = remoteSpace.spaceRuleProfile && localSpace.spaceRuleProfile
          ? 'local+remote'
          : remoteSpace.spaceRuleProfile
            ? 'remote'
            : localSpace.spaceRuleProfile
              ? 'local'
              : 'none';
        logInfo('RULESYNC', 'merge rule profile', {
          spaceId: remoteSpace.id,
          source,
          vaultCount: merged?.shiftPatternVault?.length ?? 0,
        });
        return merged;
      })(),
      memberProfiles: mergedMembers,
      memberProfileIds: mergedMemberIds,
      memberHistory: mergedHistory,
      preparedIdProfiles: mergedPreparedIdProfiles,
    });
  }

  const result = {
    spaces: Array.from(byId.values()),
    pushedCount: activeLocalSpaces.length,
    pulledCount: remoteSpaces.length,
  };
  teamSyncCache.set(cacheKey, {
    timestamp: Date.now(),
    localSignature: spaceSyncSignature(result.spaces),
    result,
  });
  return result;
}

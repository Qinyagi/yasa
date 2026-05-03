import { shiftCodeAtDate } from './shiftEngine';
import type { MemberSnapshot, ShiftType } from '../types';
import type { PreparedIdProfile } from '../types/preparedProfile';

export interface PreparedShiftpalEntry {
  member: MemberSnapshot;
  code: ShiftType;
  preparedProfileId: string;
}

export interface PreparedSwapCandidateEntry {
  member: MemberSnapshot;
  code: ShiftType;
  preparedProfileId: string;
}

function isPreparedProfileVisible(profileId: string, status: string, activeMemberIds: Set<string>): boolean {
  if (status === 'transferred') return false;
  return !activeMemberIds.has(profileId);
}

export function buildPreparedShiftpalEntries(
  preparedProfiles: PreparedIdProfile[],
  viewedDateISO: string,
  myShift: ShiftType | null,
  activeMemberIds: string[] = []
): PreparedShiftpalEntry[] {
  if (!myShift) return [];
  const activeIds = new Set(activeMemberIds);

  return preparedProfiles.flatMap((profile) => {
    if (!isPreparedProfileVisible(profile.profileId, profile.status, activeIds)) return [];
    if (!profile.assignedPattern) return [];
    if (profile.assignedPattern.pattern.length === 0) return [];

    const code = shiftCodeAtDate(
      profile.assignedPattern.anchorDateISO,
      profile.assignedPattern.pattern,
      viewedDateISO
    );

    if (code !== myShift) return [];

    return [
      {
        member: {
          id: profile.profileId,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
        code,
        preparedProfileId: profile.id,
      },
    ];
  });
}

export function buildPreparedSwapCandidates(
  preparedProfiles: PreparedIdProfile[],
  viewedDateISO: string,
  activeMemberIds: string[] = []
): PreparedSwapCandidateEntry[] {
  const freeCodes = new Set<ShiftType>(['R', 'U', 'X']);
  const activeIds = new Set(activeMemberIds);

  return preparedProfiles.flatMap((profile) => {
    if (!isPreparedProfileVisible(profile.profileId, profile.status, activeIds)) return [];
    if (!profile.assignedPattern) return [];
    if (profile.assignedPattern.pattern.length === 0) return [];

    const code = shiftCodeAtDate(
      profile.assignedPattern.anchorDateISO,
      profile.assignedPattern.pattern,
      viewedDateISO
    );

    if (!code) return [];
    if (!freeCodes.has(code)) return [];

    return [
      {
        member: {
          id: profile.profileId,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
        code,
        preparedProfileId: profile.id,
      },
    ];
  });
}

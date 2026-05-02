import { shiftCodeAtDate } from './shiftEngine';
import type { MemberSnapshot, ShiftType } from '../types';
import type { PreparedIdProfile } from '../types/preparedProfile';

export interface PreparedShiftpalEntry {
  member: MemberSnapshot;
  code: ShiftType;
  preparedProfileId: string;
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
    if (profile.status === 'transferred') return [];
    if (activeIds.has(profile.profileId)) return [];
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

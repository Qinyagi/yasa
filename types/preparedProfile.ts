import type { ShiftType } from './index';

export type PreparedProfileStatus =
  | 'prepared'
  | 'configured'
  | 'ready-to-transfer'
  | 'transferred';

export interface PreparedProfileAssignedPattern {
  templateId: string;
  templateName: string;
  pattern: ShiftType[];
  cycleLengthDays: number;
  anchorDateISO: string;
  patternTodayIndex?: number;
}

export interface PreparedIdProfile {
  id: string;
  spaceId: string;
  profileId: string;
  displayName: string;
  avatarUrl: string;
  status: PreparedProfileStatus;
  assignedPattern?: PreparedProfileAssignedPattern;
  createdByProfileId: string;
  createdAt: string;
  updatedAt: string;
  transferredAt?: string;
}

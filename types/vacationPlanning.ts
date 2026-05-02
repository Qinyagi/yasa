export type VacationPlanningWishStatus =
  | 'draft'
  | 'submitted'
  | 'under-review'
  | 'conflict-detected'
  | 'team-proposal'
  | 'team-aligned'
  | 'waitlisted'
  | 'alternative-requested'
  | 'unresolved'
  | 'ready-for-employer-review'
  | 'employer-confirmed'
  | 'changed-after-binding';

export type EmployerVacationGroupSource =
  | 'manual'
  | 'import'
  | 'self-assignment'
  | 'template'
  | 'space-fallback';

export interface VacationPlanningWish {
  id: string;
  spaceId: string;
  profileId: string;
  year: number;
  startDateISO: string;
  endDateISO: string;
  dateISOs: string[];
  status: VacationPlanningWishStatus;
  priorityRank?: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export type VacationPlanningMemberStatus =
  | 'not-started'
  | 'drafting'
  | 'submitted'
  | 'no-wishes'
  | 'team-aligned'
  | 'ready-for-employer-review'
  | 'employer-confirmed';

export interface VacationPlanningMemberState {
  id: string;
  spaceId: string;
  profileId: string;
  year: number;
  status: VacationPlanningMemberStatus;
  submittedAt?: string;
  completedAt?: string;
  lastReminderAt?: string;
  reminderSnoozedUntil?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VacationPlanningBudgetSummary {
  spaceId: string;
  profileId: string;
  year: number;
  budgetDays: number;
  budgetSource: 'vacation-balance' | 'annual-entitlement' | 'missing';
  plannedDays: number;
  draftDays: number;
  submittedDays: number;
  remainingDays: number;
}

export interface EmployerVacationGroup {
  id: string;
  spaceId: string;
  year: number;
  name: string;
  employerCode?: string;
  description?: string;
  memberProfileIds: string[];
  defaultCapacityPerDay?: number;
  capacityByDateISO?: Record<string, number>;
  source: EmployerVacationGroupSource;
  createdAt: string;
  updatedAt: string;
}

export type VacationPlanningConflictSeverity = 'warning' | 'critical';

export interface VacationPlanningConflict {
  id: string;
  spaceId: string;
  year: number;
  dateISO: string;
  groupId: string;
  groupName: string;
  capacity: number;
  wishedCount: number;
  wishIds: string[];
  profileIds: string[];
  severity: VacationPlanningConflictSeverity;
}

export type VacationPlanningMessageKind = 'user' | 'system';

export type VacationPlanningThreadTargetType = 'wish' | 'conflict';

export interface VacationPlanningMessage {
  id: string;
  spaceId: string;
  threadId: string;
  authorProfileId: string | null;
  kind: VacationPlanningMessageKind;
  body: string;
  createdAt: string;
}

export interface VacationPlanningThread {
  id: string;
  spaceId: string;
  year: number;
  targetType: VacationPlanningThreadTargetType;
  targetId: string;
  messageIds: string[];
  createdAt: string;
  updatedAt: string;
}

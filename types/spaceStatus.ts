import type { ShiftType } from './index';

export type SpaceStatusEventType =
  | 'day_status_changed'
  | 'shift_plan_updated'
  | 'swap_updated'
  | 'vacation_planning_updated'
  | 'ghost_presence_updated'
  | 'system_info';

export type SpaceStatusAudience = 'space' | 'shiftpals';

export interface SpaceStatusEvent {
  id: string;
  spaceId: string;
  type: SpaceStatusEventType;
  audience?: SpaceStatusAudience;
  actorProfileId: string;
  actorDisplayName: string;
  title: string;
  body: string;
  dateISO?: string;
  targetShiftCode?: ShiftType | null;
  oldShiftCode?: ShiftType | null;
  newShiftCode?: ShiftType | null;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
}

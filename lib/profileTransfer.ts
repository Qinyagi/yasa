import type { ShiftType, UserShiftPlan } from '../types';
import type { PreparedProfileAssignedPattern } from '../types/preparedProfile';

export interface ProfileTransferPayload {
  version: '1';
  profileId: string;
  displayName: string;
  avatarUrl: string;
  createdAt?: string;
  createdByProfileId: string;
  spaceId: string;
  spaceName: string;
  ownerProfileId: string;
  ownerDisplayName: string;
  ownerAvatarUrl?: string;
  inviteToken: string;
  assignedPattern?: PreparedProfileAssignedPattern;
}

export function buildProfileTransferPayload(payload: ProfileTransferPayload): string {
  const params = new URLSearchParams();
  params.set('v', payload.version);
  params.set('profileId', payload.profileId);
  params.set('displayName', payload.displayName);
  params.set('avatar', payload.avatarUrl);
  if (payload.createdAt) params.set('createdAt', payload.createdAt);
  params.set('createdBy', payload.createdByProfileId);
  params.set('spaceId', payload.spaceId);
  params.set('spaceName', payload.spaceName);
  params.set('ownerId', payload.ownerProfileId);
  params.set('ownerName', payload.ownerDisplayName);
  if (payload.ownerAvatarUrl) params.set('ownerAvatar', payload.ownerAvatarUrl);
  params.set('token', payload.inviteToken);
  if (payload.assignedPattern) {
    params.set('patternTemplateId', payload.assignedPattern.templateId);
    params.set('patternTemplateName', payload.assignedPattern.templateName);
    params.set('patternCodes', payload.assignedPattern.pattern.join(','));
    params.set('patternCycle', String(payload.assignedPattern.cycleLengthDays));
    params.set('patternAnchor', payload.assignedPattern.anchorDateISO);
    if (payload.assignedPattern.patternTodayIndex != null) {
      params.set('patternTodayIndex', String(payload.assignedPattern.patternTodayIndex));
    }
  }
  return `yasa://profile-transfer?${params.toString()}`;
}

export function parseProfileTransferPayload(value: string): ProfileTransferPayload | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'yasa:') return null;
    if (url.hostname !== 'profile-transfer') return null;

    const version = url.searchParams.get('v');
    const profileId = url.searchParams.get('profileId');
    const displayName = url.searchParams.get('displayName');
    const avatarUrl = url.searchParams.get('avatar');
    const createdByProfileId = url.searchParams.get('createdBy');
    const spaceId = url.searchParams.get('spaceId');
    const spaceName = url.searchParams.get('spaceName');
    const ownerProfileId = url.searchParams.get('ownerId');
    const ownerDisplayName = url.searchParams.get('ownerName');
    const inviteToken = url.searchParams.get('token');

    if (
      version !== '1' ||
      !profileId ||
      !displayName ||
      !avatarUrl ||
      !createdByProfileId ||
      !spaceId ||
      !spaceName ||
      !ownerProfileId ||
      !ownerDisplayName ||
      !inviteToken
    ) {
      return null;
    }

    const createdAt = url.searchParams.get('createdAt') ?? undefined;
    const ownerAvatarRaw = url.searchParams.get('ownerAvatar') ?? undefined;
    const ownerAvatarUrl = ownerAvatarRaw && ownerAvatarRaw.length > 0 ? ownerAvatarRaw : undefined;
    const patternTemplateId = url.searchParams.get('patternTemplateId') ?? undefined;
    const patternTemplateName = url.searchParams.get('patternTemplateName') ?? undefined;
    const patternCodesRaw = url.searchParams.get('patternCodes') ?? undefined;
    const patternCycleRaw = url.searchParams.get('patternCycle') ?? undefined;
    const patternAnchor = url.searchParams.get('patternAnchor') ?? undefined;
    const patternTodayIndexRaw = url.searchParams.get('patternTodayIndex') ?? undefined;
    const assignedPattern =
      patternTemplateId && patternTemplateName && patternCodesRaw && patternCycleRaw && patternAnchor
        ? {
            templateId: patternTemplateId,
            templateName: patternTemplateName,
            pattern: patternCodesRaw
              .split(',')
              .map((code) => code.trim())
              .filter(Boolean) as ShiftType[],
            cycleLengthDays: Math.max(1, Math.round(Number(patternCycleRaw))),
            anchorDateISO: patternAnchor,
            patternTodayIndex:
              patternTodayIndexRaw == null
                ? undefined
                : Math.max(0, Math.round(Number(patternTodayIndexRaw))),
          }
        : undefined;

    return {
      version,
      profileId,
      displayName,
      avatarUrl,
      createdAt,
      createdByProfileId,
      spaceId,
      spaceName,
      ownerProfileId,
      ownerDisplayName,
      ownerAvatarUrl,
      inviteToken,
      assignedPattern,
    };
  } catch {
    return null;
  }
}

function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysISO(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDateISO(date);
}

function diffDaysUTC(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split('-').map(Number);
  const [by, bm, bd] = bISO.split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

function startOfPreviousYearISO(reference = new Date()): string {
  return `${reference.getFullYear() - 1}-01-01`;
}

function endOfNextYearISO(reference = new Date()): string {
  return `${reference.getFullYear() + 1}-12-31`;
}

export function buildTransferredShiftPlan(
  profileId: string,
  assignedPattern: PreparedProfileAssignedPattern,
  reference = new Date()
): UserShiftPlan {
  const windowStartISO = startOfPreviousYearISO(reference);
  const windowEndISO = endOfNextYearISO(reference);
  const cycleLengthDays = Math.max(1, Math.round(assignedPattern.cycleLengthDays));
  const pattern = assignedPattern.pattern.slice(0, cycleLengthDays);
  let effectiveStartISO = assignedPattern.anchorDateISO;
  const backSpan = Math.max(0, diffDaysUTC(windowStartISO, assignedPattern.anchorDateISO));
  if (backSpan > 0) {
    const cyclesBack = Math.ceil(backSpan / cycleLengthDays);
    effectiveStartISO = addDaysISO(assignedPattern.anchorDateISO, -(cyclesBack * cycleLengthDays));
  }

  const totalDays = Math.max(1, diffDaysUTC(effectiveStartISO, windowEndISO) + 1);
  const entries = Array.from({ length: totalDays })
    .map((_, index) => {
      const dateISO = addDaysISO(effectiveStartISO, index);
      return { dateISO, code: pattern[index % pattern.length] };
    })
    .filter((entry) => entry.dateISO >= windowStartISO && entry.dateISO <= windowEndISO);

  return {
    profileId,
    startDateISO: effectiveStartISO,
    anchorDateISO: assignedPattern.anchorDateISO,
    pattern,
    cycleLengthDays,
    generatedUntilISO: entries.length > 0 ? entries[entries.length - 1].dateISO : windowEndISO,
    entries,
  };
}

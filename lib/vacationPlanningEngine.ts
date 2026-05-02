import type {
  EmployerVacationGroup,
  VacationPlanningConflict,
  VacationPlanningWish,
} from '../types/vacationPlanning';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateISO(dateISO: string): Date {
  if (!DATE_RE.test(dateISO)) {
    throw new Error(`Invalid date ISO: ${dateISO}`);
  }
  const date = new Date(`${dateISO}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date ISO: ${dateISO}`);
  }
  return date;
}

function toDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function expandVacationPlanningDateRange(startDateISO: string, endDateISO: string): string[] {
  const start = parseDateISO(startDateISO);
  const end = parseDateISO(endDateISO);
  if (start.getTime() > end.getTime()) {
    throw new Error(`Start date must be before or equal end date: ${startDateISO} > ${endDateISO}`);
  }

  const result: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    result.push(toDateISO(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function normalizeVacationPlanningWishDates(wish: VacationPlanningWish): VacationPlanningWish {
  const dateISOs =
    wish.dateISOs.length > 0
      ? [...new Set(wish.dateISOs)].sort()
      : expandVacationPlanningDateRange(wish.startDateISO, wish.endDateISO);

  return {
    ...wish,
    dateISOs,
  };
}

export function isVacationPlanningWishVisibleForConflicts(wish: VacationPlanningWish): boolean {
  return wish.status !== 'draft';
}

function getGroupCapacityForDate(group: EmployerVacationGroup, dateISO: string): number {
  const byDate = group.capacityByDateISO?.[dateISO];
  if (typeof byDate === 'number' && Number.isFinite(byDate) && byDate >= 0) {
    return byDate;
  }
  if (
    typeof group.defaultCapacityPerDay === 'number' &&
    Number.isFinite(group.defaultCapacityPerDay) &&
    group.defaultCapacityPerDay >= 0
  ) {
    return group.defaultCapacityPerDay;
  }
  return 1;
}

export function buildVacationPlanningConflicts(params: {
  wishes: VacationPlanningWish[];
  groups: EmployerVacationGroup[];
  spaceId: string;
  year: number;
}): VacationPlanningConflict[] {
  const { wishes, groups, spaceId, year } = params;
  const activeWishes = wishes
    .filter((wish) => wish.spaceId === spaceId && wish.year === year)
    .filter(isVacationPlanningWishVisibleForConflicts)
    .map(normalizeVacationPlanningWishDates);

  const relevantGroups = groups.filter((group) => group.spaceId === spaceId && group.year === year);
  const conflicts: VacationPlanningConflict[] = [];

  for (const group of relevantGroups) {
    const memberSet = new Set(group.memberProfileIds);
    const groupWishes = activeWishes.filter((wish) => memberSet.has(wish.profileId));
    const wishesByDate = new Map<string, VacationPlanningWish[]>();

    for (const wish of groupWishes) {
      for (const dateISO of wish.dateISOs) {
        const list = wishesByDate.get(dateISO) ?? [];
        list.push(wish);
        wishesByDate.set(dateISO, list);
      }
    }

    for (const [dateISO, dayWishes] of wishesByDate.entries()) {
      const capacity = getGroupCapacityForDate(group, dateISO);
      if (dayWishes.length <= capacity) continue;

      const wishIds = dayWishes.map((wish) => wish.id).sort();
      const profileIds = [...new Set(dayWishes.map((wish) => wish.profileId))].sort();
      conflicts.push({
        id: `${spaceId}:${year}:${group.id}:${dateISO}`,
        spaceId,
        year,
        dateISO,
        groupId: group.id,
        groupName: group.name,
        capacity,
        wishedCount: dayWishes.length,
        wishIds,
        profileIds,
        severity: dayWishes.length > capacity + 1 ? 'critical' : 'warning',
      });
    }
  }

  return conflicts.sort((a, b) => {
    if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);
    return a.groupName.localeCompare(b.groupName);
  });
}

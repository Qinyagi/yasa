import type { UserShiftPlan } from '../../types';
import { ensureAnonymousSession } from './auth';
import { getSupabaseClient } from './supabaseClient';

type ShiftPlanRow = {
  profile_id: string;
  plan_json: UserShiftPlan;
};

export async function pushShiftPlanToBackend(plan: UserShiftPlan): Promise<void> {
  return pushShiftPlanToBackendKey(plan.profileId, plan);
}

export async function pushShiftPlanToBackendKey(
  storageProfileId: string,
  plan: UserShiftPlan
): Promise<void> {
  await ensureAnonymousSession();
  const supabase = getSupabaseClient();

  const { error } = await supabase.from('shift_plans').upsert(
    {
      profile_id: storageProfileId,
      plan_json: plan,
    },
    { onConflict: 'profile_id' }
  );
  if (error) throw error;
}

export async function pullShiftPlansByProfileIds(
  profileIds: string[]
): Promise<Record<string, UserShiftPlan>> {
  return pullShiftPlansByStorageKeys(profileIds);
}

export async function pullShiftPlansByStorageKeys(
  storageProfileIds: string[]
): Promise<Record<string, UserShiftPlan>> {
  await ensureAnonymousSession();
  const supabase = getSupabaseClient();
  const uniqueIds = Array.from(new Set(storageProfileIds.filter(Boolean)));
  if (uniqueIds.length === 0) return {};

  const { data, error } = await supabase
    .from('shift_plans')
    .select('profile_id,plan_json')
    .in('profile_id', uniqueIds);
  if (error) throw error;

  const rows = (data ?? []) as ShiftPlanRow[];
  const result: Record<string, UserShiftPlan> = {};
  for (const row of rows) {
    if (!row.profile_id || !row.plan_json) continue;
    result[row.profile_id] = row.plan_json;
  }
  return result;
}

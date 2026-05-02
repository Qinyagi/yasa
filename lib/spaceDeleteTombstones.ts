import AsyncStorage from '@react-native-async-storage/async-storage';

const DELETED_SPACE_IDS_KEY = 'yasa.deletedSpaceIds.v1';

function normalizeSpaceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? '').trim())
        .filter((item) => item.length > 0)
    )
  );
}

export async function getDeletedSpaceIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DELETED_SPACE_IDS_KEY);
    if (!raw) return [];
    return normalizeSpaceIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function markSpaceDeleted(spaceId: string): Promise<void> {
  const clean = spaceId.trim();
  if (!clean) return;
  const current = await getDeletedSpaceIds();
  if (current.includes(clean)) return;
  await AsyncStorage.setItem(DELETED_SPACE_IDS_KEY, JSON.stringify([...current, clean]));
}

export async function clearSpaceDeleted(spaceId: string): Promise<void> {
  const clean = spaceId.trim();
  if (!clean) return;
  const current = await getDeletedSpaceIds();
  const next = current.filter((id) => id !== clean);
  if (next.length === current.length) return;
  await AsyncStorage.setItem(DELETED_SPACE_IDS_KEY, JSON.stringify(next));
}

export function filterDeletedSpaces<T extends { id: string }>(spaces: T[], deletedSpaceIds: string[]): T[] {
  if (deletedSpaceIds.length === 0) return spaces;
  const deleted = new Set(deletedSpaceIds);
  return spaces.filter((space) => !deleted.has(space.id));
}

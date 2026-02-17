import AsyncStorage from "@react-native-async-storage/async-storage";
import type { UserProfile, Space } from "../types";

const KEY_PROFILE = "yasa.profile.v1";
const KEY_SPACES = "yasa.spaces.v1";
const KEY_CURRENT_SPACE = "yasa.currentSpaceId.v1";

export async function saveProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(KEY_PROFILE, JSON.stringify(profile));
}

export async function loadProfile(): Promise<UserProfile | null> {
  const raw = await AsyncStorage.getItem(KEY_PROFILE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export async function clearProfile(): Promise<void> {
  await AsyncStorage.removeItem(KEY_PROFILE);
}

// ── Space persistence ──

export async function saveSpace(space: Space): Promise<void> {
  const existing = await loadSpaces();
  const idx = existing.findIndex((s) => s.id === space.id);
  if (idx >= 0) {
    existing[idx] = space;
  } else {
    existing.push(space);
  }
  await AsyncStorage.setItem(KEY_SPACES, JSON.stringify(existing));
}

export async function loadSpaces(): Promise<Space[]> {
  const raw = await AsyncStorage.getItem(KEY_SPACES);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Space[];
  } catch {
    return [];
  }
}

export async function loadSpaceById(id: string): Promise<Space | null> {
  const spaces = await loadSpaces();
  return spaces.find((s) => s.id === id) ?? null;
}

export async function saveCurrentSpaceId(id: string): Promise<void> {
  await AsyncStorage.setItem(KEY_CURRENT_SPACE, id);
}

export async function loadCurrentSpaceId(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_CURRENT_SPACE);
}

export async function clearCurrentSpaceId(): Promise<void> {
  await AsyncStorage.removeItem(KEY_CURRENT_SPACE);
}

export async function resetAll(): Promise<void> {
  await AsyncStorage.multiRemove([KEY_PROFILE, KEY_SPACES, KEY_CURRENT_SPACE]);
}

export async function deleteSpace(id: string): Promise<void> {
  const existing = await loadSpaces();
  const filtered = existing.filter((s) => s.id !== id);
  await AsyncStorage.setItem(KEY_SPACES, JSON.stringify(filtered));

  const currentId = await loadCurrentSpaceId();
  if (currentId === id) {
    await AsyncStorage.removeItem(KEY_CURRENT_SPACE);
  }
}

import { SHIFT_META, type ShiftMeta } from '../constants/theme';
import type { ShiftType } from '../types';
import type { ShiftColorOverrideMap } from './storage';

function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#1F2937' : '#FFFFFF';
}

export function buildShiftMetaWithOverrides(
  overrides: ShiftColorOverrideMap
): Readonly<Record<ShiftType, ShiftMeta>> {
  const merged: Record<ShiftType, ShiftMeta> = { ...SHIFT_META };
  for (const [code, color] of Object.entries(overrides)) {
    if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) continue;
    const key = code as ShiftType;
    const base = merged[key];
    if (!base) continue;
    merged[key] = {
      ...base,
      bg: color.toUpperCase(),
      fg: contrastText(color),
    };
  }
  return merged;
}


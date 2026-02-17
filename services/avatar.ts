/**
 * DiceBear "thumbs" avatar — SVG URL for rendering + capture.
 */
export function avatarSvgUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(seed)}`;
}

/**
 * Fetch SVG string from DiceBear. Returns null on failure.
 */
export async function fetchAvatarSvg(seed: string): Promise<string | null> {
  try {
    const res = await fetch(avatarSvgUrl(seed));
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

/**
 * Extract initials from a display name (max 2 chars).
 * Used as text fallback when no avatar image exists.
 */
export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

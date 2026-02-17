import * as Crypto from "expo-crypto";

/**
 * Generate a cryptographically strong invite token (32 bytes / 256 bits entropy).
 * Uses expo-crypto which delegates to native secure random.
 */
export function createInviteToken(): string {
  const bytes = Crypto.getRandomBytes(32);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Encode space invite data as a deep-link URI.
 * Contains only spaceId + token — no personal data.
 */
export function encodeInvitePayload(params: {
  spaceId: string;
  token: string;
}): string {
  return `yasa://join?spaceId=${encodeURIComponent(params.spaceId)}&token=${encodeURIComponent(params.token)}`;
}

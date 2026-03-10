/**
 * Multiavatar – lokale SVG-Generierung (Iteration 8 / BUG-004 Fix)
 *
 * Vorher: SvgUri → https://api.multiavatar.com/<seed>.svg
 *   Problem: 403-Fehler auf Android, externe Abhängigkeit, offline kaputt.
 *
 * Jetzt:  @multiavatar/multiavatar lokal aufrufen → liefert SVG-String.
 *   Kein Netzwerk, kein API-Key, 100 % offlinefähig.
 *
 * Fallback-URL (PNG) für Notfälle: buildMultiavatarPngUrl()
 */

// ─── Robuster Loader (CJS/ESM Interop) ────────────────────────────────────────
// Metro kann je nach Version den Export als default, als Funktion direkt,
// oder als { default: fn } liefern. Wir probieren alle Varianten ab.
// Wenn alles fehlschlägt: App crasht NICHT, nur console.warn + SVG-Fallback.

let multiavatarFn: ((seed: string) => string) | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@multiavatar/multiavatar');
  // CJS: mod ist direkt eine Funktion
  // ESM-via-Metro: mod.default ist die Funktion
  // Interop: mod.__esModule && mod.default
  const resolved = typeof mod === 'function'
    ? mod
    : typeof mod?.default === 'function'
      ? mod.default
      : null;
  if (typeof resolved === 'function') {
    multiavatarFn = resolved as (seed: string) => string;
  } else {
    console.warn('[Multiavatar] Konnte Funktion nicht aus Modul extrahieren.', {
      modType: typeof mod,
      defaultType: typeof mod?.default,
    });
  }
} catch (err) {
  console.warn('[Multiavatar] require fehlgeschlagen – Fallback aktiv.', err);
}

// ─── Hardcoded SVG-Fallback ────────────────────────────────────────────────────
// Wird verwendet wenn die Lib nicht geladen werden kann oder ungültiges SVG liefert.
// Einfacher grauer Kreis mit Initialen-Platzhalter.
function fallbackSvg(seed: string): string {
  const initial = seed ? seed.charAt(0).toUpperCase() : '?';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 231 231">
  <circle cx="115.5" cy="115.5" r="115.5" fill="#9CA3AF"/>
  <text x="115.5" y="140" text-anchor="middle" fill="#fff"
    font-size="100" font-family="sans-serif" font-weight="bold">${initial}</text>
</svg>`;
}

/**
 * Normalisiert einen Seed-String für konsistente Avatar-Generierung:
 * - Trim
 * - Kleinschreibung (verhindert Doppel-Avatare durch Case-Varianten)
 */
function normalizeSeed(seed: string): string {
  return seed.trim().toLowerCase();
}

/**
 * Generiert lokal einen SVG-String für den gegebenen Seed.
 * Validiert: Ergebnis muss ein string sein und mit "<svg" beginnen.
 * Gibt SVG-Fallback zurück bei jedem Fehler – crasht niemals.
 */
export function buildMultiavatarSvg(seed: string): string {
  try {
    const normalized = normalizeSeed(seed);
    if (!normalized) return '';

    if (!multiavatarFn) {
      return fallbackSvg(normalized);
    }

    const result = multiavatarFn(normalized);

    // Validierung: muss String sein und mit <svg beginnen
    if (typeof result === 'string' && result.trimStart().startsWith('<svg')) {
      return result;
    }

    console.warn('[Multiavatar] Ungültiges Ergebnis.', {
      seed: normalized,
      type: typeof result,
      starts: typeof result === 'string' ? result.substring(0, 30) : '(not a string)',
    });
    return fallbackSvg(normalized);
  } catch (err) {
    console.warn('[Multiavatar] Generierung fehlgeschlagen.', { seed, err });
    return fallbackSvg(seed);
  }
}

/**
 * PNG-Fallback-URL (nur wenn SVG-Rendering komplett fehlschlägt).
 * Nutzt encodeURIComponent für Sonderzeichen.
 */
export function buildMultiavatarPngUrl(seed: string): string {
  const encoded = encodeURIComponent(normalizeSeed(seed));
  return `https://api.multiavatar.com/${encoded}.png`;
}

/**
 * @deprecated Seit BUG-004: SVG-URL führt zu 403.
 * Nur noch für Migrationszwecke (um alte avatarUrl-Strings zu erkennen).
 * Nicht mehr für neue Avatare verwenden!
 */
export function buildMultiavatarUrl(seed: string): string {
  const encoded = encodeURIComponent(seed.trim());
  return `https://api.multiavatar.com/${encoded}.svg`;
}

/**
 * Erkennt ob eine gespeicherte avatarUrl eine alte SVG-API-URL ist.
 * Falls ja → Seed extrahieren für lokale Neu-Generierung.
 */
export function extractSeedFromLegacyUrl(url: string): string | null {
  try {
    // Format: https://api.multiavatar.com/<encoded>.svg
    const match = url.match(/api\.multiavatar\.com\/(.+)\.svg$/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

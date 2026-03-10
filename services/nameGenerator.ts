/**
 * YASA Name Generator (MVP)
 *
 * Zwei Modi:
 *
 * A) Legacy (2 Felder): generateNames(prefixFirst, prefixLast)
 *    - prefixFirst (2–3), prefixLast (2–3)
 *    - Obfuscation: lastPrefix + firstPrefix (gedreht)
 *
 * B) Neu (1 Feld): generateNamesFromInitials(initials)
 *    - initials: 2–6 Buchstaben, z.B. "ThMu" oder "TM"
 *    - Splittet in der Mitte → Hälfte A + Hälfte B
 *    - Obfuscation: B + A (gedreht), verschiedene Varianten
 */

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function isLettersOnly(s: string): boolean {
  return /^[A-Za-zÄÖÜäöüß]+$/.test(s);
}

export interface NameGeneratorResult {
  names: string[];
  error?: string;
}

/**
 * Neue API: Ein Feld, 2–6 Buchstaben → 5 Namensvorschläge.
 */
export function generateNamesFromInitials(raw: string): NameGeneratorResult {
  const input = raw.replace(/[^A-Za-zÄÖÜäöüß]/g, '').trim();

  if (input.length < 2) {
    return { names: [], error: 'Bitte mindestens 2 Buchstaben eingeben.' };
  }
  if (input.length > 6) {
    return { names: [], error: 'Maximal 6 Buchstaben erlaubt.' };
  }
  if (!isLettersOnly(input)) {
    return { names: [], error: 'Nur Buchstaben erlaubt.' };
  }

  // Splitten: Mitte (abgerundet) → partA + partB
  const mid = Math.floor(input.length / 2);
  const partA = input.slice(0, mid) || input.slice(0, 1);
  const partB = input.slice(mid) || input.slice(-1);

  const capA = capitalize(partA);
  const capB = capitalize(partB);
  const reversed = capitalize(partA.split('').reverse().join(''));

  // 5 deterministische Varianten
  const variants: string[] = [
    capB + capA,                        // Standard: B+A
    capA + capB,                        // Umgekehrt: A+B
    capB + reversed,                    // B + reversed(A)
    capitalize(input),                  // Ganz als ein Wort
    capB + capA + input.length,         // Mit Zahl-Suffix
  ];

  // Deduplizieren (Set → Array), dann auf 5 limitieren
  const unique = [...new Set(variants)].slice(0, 5);

  return { names: unique };
}

/**
 * Legacy-API (2 Felder). Bleibt abwärtskompatibel.
 */
export function generateNames(
  prefixFirst: string,
  prefixLast: string
): NameGeneratorResult {
  const first = prefixFirst.trim();
  const last = prefixLast.trim();

  // Validierung
  if (first.length < 2 || first.length > 3) {
    return { names: [], error: 'Vorname: bitte 2–3 Buchstaben eingeben.' };
  }
  if (last.length < 2 || last.length > 3) {
    return { names: [], error: 'Nachname: bitte 2–3 Buchstaben eingeben.' };
  }
  if (!isLettersOnly(first)) {
    return { names: [], error: 'Vorname: nur Buchstaben erlaubt, kein Realname.' };
  }
  if (!isLettersOnly(last)) {
    return { names: [], error: 'Nachname: nur Buchstaben erlaubt, kein Realname.' };
  }

  // Obfuscation: lastPrefix + firstPrefix (gedreht)
  const base = capitalize(last) + capitalize(first);

  // 5 deterministische Varianten
  const variants: string[] = [
    base,
    `${base}-2`,
    `${base}-3`,
    capitalize(last) + capitalize(first).split('').reverse().join(''),
    capitalize(first) + capitalize(last),
  ];

  return { names: variants };
}

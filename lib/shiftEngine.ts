/**
 * shiftEngine.ts – Zentrale, UTC-stabile Schichtplan-Berechnungen.
 *
 * Einzige Quelle der Wahrheit für:
 *   • diffDaysUTC      – Tagesdifferenz zwischen zwei ISO-Daten
 *   • shiftCodeAtDate  – Pattern-Index und Schichtcode für ein Datum
 *   • weekdayIndexUTC  – Wochentag eines ISO-Datums (Mo=0 … So=6)
 *
 * Domain-Invariante:
 *   Pattern[0] gehört IMMER zum Startdatum.
 *   patternIndex(d) = diffDays(startDate, d) % cycleLength
 *
 * Alle Berechnungen nutzen Date.UTC() um DST-Sprünge zu vermeiden.
 */

import type { ShiftType } from '../types';

// ─── diffDaysUTC ──────────────────────────────────────────────────────────────

/**
 * UTC-stabile Tagesdifferenz zwischen zwei ISO-Daten ("YYYY-MM-DD").
 *
 * @returns Positiv wenn endISO > startISO, negativ wenn endISO < startISO.
 *
 * Warum UTC? "YYYY-MM-DD" ohne Zeitanteil wird als UTC-Mitternacht
 * interpretiert. Wir berechnen daher direkt via Date.UTC(), ohne den
 * lokalen Zeitversatz einzubeziehen. DST-Sprünge haben keinen Einfluss.
 */
export function diffDaysUTC(startISO: string, endISO: string): number {
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs   = Date.UTC(ey, em - 1, ed);
  return Math.floor((endMs - startMs) / 86_400_000);
}

// ─── shiftCodeAtDate ─────────────────────────────────────────────────────────

/**
 * Schichtcode für `targetISO` basierend auf Startdatum und Pattern.
 *
 * Zentrale Implementierung – calendar.tsx, today.tsx und alle weiteren
 * Screens verwenden NUR diese Funktion (keine Duplikate).
 *
 * patternIndex = diffDays(startDate, target) % cycleLength
 * Pattern[0]   ≡ startDate
 *
 * @returns null wenn Datum vor Startdatum oder Pattern leer.
 */
export function shiftCodeAtDate(
  startISO: string,
  pattern: ShiftType[],
  targetISO: string,
): ShiftType | null {
  if (!pattern.length) return null;
  const diff = diffDaysUTC(startISO, targetISO);
  if (Number.isNaN(diff)) return null; // malformed ISO-String → kein crash
  if (diff < 0) return null;
  return pattern[diff % pattern.length];
}

// ─── detectSubPattern ─────────────────────────────────────────────────────────

/**
 * Erkennt ob ein Pattern ein *unvollständiges* Vielfaches eines kürzeren
 * Teil-Musters ist und berechnet die fehlenden Zellen zur Vervollständigung.
 *
 * Algorithmus: Sucht das kleinste Periode p ≥ 7, für das gilt:
 *   ∀ i ∈ [0, n): pattern[i] === pattern[i % p]
 * … UND n % p ≠ 0 (d. h. der Zyklus endet nicht auf einer ganzen Wiederholung).
 *
 * Beispiel: NNKRRRNNNNNNNRRRNNNNNNNKRRRNNNNNNNR (n=35, p=21)
 *   → completedLength = 42, extension = [R, R, N, N, N, N, N]
 *
 * @param pattern   Das eingegebene Muster (slice auf cycleLength).
 * @param maxLength Maximale erlaubte Gesamtlänge (Default: 56 = MAX_CYCLE).
 * @returns         Vervollständigungs-Hinweis oder null wenn kein Muster gefunden.
 */
export function detectSubPattern(
  pattern: ShiftType[],
  maxLength = 56,
): {
  period: number;
  completedLength: number;
  extension: ShiftType[];
} | null {
  const n = pattern.length;
  // Zu kurz für sinnvolle Erkennung (min. 2 Wochen eingegeben)
  if (n < 8) return null;
  // Alle Zellen noch auf 'R' → Nutzer hat noch nichts eingegeben
  if (pattern.every((c) => c === 'R')) return null;

  for (let p = 7; p < n; p++) {
    // Wenn n bereits ein vollständiges Vielfaches von p ist,
    // gibt es nichts zu vervollständigen → überspringen.
    if (n % p === 0) continue;

    // Prüfe ob pattern[i] === pattern[i % p] für alle i
    let matches = true;
    for (let i = 0; i < n; i++) {
      if (pattern[i] !== pattern[i % p]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      const completedLength = Math.ceil(n / p) * p;
      // Keine Vervollständigung über das App-Maximum hinaus
      if (completedLength > maxLength) return null;
      // Fehlende Zellen: pattern[n % p] … pattern[completedLength-1 % p]
      const extension: ShiftType[] = [];
      for (let i = n; i < completedLength; i++) {
        extension.push(pattern[i % p]);
      }
      return { period: p, completedLength, extension };
    }
  }
  return null;
}

// ─── weekdayIndexUTC ──────────────────────────────────────────────────────────

/**
 * Wochentag eines ISO-Datums (UTC-stabil).
 *
 * Warum UTC? `new Date("YYYY-MM-DD")` wird als UTC-Mitternacht geparsed.
 * In Zeitzonen mit negativem Offset (z. B. UTC-5) würde `.getDay()` den
 * *lokalen* Wochentag des Vortags liefern. Wir verwenden `.getUTCDay()`
 * um den Wochentag des ISO-Datums unabhängig von der Zeitzone zu erhalten.
 *
 * @returns 0 = Montag … 6 = Sonntag, -1 bei ungültigem Format.
 */
export function weekdayIndexUTC(dateISO: string): number {
  const parts = dateISO.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => isNaN(n) || n <= 0)) return -1;
  const [y, m, d] = parts;
  // getUTCDay(): 0 = Sonntag – in Mo=0-Konvention umrechnen
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

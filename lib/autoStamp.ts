/**
 * autoStamp.ts — Auto-Platzhalter für vergessene Stempelzeiten
 *
 * Wenn ein Nutzer bis zum Ablauf des Cutoff-Fensters keine Stempelzeiten
 * erfasst hat, werden automatisch Platzhalter-Events (source='auto_placeholder')
 * zu den nominalen Schichtzeiten eingefügt.
 *
 * Eigenschaften:
 *   - Rückblick: vom gestrigen Tag bis zum ersten Tag des laufenden Monats.
 *   - Idempotent: bereits abgeschlossene oder anomale Schichten werden übersprungen.
 *   - Nur reguläre Schichtcodes: F, S, N, KS, KN, T.
 *   - Cutoff: Schichtende + postShiftGraceMinutes + AUTOSTAMP_EXTRA_GRACE_HOURS.
 *   - Platzhalter sind über den bestehenden "Bearbeiten"-Flow in timeclock.tsx korrigierbar.
 *   - Member-Parität: getShiftForDate fällt jetzt per Zyklus-Fallback auf shiftCodeAtDate
 *     zurück, sodass auch Member-Profile mit veraltetem generatedUntilISO korrekt
 *     befüllt werden.
 */

import type { RegularShiftCode } from '../types';
import {
  getTimeClockConfigOrDefault,
  getTimeClockEvents,
  getShiftForDate,
  addTimeClockEvent,
  deriveTimeClockStampState,
  formatDateISO,
} from './storage';

/**
 * Zusätzliche Pufferzeit nach Schichtende + postShiftGraceMinutes,
 * bevor ein Platzhalter erzeugt wird. Gibt dem Nutzer Zeit zum manuellen Stempeln.
 */
export const AUTOSTAMP_EXTRA_GRACE_HOURS = 2;

const REGULAR_SHIFT_CODES: RegularShiftCode[] = ['F', 'S', 'N', 'KS', 'KN', 'T'];

function isRegularShiftCode(code: string | null): code is RegularShiftCode {
  return !!code && (REGULAR_SHIFT_CODES as string[]).includes(code);
}

function parseHHMM(input: string): number {
  const [h, m] = input.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(23, h)) * 60 + Math.max(0, Math.min(59, m));
}

function toDateFromISOAndTime(dateISO: string, hhmm: string): Date {
  const [y, mo, d] = dateISO.split('-').map(Number);
  const minutes = parseHHMM(hhmm);
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return new Date(y, mo - 1, d, hh, mm, 0, 0);
}

function weekdayLabelDE(dateISO: string): string {
  const [y, mo, d] = dateISO.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('de-DE', { weekday: 'long' });
}

/**
 * Prüft für alle vergangenen Tage des laufenden Monats (exkl. heute), ob
 * Stempelzeiten fehlen, und fügt bei Bedarf Platzhalter-Events ein.
 *
 * Rückblick: von gestern bis zum ersten Tag des aktuellen Monats (inkl.).
 * Am ersten Monatstag (now.getDate() === 1) wird kein Tag geprüft.
 *
 * @param profileId   Profil-ID des Nutzers.
 * @param options     Optionale Überschreibungen (z.B. nowOverride für Tests).
 * @returns           Anzahl neu erstellter Platzhalter-Events.
 */
export async function autoStampMissedShifts(
  profileId: string,
  options?: { nowOverride?: Date }
): Promise<number> {
  const now = options?.nowOverride ?? new Date();
  const config = await getTimeClockConfigOrDefault(profileId);
  let created = 0;

  // Monatlicher Rückblick: von gestern (daysBack=1) bis Monatsanfang (daysBack=getDate()-1).
  // Am 1. eines Monats ist daysToCheck=0 → Schleife läuft nicht.
  const daysToCheck = now.getDate() - 1;

  for (let daysBack = 1; daysBack <= daysToCheck; daysBack++) {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - daysBack
    );
    const dateISO = formatDateISO(date);

    const shiftCode = await getShiftForDate(profileId, dateISO);
    if (!isRegularShiftCode(shiftCode)) continue;

    const settings = config.shiftSettings[shiftCode];
    const startAt = toDateFromISOAndTime(dateISO, settings.startTime);
    let endAt = toDateFromISOAndTime(dateISO, settings.endTime);
    // Nachtschicht: endAt kann am Folgetag liegen
    if (endAt <= startAt) {
      endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
    }

    const cutoff = new Date(
      endAt.getTime() +
        settings.postShiftGraceMinutes * 60 * 1000 +
        AUTOSTAMP_EXTRA_GRACE_HOURS * 60 * 60 * 1000
    );

    // Cutoff noch nicht erreicht → Nutzer hat noch Zeit zum manuellen Stempeln
    if (now <= cutoff) continue;

    // Events neu einlesen (wir haben ggf. in einem früheren Schleifendurchlauf Events hinzugefügt)
    const events = await getTimeClockEvents(profileId);
    const shiftEvents = events.filter(
      (e) => e.dateISO === dateISO && e.shiftCode === shiftCode
    );
    const stampState = deriveTimeClockStampState(shiftEvents);

    if (stampState.phase === 'completed' || stampState.phase === 'anomaly') {
      // Bereits vollständig oder anomal → kein Eingriff
      continue;
    }

    if (stampState.phase === 'awaiting_check_in') {
      // Beide Stempelzeiten fehlen → Kommen + Gehen zum nominalen Schichtzeitpunkt
      await addTimeClockEvent(profileId, {
        dateISO,
        weekdayLabel: weekdayLabelDE(dateISO),
        shiftCode,
        eventType: 'check_in',
        timestampISO: startAt.toISOString(),
        source: 'auto_placeholder',
      });
      await addTimeClockEvent(profileId, {
        dateISO,
        weekdayLabel: weekdayLabelDE(dateISO),
        shiftCode,
        eventType: 'check_out',
        timestampISO: endAt.toISOString(),
        source: 'auto_placeholder',
      });
      created += 2;
    } else if (stampState.phase === 'awaiting_check_out') {
      // Kommen vorhanden, Gehen fehlt → nur Gehen zum nominalen Schichtende
      await addTimeClockEvent(profileId, {
        dateISO,
        weekdayLabel: weekdayLabelDE(dateISO),
        shiftCode,
        eventType: 'check_out',
        timestampISO: endAt.toISOString(),
        source: 'auto_placeholder',
      });
      created += 1;
    }
  }

  return created;
}

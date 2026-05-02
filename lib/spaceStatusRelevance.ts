import { SHIFT_META } from '../constants/theme';
import type { ShiftType } from '../types';
import type { SpaceStatusEvent } from '../types/spaceStatus';

export function isShiftpalRelevantStatusEvent(
  event: SpaceStatusEvent,
  profileId: string,
  ownShiftCode: ShiftType | null
): boolean {
  if (event.actorProfileId === profileId) return true;
  if (event.audience !== 'shiftpals') return event.audience === 'space';
  if (!event.dateISO || !event.targetShiftCode || !ownShiftCode) return false;
  return ownShiftCode === event.targetShiftCode;
}

export function shiftStatusLabel(code: ShiftType | null): string {
  if (!code) return 'Kein Eintrag';
  const meta = SHIFT_META[code];
  return `${meta.label} = ${meta.desc}`;
}

export function shiftStatusName(code: ShiftType | null): string {
  if (!code) return 'Dienst';
  return SHIFT_META[code]?.desc ?? 'Dienst';
}

export function datePhrase(dateISO: string, today: string): string {
  if (dateISO === today) return 'die heutige';
  const [y, m, d] = dateISO.split('-');
  return `den Dienst am ${d}.${m}.${y}`;
}

function serviceDatePhrase(dateISO: string, today: string): string {
  if (dateISO === today) return 'den heutigen Dienst';
  const [y, m, d] = dateISO.split('-');
  return `den Dienst am ${d}.${m}.${y}`;
}

function sickRangePhrase(dateISO: string, today: string, durationDays: number): string {
  if (durationDays <= 1) return serviceDatePhrase(dateISO, today);
  if (dateISO === today) return `die kommenden ${durationDays} Tage`;
  const [y, m, d] = dateISO.split('-');
  return `ab ${d}.${m}.${y} für ${durationDays} Tage`;
}

export function buildDayStatusMessage(
  actorName: string,
  dateISO: string,
  today: string,
  oldCode: ShiftType | null,
  newCode: ShiftType | null,
  options: { durationDays?: number } = {}
): { title: string; body: string } {
  const targetShift = shiftStatusName(oldCode);
  const when = datePhrase(dateISO, today);

  if (newCode === 'X') {
    return {
      title: 'Frei genommen',
      body: `🙂 ${actorName} hat sich für ${when} ${targetShift} frei genommen.`,
    };
  }

  if (newCode === 'EK') {
    return {
      title: 'entschuldigt Krank',
      body: `${actorName} hat sich für ${serviceDatePhrase(dateISO, today)} EK gemeldet.`,
    };
  }

  if (newCode === 'K') {
    const durationDays = Math.max(1, Math.floor(options.durationDays ?? 1));
    return {
      title: 'Krank gemeldet',
      body: `${actorName} hat sich für ${sickRangePhrase(dateISO, today, durationDays)} K gemeldet.`,
    };
  }

  return {
    title: 'Tagesstatus geändert',
    body: `${actorName}: ${shiftStatusLabel(oldCode)} -> ${shiftStatusLabel(newCode)}`,
  };
}

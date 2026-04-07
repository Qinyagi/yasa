import type { Holiday } from '../data/holidays';

export interface VacationStrategy {
  urlaubstage: string[]; // Array von YYYY-MM-DD
  freieTage: number; // Anzahl freie Tage gesamt
  feiertag: Holiday; // Der Feiertag
  strategyType: 'vacation' | 'hours';
  requiredHours?: number;
  requiresShortShiftRequest?: boolean;
}


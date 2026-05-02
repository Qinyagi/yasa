/**
 * lib/zeitkontoEngine.ts – Pure Zeitkonto computation
 *
 * Separates Foresight (plan-based projection) from Ist (actually earned).
 * All inputs are plain data, no AsyncStorage / React dependency.
 *
 * Invariants (carried from P0):
 *   - delta = worked - planned (strict)
 *   - flex stays separate, not merged into delta
 *   - holiday/preholiday credits remain explicit
 */

import type { RegularShiftCode, UserShiftPlan, UserTimeClockConfig } from '../types';
import type { SpaceRuleProfile } from '../types/timeAccount';
import type { MonthlyWorkProgress } from './timeAccountEngine';
import { getHolidayMap } from '../data/holidays';

const REGULAR_SHIFT_CODES: ReadonlySet<string> = new Set(['F', 'S', 'N', 'KS', 'KN', 'T']);

// ─── Public types ──────────────────────────────────────────────────────────

export interface ZeitkontoForesight {
  /** Total planned hours for the full month (from shift plan). */
  plannedHoursMonth: number;
  /** Remaining planned hours (tomorrow → end of month). */
  remainingPlannedHours: number;
  /** Number of remaining regular-shift days (tomorrow → end of month). */
  remainingShiftDays: number;
  /**
   * Projected end-of-month delta, assuming worked = planned for remaining days.
   * Formula: currentDelta + 0 (no change if everything goes as planned).
   * In practice this equals deltaHoursToDate because future days add 0 net.
   */
  projectedEndDelta: number;
  /** Projected additional holiday credit hours for remaining month. */
  projectedRemainingHolidayCredits: number;
  /** Projected additional preholiday credit hours for remaining month. */
  projectedRemainingPreHolidayCredits: number;
  /** Projected W-days for remaining month. */
  projectedRemainingWDays: number;
  /**
   * Projected total balance at end of month (optimistic = worked matches planned).
   * = deltaToDate + creditedToDate + projectedRemainingCredits
   */
  projectedEndBalance: number;
}

export interface ZeitkontoIst {
  /** Actual worked hours (from completed stamp intervals). */
  workedHoursToDate: number;
  /** Delta = worked - planned (strict, no flex). */
  deltaHoursToDate: number;
  /** Holiday credit hours earned so far. */
  creditedHolidayHours: number;
  /** Preholiday credit hours earned so far. */
  creditedPreHolidayHours: number;
  /** Paid flex credit hours (separate from delta). */
  creditedFlexHours: number;
  /**
   * Combined tariff credits to date (holiday + preholiday, NOT flex).
   * Flex stays separate per P0 invariant.
   */
  creditedTariffHoursTotal: number;
  /**
   * Effective balance to date = delta + tariff credits.
   * Same as totalDeltaWithCreditsToDate from MonthlyWorkProgress.
   */
  balanceToDate: number;
}

export interface ZeitkontoData {
  monthLabel: string;
  foresight: ZeitkontoForesight;
  ist: ZeitkontoIst;
}

// ─── Input type ────────────────────────────────────────────────────────────

export interface ComputeZeitkontoInput {
  monthSummary: MonthlyWorkProgress;
  plan: UserShiftPlan | null;
  config: UserTimeClockConfig | null;
  spaceProfile: SpaceRuleProfile | null;
  qaDateOverrides?: Record<string, string>;
  today?: Date;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function minutesForHHMM(input: string): number {
  const [hRaw, mRaw] = input.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  const hh = Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 0;
  const mm = Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0;
  return hh * 60 + mm;
}

function plannedShiftMinutes(window: { startTime: string; endTime: string }): number {
  const start = minutesForHHMM(window.startTime);
  let end = minutesForHHMM(window.endTime);
  if (end <= start) end += 24 * 60;
  return end - start;
}

function plusDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const next = new Date(y, m - 1, d);
  next.setDate(next.getDate() + days);
  return formatDateISO(next);
}

function collectHolidayMap(fromISO: string, toISO: string): Record<string, { date: string; name: string }> {
  const fromYear = Number(fromISO.slice(0, 4));
  const toYear = Number(toISO.slice(0, 4));
  const map: Record<string, { date: string; name: string }> = {};
  for (let year = fromYear; year <= toYear + 1; year++) {
    Object.assign(map, getHolidayMap(year));
  }
  return map;
}

// ─── Main ──────────────────────────────────────────────────────────────────

export function computeZeitkonto(input: ComputeZeitkontoInput): ZeitkontoData {
  const { monthSummary, plan, config, spaceProfile, qaDateOverrides } = input;
  const todayDate = input.today ?? new Date();
  const todayISO = formatDateISO(todayDate);

  // ── Ist (abgeleistet) ──────────────────────────────────────────────────
  const ist: ZeitkontoIst = {
    workedHoursToDate: monthSummary.workedHoursToDate,
    deltaHoursToDate: monthSummary.deltaHoursToDate,
    creditedHolidayHours: monthSummary.creditedHolidayHoursToDate,
    creditedPreHolidayHours: monthSummary.creditedPreHolidayHoursToDate,
    creditedFlexHours: monthSummary.creditedFlexHoursToDate,
    creditedTariffHoursTotal: monthSummary.creditedHoursToDate,
    balanceToDate: monthSummary.totalDeltaWithCreditsToDate,
  };

  // ── Foresight (Plan) ───────────────────────────────────────────────────
  let remainingPlannedHours = 0;
  let remainingShiftDays = 0;
  let projectedRemainingHolidayCredits = 0;
  let projectedRemainingPreHolidayCredits = 0;
  let projectedRemainingWDays = 0;

  if (plan && config) {
    const holidayMap = collectHolidayMap(monthSummary.fromISO, monthSummary.toISO);

    const futureEntries = plan.entries.filter(
      (e) => e.dateISO > todayISO && e.dateISO <= monthSummary.toISO
    );

    for (const entry of futureEntries) {
      const isRegularShift = REGULAR_SHIFT_CODES.has(entry.code);
      const shiftCode = entry.code as RegularShiftCode;
      const shiftWindow = isRegularShift ? config.shiftSettings[shiftCode] : null;

      let hours = 0;
      if (shiftWindow) {
        hours = plannedShiftMinutes(shiftWindow) / 60;
        remainingPlannedHours += hours;
        remainingShiftDays += 1;
      }

      // Check if future date is a holiday / preholiday
      const overrideType = qaDateOverrides?.[entry.dateISO];
      const isHoliday =
        overrideType === 'holiday' ||
        (overrideType !== 'preholiday' && !!holidayMap[entry.dateISO]);
      const isPreHoliday =
        overrideType === 'preholiday' ||
        (overrideType !== 'holiday' && !!holidayMap[plusDaysISO(entry.dateISO, 1)]);

      if (spaceProfile?.holidayCredit.enabled && isHoliday && hours > 0) {
        projectedRemainingHolidayCredits += hours;
      }
      if (spaceProfile?.preHolidayCredit.enabled && isPreHoliday && hours > 0) {
        projectedRemainingPreHolidayCredits += hours;
      }
      if (spaceProfile?.codeRules.W?.enabled && isHoliday && entry.code === 'R') {
        projectedRemainingWDays += 1;
      }
    }
  }

  // Projected end delta = currentDelta + 0 (future worked == future planned by assumption)
  const projectedEndDelta = monthSummary.deltaHoursToDate;

  // Projected total balance at end of month (optimistic):
  // currentBalance + projected remaining credits
  const projectedEndBalance =
    monthSummary.totalDeltaWithCreditsToDate +
    projectedRemainingHolidayCredits +
    projectedRemainingPreHolidayCredits;

  const foresight: ZeitkontoForesight = {
    plannedHoursMonth: monthSummary.plannedHoursMonth,
    remainingPlannedHours,
    remainingShiftDays,
    projectedEndDelta,
    projectedRemainingHolidayCredits,
    projectedRemainingPreHolidayCredits,
    projectedRemainingWDays,
    projectedEndBalance,
  };

  return {
    monthLabel: monthSummary.monthLabel,
    foresight,
    ist,
  };
}

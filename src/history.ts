/**
 * What the logs actually say, across every month you have data for.
 *
 * The plan's figures were set from assumption. This turns the imported history into the
 * numbers those figures should have been set from: what a month really costs, how the days
 * fall, and how often a big day actually happens.
 */
import { round2 } from './engine';
import type { AppState, MonthKey } from './types';

export interface MonthTotal {
  month: MonthKey;
  total: number;
  spendDays: number;
  daysInMonth: number;
  /** Days the log covers, so a part-month is not read as a cheap month. */
  complete: boolean;
}

export interface DayShape {
  days: number;
  quietDays: number;
  quietShare: number;
  medianSpendDay: number;
  meanSpendDay: number;
  /** Amount at each percentile of the days you did spend. */
  p75: number;
  p90: number;
  p95: number;
  biggestDay: number;
  /** Days at or above the big-night threshold, per 30 days. */
  bigDaysPerMonth: number;
  meanBigDay: number;
  /** Share of all spending that happens on big days. */
  bigDayShareOfSpend: number;
  byWeekday: Array<{ name: string; mean: number; spendDayOdds: number; medianWhenSpending: number }>;
}

export interface HistorySummary {
  months: MonthTotal[];
  /** Complete months only — a part-month would drag the averages down. */
  completeMonths: MonthTotal[];
  medianMonth: number;
  meanMonth: number;
  cheapestMonth: number;
  dearestMonth: number;
  /** Median of the most recent six complete months. */
  recentMedian: number;
  shape: DayShape;
  /** Suggested budget: the recent median rounded up, with a little headroom. */
  suggestedBudget: number;
  hasEnoughData: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const percentile = (sorted: number[], p: number): number => {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return round2(lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo));
};

const daysIn = (month: MonthKey): number => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

export function summariseHistory(
  state: AppState,
  bigNightThreshold = 50,
  now = new Date(),
): HistorySummary {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const months: MonthTotal[] = Object.values(state.months)
    .filter((e) => (e.spends?.length ?? 0) > 0)
    .map((e) => {
      const spends = e.spends ?? [];
      const days = new Set(spends.map((s) => s.date));
      return {
        month: e.month,
        total: round2(spends.reduce((a, s) => a + s.amount, 0)),
        spendDays: days.size,
        daysInMonth: daysIn(e.month),
        // The month in progress is not comparable with finished ones.
        complete: e.month < currentMonth,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));

  const completeMonths = months.filter((m) => m.complete);
  const totals = completeMonths.map((m) => m.total).sort((a, b) => a - b);
  const recent = completeMonths.slice(-6).map((m) => m.total).sort((a, b) => a - b);

  // Every day of every complete month, zeros included.
  const dayTotals: Array<{ amount: number; weekday: number }> = [];
  for (const m of completeMonths) {
    const entry = state.months[m.month];
    const byDay = new Map<number, number>();
    for (const s of entry.spends ?? []) {
      const d = Number(s.date.slice(8, 10));
      byDay.set(d, round2((byDay.get(d) ?? 0) + s.amount));
    }
    const [y, mm] = m.month.split('-').map(Number);
    for (let d = 1; d <= m.daysInMonth; d++) {
      dayTotals.push({ amount: byDay.get(d) ?? 0, weekday: new Date(y, mm - 1, d).getDay() });
    }
  }

  const spendAmounts = dayTotals.filter((d) => d.amount > 0).map((d) => d.amount).sort((a, b) => a - b);
  const bigDays = dayTotals.filter((d) => d.amount >= bigNightThreshold);
  const allSpend = dayTotals.reduce((a, d) => a + d.amount, 0);

  const byWeekday = WEEKDAYS.map((name, i) => {
    const days = dayTotals.filter((d) => d.weekday === i);
    const spent = days.filter((d) => d.amount > 0).map((d) => d.amount).sort((a, b) => a - b);
    return {
      name,
      mean: days.length ? round2(days.reduce((a, d) => a + d.amount, 0) / days.length) : 0,
      spendDayOdds: days.length ? round2(spent.length / days.length) : 0,
      medianWhenSpending: percentile(spent, 0.5),
    };
    // Monday first reads better than Sunday first for a week of spending.
  });
  const mondayFirst = [...byWeekday.slice(1), byWeekday[0]];

  const shape: DayShape = {
    days: dayTotals.length,
    quietDays: dayTotals.length - spendAmounts.length,
    quietShare: dayTotals.length ? round2((dayTotals.length - spendAmounts.length) / dayTotals.length) : 0,
    medianSpendDay: percentile(spendAmounts, 0.5),
    meanSpendDay: spendAmounts.length
      ? round2(spendAmounts.reduce((a, b) => a + b, 0) / spendAmounts.length)
      : 0,
    p75: percentile(spendAmounts, 0.75),
    p90: percentile(spendAmounts, 0.9),
    p95: percentile(spendAmounts, 0.95),
    biggestDay: spendAmounts.length ? spendAmounts[spendAmounts.length - 1] : 0,
    bigDaysPerMonth: dayTotals.length ? round2((bigDays.length / dayTotals.length) * 30) : 0,
    meanBigDay: bigDays.length ? round2(bigDays.reduce((a, d) => a + d.amount, 0) / bigDays.length) : 0,
    bigDayShareOfSpend: allSpend
      ? round2(bigDays.reduce((a, d) => a + d.amount, 0) / allSpend)
      : 0,
    byWeekday: mondayFirst,
  };

  const recentMedian = percentile(recent, 0.5);
  return {
    months,
    completeMonths,
    medianMonth: percentile(totals, 0.5),
    meanMonth: totals.length ? round2(totals.reduce((a, b) => a + b, 0) / totals.length) : 0,
    cheapestMonth: totals[0] ?? 0,
    dearestMonth: totals[totals.length - 1] ?? 0,
    recentMedian,
    shape,
    // Round up to the nearest £25 so the budget is a number you can hold in your head.
    suggestedBudget: recentMedian > 0 ? Math.ceil((recentMedian * 1.05) / 25) * 25 : 0,
    hasEnoughData: completeMonths.length >= 3,
  };
}

/**
 * Forecasting the rest of the month.
 *
 * A single projected line cannot describe a real month: most days are nothing, some are
 * £15, and a Saturday might be £60. So instead of inventing an average day, the rest of
 * the month is simulated by drawing days at random from the days you have actually had —
 * zeros included — and running that a couple of thousand times.
 *
 * What comes out is a range rather than a false certainty: where you will probably land,
 * how bad a bad month looks, and the odds of finishing inside the budget.
 */
import { round2 } from './engine';
import type { MonthKey, SpendEntry } from './types';

/** Deterministic RNG, so the forecast does not jitter on every re-render. */
function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export interface DayObservation {
  /** Total spent that day, which is very often zero. */
  amount: number;
  /** Friday or Saturday — the days that behave differently. */
  isWeekend: boolean;
}

export interface ForecastBand {
  day: number;
  low: number;
  mid: number;
  high: number;
}

export interface Forecast {
  /** Days of history the simulation drew from. */
  sampleSize: number;
  usedPriorMonths: boolean;
  /** Where the month most likely ends up. */
  median: number;
  /** A quiet rest-of-month (10th percentile) and a heavy one (90th). */
  low: number;
  high: number;
  /** Odds of finishing at or under budget, 0–1. */
  probabilityWithinBudget: number;
  /** Median day the budget runs out, across the runs where it does. */
  likelyRunOutDay?: number;
  /** Share of runs where the money runs out before month end. */
  probabilityRunOut: number;
  /** Cumulative spend bands per day, for the fan chart. */
  bands: ForecastBand[];
  /** Days with no spending at all, as a share of the sample. */
  quietDayShare: number;
  /** Median amount on the days something was spent. */
  typicalSpendDay: number;
  /** Biggest single day in the sample. */
  biggestDay: number;
  /** True when there is too little history to say much. */
  thin: boolean;
}

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return round2(lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo));
};

const isWeekendDay = (month: MonthKey, day: number): boolean => {
  const [y, m] = month.split('-').map(Number);
  const dow = new Date(y, m - 1, day).getDay();
  return dow === 5 || dow === 6;
};

/**
 * Every elapsed day of a month as one observation, including the days you spent nothing —
 * those are the majority and leaving them out is what makes averages lie.
 */
export function observeDays(
  month: MonthKey,
  spends: SpendEntry[],
  upToDay: number,
): DayObservation[] {
  const totals = new Map<number, number>();
  for (const s of spends) {
    const d = Number(s.date.slice(8, 10));
    if (d > upToDay) continue;
    totals.set(d, round2((totals.get(d) ?? 0) + s.amount));
  }
  return Array.from({ length: Math.max(0, upToDay) }, (_, i) => ({
    amount: totals.get(i + 1) ?? 0,
    isWeekend: isWeekendDay(month, i + 1),
  }));
}

export interface ForecastInput {
  month: MonthKey;
  budget: number;
  spent: number;
  dayOfMonth: number;
  daysInMonth: number;
  /** This month's days so far. */
  observations: DayObservation[];
  /** Earlier months' days, used when this month is too young to read. */
  priorObservations?: DayObservation[];
  runs?: number;
}

const MIN_SAMPLE = 12;

export function forecastMonth({
  month,
  budget,
  spent,
  dayOfMonth,
  daysInMonth,
  observations,
  priorObservations = [],
  runs = 2000,
}: ForecastInput): Forecast {
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);

  // A young month has too few days to resample, so earlier months are brought in.
  const usedPriorMonths = observations.length < MIN_SAMPLE && priorObservations.length > 0;
  const pool = usedPriorMonths ? [...observations, ...priorObservations] : observations;
  const weekendPool = pool.filter((o) => o.isWeekend);
  const weekdayPool = pool.filter((o) => !o.isWeekend);

  const amounts = pool.map((o) => o.amount);
  const spendAmounts = amounts.filter((a) => a > 0).sort((x, z) => x - z);
  const quietDayShare = pool.length ? (pool.length - spendAmounts.length) / pool.length : 0;
  const typicalSpendDay = percentile(spendAmounts, 0.5);
  const biggestDay = amounts.length ? round2(Math.max(...amounts)) : 0;
  const thin = pool.length < MIN_SAMPLE;

  const base = {
    sampleSize: pool.length,
    usedPriorMonths,
    quietDayShare: round2(quietDayShare),
    typicalSpendDay,
    biggestDay,
    thin,
  };

  // Nothing to learn from yet: report the position as it stands rather than invent a range.
  if (pool.length === 0 || daysLeft === 0) {
    return {
      ...base,
      median: round2(spent),
      low: round2(spent),
      high: round2(spent),
      probabilityWithinBudget: spent <= budget ? 1 : 0,
      probabilityRunOut: spent > budget ? 1 : 0,
      bands: [],
      likelyRunOutDay: undefined,
    };
  }

  const random = mulberry32(hash(`${month}:${pool.length}:${spent}:${budget}`));
  const draw = (isWeekend: boolean): number => {
    // Weekends behave differently, but only trust that when there are enough of them.
    const from = isWeekend
      ? weekendPool.length >= 3
        ? weekendPool
        : pool
      : weekdayPool.length >= 3
        ? weekdayPool
        : pool;
    return from[Math.floor(random() * from.length)].amount;
  };

  const futureIsWeekend = Array.from({ length: daysLeft }, (_, i) =>
    isWeekendDay(month, dayOfMonth + i + 1),
  );

  const endTotals: number[] = [];
  const runOutDays: number[] = [];
  // cumulative[i] holds every run's total at day dayOfMonth + i + 1.
  const cumulative: number[][] = Array.from({ length: daysLeft }, () => []);

  for (let r = 0; r < runs; r++) {
    let total = spent;
    let ranOut = 0;
    for (let i = 0; i < daysLeft; i++) {
      total = round2(total + draw(futureIsWeekend[i]));
      cumulative[i].push(total);
      if (!ranOut && total > budget) ranOut = dayOfMonth + i + 1;
    }
    endTotals.push(total);
    if (ranOut) runOutDays.push(ranOut);
    else if (spent > budget) runOutDays.push(dayOfMonth);
  }

  endTotals.sort((a, b) => a - b);
  runOutDays.sort((a, b) => a - b);

  const bands: ForecastBand[] = [
    { day: dayOfMonth, low: round2(spent), mid: round2(spent), high: round2(spent) },
    ...cumulative.map((run, i) => {
      const sorted = [...run].sort((a, b) => a - b);
      return {
        day: dayOfMonth + i + 1,
        low: percentile(sorted, 0.1),
        mid: percentile(sorted, 0.5),
        high: percentile(sorted, 0.9),
      };
    }),
  ];

  return {
    ...base,
    median: percentile(endTotals, 0.5),
    low: percentile(endTotals, 0.1),
    high: percentile(endTotals, 0.9),
    probabilityWithinBudget: round2(endTotals.filter((t) => t <= budget).length / runs),
    probabilityRunOut: round2(runOutDays.length / runs),
    likelyRunOutDay: runOutDays.length ? Math.round(percentile(runOutDays, 0.5)) : undefined,
    bands,
  };
}

/**
 * What the money left actually buys, in the shape a month really takes: a number of
 * ordinary spend days, and a number of bigger nights out.
 */
export function affordableShape(
  remaining: number,
  daysLeft: number,
  quietDayShare: number,
  typicalSpendDay: number,
  typicalBigNight: number,
  weekendNightsLeft: number,
): { spendDays: number; bigNights: number; quietDays: number } {
  if (remaining <= 0 || daysLeft <= 0) return { spendDays: 0, bigNights: 0, quietDays: Math.max(0, daysLeft) };
  const expectedSpendDays = Math.round(daysLeft * (1 - quietDayShare));
  const everyday = round2(expectedSpendDays * Math.max(typicalSpendDay, 0));
  const spare = Math.max(0, remaining - everyday);
  return {
    spendDays: expectedSpendDays,
    // Nights out happen on the weekends that are left, however much money is spare.
    bigNights: Math.min(weekendNightsLeft, Math.floor(spare / Math.max(1, typicalBigNight))),
    quietDays: Math.max(0, daysLeft - expectedSpendDays),
  };
}

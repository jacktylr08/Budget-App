/**
 * Month-to-date spending analysis for the guilt-free budget.
 *
 * The question this exists to answer is "am I in trouble?", and the honest answer is a
 * range, not a number. Real months are mostly quiet days with a few £50 ones, so the rest
 * of the month is forecast by resampling the days you have actually had (see forecast.ts)
 * rather than by extending an average nobody lives.
 */
import { round2 } from './engine';
import {
  affordableShape,
  forecastMonth,
  observeDays,
  type DayObservation,
  type Forecast,
} from './forecast';
import type { MonthKey, SpendEntry } from './types';

export type SpendingStatus = 'not-started' | 'under-pace' | 'on-pace' | 'over-pace' | 'spent-up';

export interface Tip {
  id: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  title: string;
  body: string;
}

export interface SpendingAnalysis {
  budget: number;
  spent: number;
  remaining: number;
  daysInMonth: number;
  /** 0 for a future month, the full month for a past one. */
  dayOfMonth: number;
  daysLeft: number;
  isCurrentMonth: boolean;
  isPastMonth: boolean;
  /** Straight-line budget position for today. */
  expectedByNow: number;
  /** Positive means spending is ahead of the straight line. */
  variance: number;
  status: SpendingStatus;
  /** What is left, spread evenly over the days remaining. */
  dailyAllowance: number;
  everydaySpent: number;
  /** Days something was spent (excluding big nights). */
  spendDays: number;
  /** Elapsed days with nothing spent at all. */
  noSpendDays: number;
  typicalSpendDay: number;
  bigNights: SpendEntry[];
  typicalBigNight: number;
  /** The day the budget was used up, when it already has been. */
  ranOutOnDay?: number;
  /** Where the month lands, as a range with odds. */
  forecast: Forecast;
  /** What the remaining money buys, in quiet days, spend days and nights out. */
  shape: { spendDays: number; bigNights: number; quietDays: number };
  affordableBigNights: number;
  /** No-spend days needed to get back to the straight line. */
  noSpendDaysToRecover: number;
  weekendNightsLeft: number;
  /** Actual cumulative spend by day, up to today. */
  cumulativeByDay: Array<{ day: number; spent: number | null; budgetLine: number }>;
  tips: Tip[];
}

const dayOf = (isoDate: string): number => Number(isoDate.slice(8, 10));

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Fridays and Saturdays remaining after `fromDay` (exclusive). */
function weekendNightsAfter(month: MonthKey, fromDay: number): number {
  const [y, m] = month.split('-').map(Number);
  let count = 0;
  for (let d = fromDay + 1; d <= daysInMonth(month); d++) {
    const dow = new Date(y, m - 1, d).getDay();
    if (dow === 5 || dow === 6) count++;
  }
  return count;
}

export function formatDayOfMonth(month: MonthKey, day: number): string {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1, day);
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';
  return `${date.toLocaleDateString('en-GB', { weekday: 'short' })} ${day}${suffix}`;
}

export interface AnalyseInput {
  month: MonthKey;
  budget: number;
  spends: SpendEntry[];
  /** The single "spent so far" figure, used when nothing has been logged. */
  fallbackTotal?: number;
  bigNightThreshold?: number;
  now?: Date;
  fundName?: string;
  fundBalance?: number;
  /** Earlier months' spend logs, so a young month still has something to learn from. */
  history?: Array<{ month: MonthKey; spends: SpendEntry[] }>;
}

export function analyseSpending({
  month,
  budget,
  spends,
  fallbackTotal = 0,
  bigNightThreshold = 50,
  now = new Date(),
  fundName,
  fundBalance = 0,
  history = [],
}: AnalyseInput): SpendingAnalysis {
  const days = daysInMonth(month);
  const [y, m] = month.split('-').map(Number);
  const isCurrentMonth = now.getFullYear() === y && now.getMonth() + 1 === m;
  const isPastMonth = new Date(y, m - 1, 1) < new Date(now.getFullYear(), now.getMonth(), 1);
  const dayOfMonth = isCurrentMonth ? now.getDate() : isPastMonth ? days : 0;
  const daysLeft = Math.max(0, days - dayOfMonth);

  const logged = [...spends].sort((a, b) => a.date.localeCompare(b.date));
  const loggedTotal = round2(logged.reduce((a, s) => a + s.amount, 0));
  const spent = logged.length > 0 ? loggedTotal : round2(fallbackTotal);
  const remaining = round2(budget - spent);

  // A night out is rarely one transaction — it is a bar, a taxi and a kebab. So a "big
  // night" is a *day* whose total clears the threshold, not a single large payment.
  const byDay = new Map<number, SpendEntry[]>();
  for (const s of logged) {
    const d = dayOf(s.date);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(s);
  }
  const dayTotal = (entries: SpendEntry[]) => round2(entries.reduce((a, s) => a + s.amount, 0));
  const bigNights: SpendEntry[] = [...byDay.entries()]
    .filter(([, entries]) => dayTotal(entries) >= bigNightThreshold)
    .map(([, entries]) => ({
      id: entries[0].date,
      date: entries[0].date,
      amount: dayTotal(entries),
      note: entries.map((e) => e.note).filter(Boolean).join(', ') || 'Big night',
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const bigNightDates = new Set(bigNights.map((b) => b.date));
  const everydaySpent = round2(loggedTotal - bigNights.reduce((a, s) => a + s.amount, 0));
  const typicalBigNight = bigNights.length
    ? round2(bigNights.reduce((a, s) => a + s.amount, 0) / bigNights.length)
    : bigNightThreshold;

  const everydayByDay = new Map<number, number>();
  for (const [day, entries] of byDay) {
    if (bigNightDates.has(entries[0].date)) continue;
    // A spend dated later this month is money gone, but says nothing about how often you
    // have been spending, so it stays out of the pattern.
    if (dayOfMonth > 0 && day > dayOfMonth) continue;
    everydayByDay.set(day, dayTotal(entries));
  }
  const spendDayAmounts = [...everydayByDay.values()].filter((v) => v > 0).sort((a, b) => a - b);
  const spendDays = spendDayAmounts.length;
  const noSpendDays = Math.max(0, Math.max(0, dayOfMonth) - spendDays - bigNights.length);
  const median = (xs: number[]): number =>
    xs.length === 0
      ? 0
      : xs.length % 2
        ? xs[(xs.length - 1) / 2]
        : round2((xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2);
  const typicalSpendDay = median(spendDayAmounts);

  const expectedByNow = round2((budget * dayOfMonth) / days);
  const variance = round2(spent - expectedByNow);
  const dailyAllowance = daysLeft > 0 ? round2(Math.max(0, remaining) / daysLeft) : 0;

  // The day the running total first crossed the budget.
  let ranOutOnDay: number | undefined;
  if (spent >= budget && budget > 0) {
    let running = 0;
    for (const s of logged) {
      running += s.amount;
      if (running >= budget) {
        ranOutOnDay = dayOf(s.date);
        break;
      }
    }
    ranOutOnDay ??= dayOfMonth;
  }

  const status: SpendingStatus =
    dayOfMonth === 0
      ? 'not-started'
      : remaining <= 0
        ? 'spent-up'
        : variance > budget * 0.05
          ? 'over-pace'
          : variance < -budget * 0.05
            ? 'under-pace'
            : 'on-pace';

  // Resample this month's days; fall back to earlier months while this one is young.
  const observations: DayObservation[] =
    logged.length > 0 || dayOfMonth === 0
      ? observeDays(month, logged, dayOfMonth)
      : // Only a running total exists: spread it evenly so there is still something to sample.
        observeDays(
          month,
          Array.from({ length: Math.max(0, dayOfMonth) }, (_, i) => ({
            id: `flat-${i}`,
            date: `${month}-${String(i + 1).padStart(2, '0')}`,
            amount: round2(spent / Math.max(1, dayOfMonth)),
          })),
          dayOfMonth,
        );
  const priorObservations = history
    .filter((h) => h.month !== month && h.spends.length > 0)
    .flatMap((h) => observeDays(h.month, h.spends, daysInMonth(h.month)));

  const forecast = forecastMonth({
    month,
    budget,
    spent,
    dayOfMonth,
    daysInMonth: days,
    observations,
    priorObservations,
  });

  const weekendNightsLeft = weekendNightsAfter(month, dayOfMonth);
  const shape = affordableShape(
    remaining,
    daysLeft,
    forecast.quietDayShare,
    forecast.typicalSpendDay,
    typicalBigNight,
    weekendNightsLeft,
  );

  const affordableBigNights = Math.max(
    0,
    Math.floor(Math.max(0, remaining) / Math.max(1, typicalBigNight)),
  );
  const noSpendDaysToRecover =
    budget > 0 && variance > 0 ? Math.max(0, Math.ceil((spent * days) / budget - dayOfMonth)) : 0;

  const cumulativeByDay: SpendingAnalysis['cumulativeByDay'] = [];
  let running = 0;
  const elapsed = Math.max(1, dayOfMonth);
  for (let d = 1; d <= days; d++) {
    running += logged.filter((s) => dayOf(s.date) === d).reduce((a, s) => a + s.amount, 0);
    cumulativeByDay.push({
      day: d,
      spent: d <= dayOfMonth ? round2(logged.length > 0 ? running : (spent * d) / elapsed) : null,
      budgetLine: round2((budget * d) / days),
    });
  }

  const tips = buildTips({
    month,
    budget,
    spent,
    remaining,
    dayOfMonth,
    daysLeft,
    days,
    variance,
    status,
    dailyAllowance,
    bigNights,
    typicalBigNight,
    ranOutOnDay,
    forecast,
    shape,
    affordableBigNights,
    noSpendDaysToRecover,
    weekendNightsLeft,
    hasLog: logged.length > 0,
    fundName,
    fundBalance,
  });

  return {
    budget,
    spent,
    remaining,
    daysInMonth: days,
    dayOfMonth,
    daysLeft,
    isCurrentMonth,
    isPastMonth,
    expectedByNow,
    variance,
    status,
    dailyAllowance,
    everydaySpent,
    spendDays,
    noSpendDays,
    typicalSpendDay,
    bigNights,
    typicalBigNight,
    ranOutOnDay,
    forecast,
    shape,
    affordableBigNights,
    noSpendDaysToRecover,
    weekendNightsLeft,
    cumulativeByDay,
    tips,
  };
}

const gbp = (n: number) => `£${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
const pc = (n: number) => `${Math.round(n * 100)}%`;

/** "9 quiet days and 6 spend days" — the rest of the month in the shape it really takes. */
function shapePhrase(shape: SpendingAnalysis['shape'], typicalSpendDay: number): string {
  const parts: string[] = [];
  if (shape.spendDays > 0) parts.push(`${shape.spendDays} days at around ${gbp(typicalSpendDay)}`);
  if (shape.bigNights > 0) parts.push(`${shape.bigNights} night${shape.bigNights === 1 ? '' : 's'} out`);
  if (shape.quietDays > 0) parts.push(`${shape.quietDays} quiet days`);
  return parts.join(', ');
}

/**
 * Concrete suggestions with a number attached. Every one is derived from the forecast,
 * so none of them can contradict the headline.
 */
function buildTips(c: {
  month: MonthKey;
  budget: number;
  spent: number;
  remaining: number;
  dayOfMonth: number;
  daysLeft: number;
  days: number;
  variance: number;
  status: SpendingStatus;
  dailyAllowance: number;
  bigNights: SpendEntry[];
  typicalBigNight: number;
  ranOutOnDay?: number;
  forecast: Forecast;
  shape: SpendingAnalysis['shape'];
  affordableBigNights: number;
  noSpendDaysToRecover: number;
  weekendNightsLeft: number;
  hasLog: boolean;
  fundName?: string;
  fundBalance: number;
}): Tip[] {
  const tips: Tip[] = [];
  if (c.dayOfMonth === 0 || c.budget <= 0) return tips;
  const f = c.forecast;

  // An early big night is the commonest cause of false panic.
  const earlyBigNight = c.bigNights.find((s) => dayOf(s.date) <= 10);
  if (earlyBigNight && c.remaining > 0) {
    const share = Math.round((earlyBigNight.amount / c.budget) * 100);
    tips.push({
      id: 'early-big-night',
      tone: 'neutral',
      title: `That ${gbp(earlyBigNight.amount)} night is ${share}% of the month, not a write-off`,
      body: `Spending it on the ${formatDayOfMonth(c.month, dayOf(earlyBigNight.date))} makes the pace bar look alarming, because the pace bar assumes you spend evenly and nobody does. On how the rest of your month usually goes, you finish inside the budget ${pc(
        f.probabilityWithinBudget,
      )} of the time. What is left covers ${shapePhrase(c.shape, f.typicalSpendDay)}.`,
    });
  }

  if (c.status === 'spent-up') {
    tips.push({
      id: 'spent-up',
      tone: 'bad',
      title: c.ranOutOnDay
        ? `Budget gone on the ${formatDayOfMonth(c.month, c.ranOutOnDay)}, ${c.daysLeft} days left`
        : `Budget gone, ${c.daysLeft} days left`,
      body: `You are ${gbp(Math.abs(c.remaining))} past the ${gbp(
        c.budget,
      )} budget. This is what the debt and spillover line is for — it absorbs the hit. Do not take it out of savings, and do not slash next month to make up for it; that is the boom-bust cycle. Anything you do not spend from here reduces the damage pound for pound.`,
    });
    if (c.daysLeft > 0) {
      tips.push({
        id: 'damage-forecast',
        tone: 'warn',
        title: `A normal rest-of-month adds about ${gbp(Math.max(0, f.median - c.spent))} more`,
        body: `That would finish at ${gbp(f.median)} — ${gbp(
          Math.max(0, f.median - c.budget),
        )} over. A quiet run of days finishes at ${gbp(f.low)} and a heavy one at ${gbp(
          f.high,
        )}, so the difference between now and month end is still ${gbp(
          Math.max(0, f.high - f.low),
        )} of your own choosing.`,
      });
    }
    if (c.fundName && c.fundBalance > 0) {
      tips.push({
        id: 'fund-draw',
        tone: 'neutral',
        title: `Only raid ${c.fundName} if this was an emergency, not a heavy month`,
        body: `It holds ${gbp(
          c.fundBalance,
        )}. A planned, capped draw for something genuinely unexpected is a decision. Topping up a social month from it is the unplanned raid that undoes the plan — take that on the debt line instead.`,
      });
    }
  }

  // The peace-of-mind number, phrased as odds rather than a verdict.
  if (c.remaining > 0 && c.daysLeft > 0 && !f.thin) {
    const good = f.probabilityWithinBudget >= 0.7;
    tips.push({
      id: 'odds',
      tone: good ? 'good' : f.probabilityWithinBudget >= 0.4 ? 'warn' : 'bad',
      title: good
        ? `${pc(f.probabilityWithinBudget)} chance you finish inside the budget`
        : `Only a ${pc(f.probabilityWithinBudget)} chance of finishing inside the budget as things stand`,
      body: good
        ? `Running the rest of the month a couple of thousand times using your own mix of quiet days and spend days, you land around ${gbp(
            f.median,
          )} — most often between ${gbp(f.low)} and ${gbp(f.high)}. Nothing needs fixing.`
        : `Your own mix of days lands around ${gbp(f.median)}, and even a quiet run comes in at ${gbp(
            f.low,
          )}. Dropping ${
            c.affordableBigNights === 0 ? 'the next night out' : 'one night out'
          } is worth about ${gbp(c.typicalBigNight)} of that gap — more than trimming everyday spending would give you.`,
    });
  }

  // What the money actually buys, in the shape a month takes.
  if (c.remaining > 0 && c.daysLeft > 0) {
    tips.push({
      id: 'shape',
      tone: 'neutral',
      title: `${gbp(c.remaining)} left covers ${shapePhrase(c.shape, f.typicalSpendDay)}`,
      body: `That is the rest of the month in the shape yours normally takes — ${pc(
        f.quietDayShare,
      )} of your days cost nothing at all, and the ones that do cost ${gbp(
        f.typicalSpendDay,
      )} typically${f.biggestDay > 0 ? `, with your biggest day so far at ${gbp(f.biggestDay)}` : ''}. ${
        c.weekendNightsLeft > 0
          ? `There are ${c.weekendNightsLeft} Friday and Saturday nights left, so decide which ${
              c.shape.bigNights === 0 ? 'ones stay cheap' : `${c.shape.bigNights} of them are the big ones`
            } while it is still a choice.`
          : ''
      }`,
    });
  }

  if (c.status === 'over-pace' && c.remaining > 0 && f.probabilityWithinBudget < 0.7) {
    tips.push({
      id: 'over-pace',
      tone: 'warn',
      title: `${gbp(c.dailyAllowance)} a day average from here keeps you inside`,
      body: `You are ${gbp(c.variance)} ahead of the straight line with ${
        c.daysLeft
      } days to go. Averages are not how you spend, so in practice that means ${shapePhrase(
        c.shape,
        f.typicalSpendDay,
      )}.${
        c.noSpendDaysToRecover > 0
          ? ` ${c.noSpendDaysToRecover} no-spend day${
              c.noSpendDaysToRecover > 1 ? 's' : ''
            } would put you back on the line, after which nothing else has to change.`
          : ''
      }`,
    });
  }

  if (f.likelyRunOutDay !== undefined && c.remaining > 0 && f.probabilityRunOut >= 0.25) {
    tips.push({
      id: 'run-out',
      tone: f.probabilityRunOut > 0.6 ? 'bad' : 'warn',
      title: `If it does run out, most likely around the ${formatDayOfMonth(c.month, f.likelyRunOutDay)}`,
      body: `That happens in ${pc(
        f.probabilityRunOut,
      )} of runs — it is a risk, not a forecast. Skipping one night out moves that date back by roughly ${Math.max(
        1,
        Math.round(c.typicalBigNight / Math.max(1, c.dailyAllowance)),
      )} days.`,
    });
  }

  if (c.status !== 'spent-up' && (c.status === 'under-pace' || c.status === 'on-pace') && f.thin) {
    tips.push({
      id: 'thin-evidence',
      tone: 'neutral',
      title: 'Early days — treat the range as a sketch',
      body: `There ${f.sampleSize === 1 ? 'is' : 'are'} only ${f.sampleSize} day${
        f.sampleSize === 1 ? '' : 's'
      } of history to work from${
        f.usedPriorMonths ? ', including earlier months' : ''
      }. The figure worth trusting today is the simple one: ${gbp(c.remaining)} left across ${
        c.daysLeft
      } days. The range sharpens up as the month fills in.`,
    });
  }

  if (!c.hasLog) {
    tips.push({
      id: 'log-it',
      tone: 'neutral',
      title: 'Log spends as they happen for a real forecast',
      body: 'With a single running total there are no individual days to learn from, so the forecast has to assume you spend evenly. Log spends — or import a Monzo CSV — and the range starts reflecting how your months actually go.',
    });
  }

  return tips.slice(0, 4);
}

/**
 * Month-to-date spending analysis for the guilt-free budget.
 *
 * The point of this module is to answer the question that actually causes stress:
 * "I spent £100 on the first Saturday — am I in trouble?" A naive daily average says
 * yes and panics you. So spending is split into everyday spending and big nights, and
 * two honest projections are offered instead of one misleading one.
 */
import { round2 } from './engine';
import type { MonthKey, SpendEntry } from './types';

export type SpendingStatus =
  | 'not-started'
  | 'under-pace'
  | 'on-pace'
  | 'over-pace'
  | 'spent-up';

export interface Projection {
  /** Pounds per day this projection assumes from today onwards. */
  rate: number;
  /** Day of the month the budget hits zero, if it does before the month ends. */
  runOutDay?: number;
  /** Total spend by the last day of the month at this rate. */
  endOfMonthTotal: number;
  /** Positive when this projection ends the month over budget. */
  overspend: number;
}

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
  /** Everyday spending only, per day elapsed. */
  everydayRate: number;
  everydaySpent: number;
  bigNights: SpendEntry[];
  typicalBigNight: number;
  /** The day the budget was used up, when it already has been. */
  ranOutOnDay?: number;
  /** Everyday spending only, no more big nights. The realistic baseline. */
  projectionEveryday: Projection;
  /** Everyday spending plus a big night on every Friday and Saturday left. The ceiling. */
  projectionEveryWeekend: Projection;
  /** More nights out of a typical size that still fit inside what is left. */
  affordableBigNights: number;
  /** Consecutive no-spend days needed to get back to the straight line. */
  noSpendDaysToRecover: number;
  /** Friday and Saturday nights still to come this month. */
  weekendNightsLeft: number;
  /** Cumulative spend by day, for the burn-down chart. */
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
    day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return `${date.toLocaleDateString('en-GB', { weekday: 'short' })} ${day}${suffix}`;
}

function project(spent: number, budget: number, rate: number, dayOfMonth: number, days: number): Projection {
  const daysLeft = Math.max(0, days - dayOfMonth);
  const endOfMonthTotal = round2(spent + rate * daysLeft);
  const remaining = budget - spent;
  let runOutDay: number | undefined;
  if (rate > 0 && remaining > 0) {
    const day = dayOfMonth + remaining / rate;
    if (day <= days) runOutDay = Math.floor(day);
  }
  return {
    rate: round2(rate),
    runOutDay,
    endOfMonthTotal,
    overspend: round2(Math.max(0, endOfMonthTotal - budget)),
  };
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
}: {
  month: MonthKey;
  budget: number;
  spends: SpendEntry[];
  /** The single "spent so far" figure, used when nothing has been logged. */
  fallbackTotal?: number;
  bigNightThreshold?: number;
  now?: Date;
  fundName?: string;
  fundBalance?: number;
}): SpendingAnalysis {
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

  const bigNights = logged.filter((s) => s.amount >= bigNightThreshold);
  const everydaySpent = round2(loggedTotal - bigNights.reduce((a, s) => a + s.amount, 0));
  const typicalBigNight = bigNights.length
    ? round2(bigNights.reduce((a, s) => a + s.amount, 0) / bigNights.length)
    : bigNightThreshold;

  const elapsed = Math.max(1, dayOfMonth);
  // With nothing logged, everyday spending cannot be separated out — treat it all as everyday.
  const everydayRate = logged.length > 0 ? round2(everydaySpent / elapsed) : round2(spent / elapsed);

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

  const projectionEveryday = project(spent, budget, everydayRate, dayOfMonth, days);
  // The ceiling: everyday spending, plus a night out on every Friday and Saturday left.
  // Expressed as a daily rate so it shares the projection maths.
  const weekendNightsLeftCount = weekendNightsAfter(month, dayOfMonth);
  const weekendLoad = weekendNightsLeftCount * typicalBigNight;
  const projectionEveryWeekend = project(
    spent,
    budget,
    daysLeft > 0 ? everydayRate + weekendLoad / daysLeft : everydayRate,
    dayOfMonth,
    days,
  );

  const affordableBigNights = Math.max(0, Math.floor(Math.max(0, remaining) / Math.max(1, typicalBigNight)));
  const noSpendDaysToRecover =
    budget > 0 && variance > 0 ? Math.max(0, Math.ceil((spent * days) / budget - dayOfMonth)) : 0;
  const weekendNightsLeft = weekendNightsLeftCount;

  const cumulativeByDay: SpendingAnalysis['cumulativeByDay'] = [];
  let running = 0;
  for (let d = 1; d <= days; d++) {
    running += logged.filter((s) => dayOf(s.date) === d).reduce((a, s) => a + s.amount, 0);
    cumulativeByDay.push({
      day: d,
      // Only draw the actual line up to today.
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
    everydayRate,
    bigNights,
    bigNightThreshold,
    typicalBigNight,
    ranOutOnDay,
    projectionEveryday,
    projectionEveryWeekend,
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
    everydayRate,
    everydaySpent,
    bigNights,
    typicalBigNight,
    ranOutOnDay,
    projectionEveryday,
    projectionEveryWeekend,
    affordableBigNights,
    noSpendDaysToRecover,
    weekendNightsLeft,
    cumulativeByDay,
    tips,
  };
}

const gbp = (n: number) => `£${n.toFixed(n % 1 === 0 ? 0 : 2)}`;

/**
 * Concrete, arithmetic-backed suggestions. Every one names a number you can act on;
 * none of them tell you off.
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
  everydayRate: number;
  bigNights: SpendEntry[];
  bigNightThreshold: number;
  typicalBigNight: number;
  ranOutOnDay?: number;
  /** Everyday spending only, no more big nights. The realistic baseline. */
  projectionEveryday: Projection;
  /** Everyday spending plus a big night on every Friday and Saturday left. The ceiling. */
  projectionEveryWeekend: Projection;
  affordableBigNights: number;
  noSpendDaysToRecover: number;
  weekendNightsLeft: number;
  hasLog: boolean;
  fundName?: string;
  fundBalance: number;
}): Tip[] {
  const tips: Tip[] = [];
  if (c.dayOfMonth === 0 || c.budget <= 0) return tips;

  // An early big night is the single most common cause of false panic.
  const earlyBigNight = c.bigNights.find((s) => dayOf(s.date) <= 10);
  if (earlyBigNight && c.remaining > 0) {
    const share = Math.round((earlyBigNight.amount / c.budget) * 100);
    tips.push({
      id: 'early-big-night',
      tone: 'neutral',
      title: `That ${gbp(earlyBigNight.amount)} night is ${share}% of the month, not a write-off`,
      body: `Spending it on the ${formatDayOfMonth(c.month, dayOf(earlyBigNight.date))} makes the pace bar look alarming, because the pace bar assumes you spend evenly and nobody does. What actually matters: ${gbp(
        c.remaining,
      )} left across ${c.daysLeft} days, which is ${gbp(c.dailyAllowance)} a day. Your everyday spending is running at ${gbp(
        c.everydayRate,
      )} a day, so the budget holds if you have ${c.affordableBigNights === 0 ? 'no more big nights' : `at most ${c.affordableBigNights} more like it`}.`,
    });
  }

  if (c.status === 'spent-up') {
    tips.push({
      id: 'spent-up',
      tone: 'bad',
      title: c.ranOutOnDay
        ? `Budget gone on the ${formatDayOfMonth(c.month, c.ranOutOnDay)}, ${c.daysLeft} days left`
        : `Budget gone, ${c.daysLeft} days left`,
      body: `You are ${gbp(Math.abs(c.remaining))} past the ${gbp(c.budget)} budget. This is what the debt and spillover line is for — it absorbs the hit. Do not take it out of savings, and do not slash next month to make up for it; that is the boom-bust cycle. Anything you do not spend from here reduces the damage pound for pound.`,
    });
    if (c.daysLeft > 0) {
      tips.push({
        id: 'damage-forecast',
        tone: 'warn',
        title: `Everyday spending alone still adds ${gbp(c.projectionEveryday.endOfMonthTotal - c.spent)} before month end`,
        body: `That finishes at ${gbp(c.projectionEveryday.endOfMonthTotal)}, ${gbp(
          c.projectionEveryday.overspend,
        )} over. Going out on all ${c.weekendNightsLeft} remaining Friday and Saturday nights would finish at ${gbp(
          c.projectionEveryWeekend.endOfMonthTotal,
        )} instead — the gap between those two numbers, ${gbp(
          Math.max(0, c.projectionEveryWeekend.endOfMonthTotal - c.projectionEveryday.endOfMonthTotal),
        )}, is entirely within your control.`,
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

  if (c.status === 'over-pace') {
    tips.push({
      id: 'over-pace',
      tone: 'warn',
      title: `${gbp(c.dailyAllowance)} a day from here keeps you inside the budget`,
      body: `You are ${gbp(c.variance)} ahead of the straight line with ${c.daysLeft} days to go. Everyday spending is running at ${gbp(
        c.everydayRate,
      )} a day, so ${
        c.everydayRate <= c.dailyAllowance
          ? 'the everyday stuff is not the problem — the nights out are'
          : `that needs to come down by ${gbp(c.everydayRate - c.dailyAllowance)} a day`
      }.${
        c.noSpendDaysToRecover > 0
          ? ` Alternatively, ${c.noSpendDaysToRecover} no-spend day${c.noSpendDaysToRecover > 1 ? 's' : ''} put you back on the line and you carry on as normal after that.`
          : ''
      }`,
    });
    if (c.projectionEveryday.runOutDay) {
      tips.push({
        id: 'run-out-warning',
        tone: 'bad',
        title: `Even with no more nights out the money runs out on the ${formatDayOfMonth(c.month, c.projectionEveryday.runOutDay)}`,
        body: `Everyday spending alone is running at ${gbp(c.everydayRate)} a day, which leaves ${
          c.days - c.projectionEveryday.runOutDay
        } day${c.days - c.projectionEveryday.runOutDay === 1 ? '' : 's'} of the month unfunded. This is not a nights-out problem — the day-to-day rate is the thing to cut.`,
      });
    } else if (c.projectionEveryWeekend.runOutDay) {
      tips.push({
        id: 'run-out-ceiling',
        tone: 'warn',
        title: `Going out every remaining weekend would empty it by the ${formatDayOfMonth(c.month, c.projectionEveryWeekend.runOutDay)}`,
        body: `That is the ceiling, not the forecast: ${c.weekendNightsLeft} more night${
          c.weekendNightsLeft === 1 ? '' : 's'
        } at ${gbp(c.typicalBigNight)}. Everyday spending on its own sees the month out with ${gbp(
          Math.max(0, c.budget - c.projectionEveryday.endOfMonthTotal),
        )} spare, so the question is simply how many of those ${c.weekendNightsLeft} nights are big ones — ${
          c.affordableBigNights
        } fit inside the budget.`,
      });
    }
  }

  if (c.weekendNightsLeft > 0 && c.remaining > 0) {
    const perWeekend = round2(
      Math.max(0, c.remaining - c.everydayRate * c.daysLeft) / c.weekendNightsLeft,
    );
    tips.push({
      id: 'weekend-plan',
      tone: perWeekend >= c.typicalBigNight ? 'good' : 'neutral',
      title: `${c.weekendNightsLeft} Friday/Saturday night${c.weekendNightsLeft > 1 ? 's' : ''} left, ${gbp(perWeekend)} each`,
      body: `After covering everyday spending at ${gbp(c.everydayRate)} a day for the rest of the month, ${gbp(
        Math.max(0, c.remaining - c.everydayRate * c.daysLeft),
      )} is free for going out. Split evenly that is ${gbp(perWeekend)} a night${
        perWeekend < c.typicalBigNight
          ? `, against the ${gbp(c.typicalBigNight)} a night out usually costs you. Decide now which of those nights is the big one and which are cheap — that choice made on a Tuesday is a plan, made at 9pm on Saturday it is a regret.`
          : `, comfortably above the ${gbp(c.typicalBigNight)} they usually cost.`
      }`,
    });
  }

  if (c.status === 'under-pace' || c.status === 'on-pace') {
    tips.push({
      id: 'on-track',
      tone: 'good',
      title:
        c.affordableBigNights > 0
          ? `On track — room for ${c.affordableBigNights} more night${c.affordableBigNights > 1 ? 's' : ''} out`
          : 'On track',
      body: `${gbp(c.remaining)} left over ${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'} (${gbp(
        c.dailyAllowance,
      )} a day)${
        c.variance < 0 ? `, and you are ${gbp(Math.abs(c.variance))} under the straight line` : ''
      }. Carrying on at your everyday rate finishes the month at ${gbp(
        c.projectionEveryday.endOfMonthTotal,
      )}. Nothing to fix — the budget is there to be spent.`,
    });
  }

  if (!c.hasLog) {
    tips.push({
      id: 'log-it',
      tone: 'neutral',
      title: 'Log spends as they happen for a real run-out date',
      body: 'With a single running total the projection has to assume you spend evenly. Once individual spends are logged, big nights are separated from everyday spending and the two forecasts below stop being guesses.',
    });
  }

  return tips.slice(0, 4);
}

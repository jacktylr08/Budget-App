import { describe, expect, it } from 'vitest';
import { analyseSpending, formatDayOfMonth } from './spending';
import type { SpendEntry } from './types';

const spend = (date: string, amount: number, note = ''): SpendEntry => ({
  id: date + amount,
  date,
  amount,
  note,
});

// August 2026 has 31 days and starts on a Saturday.
const AUG = '2026-08';
const on = (day: number) => new Date(2026, 7, day, 12);

const analyse = (spends: SpendEntry[], day: number, budget = 575) =>
  analyseSpending({ month: AUG, budget, spends, now: on(day), bigNightThreshold: 50 });

describe('the early big night', () => {
  // £100 on the first Saturday, then nothing.
  const a = analyse([spend('2026-08-01', 100)], 5);

  it('does not claim the money runs out early', () => {
    // A naive £100/5 days = £20/day average would predict running out on the 28th.
    // Only 1 of the 5 days had any spending, so a resampled month rarely repeats it.
    expect(a.forecast.median).toBeLessThan(575);
    expect(a.forecast.probabilityWithinBudget).toBeGreaterThan(0.5);
  });

  it('gives a range rather than a single number', () => {
    expect(a.forecast.low).toBeLessThanOrEqual(a.forecast.median);
    expect(a.forecast.median).toBeLessThanOrEqual(a.forecast.high);
    expect(a.weekendNightsLeft).toBe(8);
  });

  it('separates the big night from everyday spending', () => {
    expect(a.bigNights).toHaveLength(1);
    expect(a.everydaySpent).toBe(0);
    expect(a.spendDays).toBe(0);
  });

  it('reports what is left per day and how many more nights fit', () => {
    expect(a.remaining).toBe(475);
    expect(a.daysLeft).toBe(26);
    expect(a.dailyAllowance).toBe(18.27);
    expect(a.affordableBigNights).toBe(4); // 475 / 100
  });

  it('leads with a tip that reframes rather than alarms', () => {
    expect(a.tips[0].id).toBe('early-big-night');
    expect(a.tips[0].tone).not.toBe('bad');
    expect(a.tips[0].title).toContain('17% of the month');
  });
});

describe('steady overspending', () => {
  // £30 a day for 10 days: no big nights, just a high everyday rate.
  const spends = Array.from({ length: 10 }, (_, i) =>
    spend(`2026-08-${String(i + 1).padStart(2, '0')}`, 30),
  );
  const a = analyse(spends, 10);

  it('is near certain to blow the budget, and says when', () => {
    // £300 spent by day 10 and every single day has cost £30.
    expect(a.forecast.probabilityWithinBudget).toBe(0);
    expect(a.forecast.likelyRunOutDay).toBe(20);
    expect(a.tips.some((t) => t.id === 'run-out')).toBe(true);
  });

  it('flags it as over pace and quantifies the cut needed', () => {
    expect(a.status).toBe('over-pace');
    expect(a.dailyAllowance).toBe(13.1);
    expect(a.tips.some((t) => t.id === 'over-pace')).toBe(true);
    expect(a.tips.find((t) => t.id === 'over-pace')!.title).toContain('£13.10');
    expect(a.tips.find((t) => t.id === 'over-pace')!.body).toMatch(/Averages are not how you spend/);
  });

  it('says how many no-spend days recover the pace line', () => {
    // 300 spent = the straight-line position of day 16.2, so 7 days of nothing.
    expect(a.noSpendDaysToRecover).toBe(7);
  });
});

describe('budget already gone', () => {
  const a = analyse(
    [spend('2026-08-02', 200), spend('2026-08-09', 200), spend('2026-08-16', 200)],
    20,
  );

  it('reports the day it ran out', () => {
    expect(a.status).toBe('spent-up');
    expect(a.ranOutOnDay).toBe(16);
    expect(a.remaining).toBe(-25);
  });

  it('points the damage at the debt line, not savings', () => {
    const tip = a.tips.find((t) => t.id === 'spent-up')!;
    expect(tip.body).toMatch(/debt and spillover line/i);
    expect(tip.body).toMatch(/not take it out of savings/i);
    expect(tip.body).toMatch(/boom-bust/i);
  });

  it('offers a fund draw only as an emergency, when a fund exists', () => {
    const withFund = analyseSpending({
      month: AUG,
      budget: 575,
      spends: [spend('2026-08-02', 600)],
      now: on(20),
      fundName: 'Emergency / Car Fund',
      fundBalance: 750,
    });
    const tip = withFund.tips.find((t) => t.id === 'fund-draw')!;
    expect(tip.body).toMatch(/unplanned raid/i);
    expect(a.tips.some((t) => t.id === 'fund-draw')).toBe(false);
  });
});

describe('on track', () => {
  const a = analyse([spend('2026-08-03', 40), spend('2026-08-08', 35)], 12);

  it('says so without inventing a problem', () => {
    expect(a.status).toBe('under-pace');
    expect(a.tips.some((t) => t.tone === 'bad' || t.tone === 'warn')).toBe(false);
    expect(a.tips.find((t) => t.id === 'odds')!.title).toMatch(/chance you finish inside the budget/i);
    expect(a.tips.find((t) => t.id === 'odds')!.body).toMatch(/Nothing needs fixing/i);
  });
});

describe('weekend awareness', () => {
  it('counts Fridays and Saturdays left and splits the free money across them', () => {
    // From the 12th, August 2026 has Fri/Sat on 14,15,21,22,28,29.
    const a = analyse([spend('2026-08-03', 40)], 12);
    expect(a.weekendNightsLeft).toBe(6);
    const shapeTip = a.tips.find((t) => t.id === 'shape')!;
    expect(shapeTip.body).toMatch(/6 Friday and Saturday nights left/);
    // Never offers more nights out than there are weekends to have them on.
    expect(a.shape.bigNights).toBeLessThanOrEqual(a.weekendNightsLeft);
  });
});

describe('inputs and edges', () => {
  it('falls back to the running total when nothing is logged', () => {
    const a = analyseSpending({ month: AUG, budget: 575, spends: [], fallbackTotal: 200, now: on(10) });
    expect(a.spent).toBe(200);
    expect(a.tips.some((t) => t.id === 'log-it')).toBe(true);
  });

  it('gives a future month no projections and no tips', () => {
    const a = analyseSpending({ month: '2026-12', budget: 575, spends: [], now: on(10) });
    expect(a.dayOfMonth).toBe(0);
    expect(a.status).toBe('not-started');
    expect(a.tips).toEqual([]);
  });

  it('treats a past month as complete', () => {
    const a = analyseSpending({
      month: '2026-06',
      budget: 575,
      spends: [spend('2026-06-04', 500)],
      now: on(10),
    });
    expect(a.dayOfMonth).toBe(30);
    expect(a.daysLeft).toBe(0);
    expect(a.dailyAllowance).toBe(0);
  });

  it('never divides by zero on the first day of the month', () => {
    const a = analyse([spend('2026-08-01', 100)], 1);
    expect(Number.isFinite(a.dailyAllowance)).toBe(true);
    expect(Number.isFinite(a.forecast.median)).toBe(true);
  });

  it('builds a cumulative series that stops at today', () => {
    const a = analyse([spend('2026-08-02', 50), spend('2026-08-05', 25)], 6);
    expect(a.cumulativeByDay).toHaveLength(31);
    expect(a.cumulativeByDay[5].spent).toBe(75); // day 6
    expect(a.cumulativeByDay[6].spent).toBeNull(); // day 7, not yet
    expect(a.cumulativeByDay[30].budgetLine).toBe(575);
  });

  it('caps the tips so the card never becomes a lecture', () => {
    expect(analyse([spend('2026-08-01', 300), spend('2026-08-02', 200)], 6).tips.length).toBeLessThanOrEqual(4);
  });

  it('formats a day with its weekday and ordinal', () => {
    expect(formatDayOfMonth(AUG, 1)).toBe('Sat 1st');
    expect(formatDayOfMonth(AUG, 22)).toBe('Sat 22nd');
    expect(formatDayOfMonth(AUG, 3)).toBe('Mon 3rd');
    expect(formatDayOfMonth(AUG, 11)).toBe('Tue 11th');
  });
});

describe('lumpy spending, not a flat daily rate', () => {
  // Spends on 4 of 12 days, nothing on the other 8 — the normal shape of a month.
  const spends = [
    spend('2026-08-02', 18),
    spend('2026-08-05', 22),
    spend('2026-08-08', 15),
    spend('2026-08-11', 25),
  ];
  const a = analyse(spends, 12);

  it('measures how often you spend, not a rate per calendar day', () => {
    expect(a.spendDays).toBe(4);
    expect(a.noSpendDays).toBe(8);
    expect(a.typicalSpendDay).toBe(20); // median of 15, 18, 22, 25
    expect(a.forecast.quietDayShare).toBeCloseTo(2 / 3, 1);
  });

  it('describes what is left as days, not as a rate', () => {
    // One day in three across the 19 days left: about 6 spend days and 13 quiet ones.
    expect(a.shape.spendDays).toBe(6);
    expect(a.shape.quietDays).toBe(13);
    expect(a.forecast.quietDayShare).toBeCloseTo(0.67, 1);
  });

  it('describes the pattern in the tips instead of a fictional daily figure', () => {
    const text = a.tips.map((x) => `${x.title} ${x.body}`).join(' ');
    expect(text).toMatch(/quiet days/);
    expect(text).toMatch(/days at around £20/);
  });

  it('warns that a short history is only a sketch', () => {
    const early = analyse([spend('2026-08-02', 18)], 3);
    expect(early.forecast.thin).toBe(true);
    expect(early.tips.some((x) => x.id === 'thin-evidence')).toBe(true);
  });

  it('stops calling it thin once a pattern has actually formed', () => {
    expect(a.forecast.thin).toBe(false);
    expect(a.tips.some((x) => x.id === 'thin-evidence')).toBe(false);
  });

  it('counts a no-spend day as a no-spend day, not an average', () => {
    // Nothing at all since the 11th, so quiet days now dominate the sample.
    const later = analyse(spends, 20);
    expect(later.spendDays).toBe(4);
    expect(later.noSpendDays).toBe(16);
    expect(later.forecast.quietDayShare).toBeCloseTo(0.8, 1);
  });
});

describe('a night out spread across several transactions', () => {
  // Bar, taxi and food on one Saturday: six small payments, one big night.
  const night = [
    spend('2026-08-01', 24, 'Bar'),
    spend('2026-08-01', 31.5, 'Bar'),
    spend('2026-08-01', 18, 'Taxi'),
    spend('2026-08-01', 12, 'Kebab'),
    spend('2026-08-01', 19, 'Round'),
  ];
  const a = analyse([...night, spend('2026-08-03', 9)], 5);

  it('classifies the day, not the individual payments', () => {
    expect(a.bigNights).toHaveLength(1);
    expect(a.bigNights[0].amount).toBe(104.5);
    expect(a.bigNights[0].note).toContain('Taxi');
  });

  it('keeps that day out of the everyday pattern', () => {
    expect(a.everydaySpent).toBe(9);
    expect(a.spendDays).toBe(1);
    expect(a.typicalSpendDay).toBe(9);
  });

  it('reaches the same conclusion as logging it as one entry', () => {
    const single = analyse([spend('2026-08-01', 104.5), spend('2026-08-03', 9)], 5);
    expect(a.bigNights[0].amount).toBe(single.bigNights[0].amount);
    expect(a.everydaySpent).toBe(single.everydaySpent);
    expect(a.forecast.median).toBe(single.forecast.median);
  });
});

describe('spends dated later in the month', () => {
  // A CSV import can carry a transaction dated after today.
  const a = analyse([spend('2026-08-02', 12), spend('2026-08-06', 14)], 2);

  it('counts the money but keeps it out of the pattern', () => {
    expect(a.spent).toBe(26);
    expect(a.spendDays).toBe(1);
    expect(a.typicalSpendDay).toBe(12);
  });

  it('never claims you spend on more days than have happened', () => {
    expect(a.spendDays).toBeLessThanOrEqual(a.dayOfMonth);
    expect(a.forecast.quietDayShare).toBeGreaterThanOrEqual(0);
  });
});

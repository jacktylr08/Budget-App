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
    // Everyday spending is actually zero, so the realistic projection never runs out.
    expect(a.projectionEveryday.runOutDay).toBeUndefined();
    expect(a.projectionEveryday.endOfMonthTotal).toBe(100);
  });

  it('still shows the ceiling if every remaining weekend were a big night', () => {
    // 8 Fri/Sat nights left in August 2026 from the 5th, at £100 each, on £475 left.
    expect(a.weekendNightsLeft).toBe(8);
    expect(a.projectionEveryWeekend.runOutDay).toBeDefined();
    expect(a.projectionEveryWeekend.endOfMonthTotal).toBe(900);
  });

  it('separates the big night from everyday spending', () => {
    expect(a.bigNights).toHaveLength(1);
    expect(a.everydaySpent).toBe(0);
    expect(a.everydayRate).toBe(0);
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

  it('projects a run-out date before the month ends', () => {
    // £300 spent, £275 left, £30/day of everyday spending -> day 19.
    expect(a.projectionEveryday.runOutDay).toBe(19);
    expect(a.tips.some((t) => t.id === 'run-out-warning')).toBe(true);
  });

  it('flags it as over pace and quantifies the cut needed', () => {
    expect(a.status).toBe('over-pace');
    expect(a.dailyAllowance).toBe(13.1);
    expect(a.tips.some((t) => t.id === 'over-pace')).toBe(true);
    expect(a.tips.find((t) => t.id === 'over-pace')!.title).toContain('£13.10');
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
    expect(a.tips.find((t) => t.id === 'on-track')!.body).toMatch(/budget is there to be spent/i);
  });
});

describe('weekend awareness', () => {
  it('counts Fridays and Saturdays left and splits the free money across them', () => {
    // From the 12th, August 2026 has Fri/Sat on 14,15,21,22,28,29.
    const a = analyse([spend('2026-08-03', 40)], 12);
    expect(a.weekendNightsLeft).toBe(6);
    expect(a.tips.some((t) => t.id === 'weekend-plan')).toBe(true);
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
    expect(Number.isFinite(a.everydayRate)).toBe(true);
    expect(Number.isFinite(a.dailyAllowance)).toBe(true);
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

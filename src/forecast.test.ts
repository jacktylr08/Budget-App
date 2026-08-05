import { describe, expect, it } from 'vitest';
import { affordableShape, forecastMonth, observeDays } from './forecast';
import type { SpendEntry } from './types';

const spend = (date: string, amount: number): SpendEntry => ({ id: date + amount, date, amount });

const AUG = '2026-08';
const run = (spends: SpendEntry[], dayOfMonth: number, spent: number, budget = 575) =>
  forecastMonth({
    month: AUG,
    budget,
    spent,
    dayOfMonth,
    daysInMonth: 31,
    observations: observeDays(AUG, spends, dayOfMonth),
  });

describe('observing days', () => {
  it('records the days you spent nothing, which are most of them', () => {
    const days = observeDays(AUG, [spend('2026-08-03', 20)], 5);
    expect(days.map((d) => d.amount)).toEqual([0, 0, 20, 0, 0]);
  });

  it('marks Fridays and Saturdays', () => {
    // 1 Aug 2026 is a Saturday, so 7 and 8 are Friday and Saturday.
    expect(observeDays(AUG, [], 8).map((d) => d.isWeekend)).toEqual([
      true, false, false, false, false, false, true, true,
    ]);
  });

  it('ignores spends dated after the day asked for', () => {
    expect(observeDays(AUG, [spend('2026-08-20', 50)], 5).every((d) => d.amount === 0)).toBe(true);
  });
});

describe('forecasting from your own days', () => {
  // 14 days: 10 quiet, 4 at about £20. A normal shape.
  const spends = [
    spend('2026-08-02', 18),
    spend('2026-08-05', 22),
    spend('2026-08-08', 15),
    spend('2026-08-11', 25),
  ];
  const f = run(spends, 14, 80);

  it('produces a range, not a single number', () => {
    expect(f.low).toBeLessThan(f.median);
    expect(f.median).toBeLessThan(f.high);
  });

  it('keeps the range plausible rather than catastrophic', () => {
    // Nothing in this history supports a £1,500 month.
    expect(f.high).toBeLessThan(300);
    expect(f.probabilityWithinBudget).toBe(1);
  });

  it('reports how the days actually fall', () => {
    expect(f.quietDayShare).toBeCloseTo(10 / 14, 2);
    expect(f.typicalSpendDay).toBe(20);
    expect(f.biggestDay).toBe(25);
  });

  it('is deterministic — the same inputs give the same forecast', () => {
    expect(run(spends, 14, 80)).toEqual(f);
  });

  it('draws a band for every remaining day, starting from today', () => {
    expect(f.bands[0]).toEqual({ day: 14, low: 80, mid: 80, high: 80 });
    expect(f.bands.at(-1)!.day).toBe(31);
    expect(f.bands.every((b) => b.low <= b.mid && b.mid <= b.high)).toBe(true);
  });
});

describe('a month that is going badly', () => {
  const heavy = Array.from({ length: 10 }, (_, i) =>
    spend(`2026-08-${String(i + 1).padStart(2, '0')}`, 45),
  );
  const f = run(heavy, 10, 450);

  it('gives poor odds and a likely run-out day', () => {
    expect(f.probabilityWithinBudget).toBeLessThan(0.1);
    expect(f.probabilityRunOut).toBeGreaterThan(0.9);
    expect(f.likelyRunOutDay).toBeGreaterThan(10);
    expect(f.likelyRunOutDay).toBeLessThanOrEqual(31);
  });
});

describe('not enough to go on', () => {
  it('flags a thin sample', () => {
    expect(run([spend('2026-08-01', 30)], 3, 30).thin).toBe(true);
  });

  it('borrows earlier months when this one is too young', () => {
    const f = forecastMonth({
      month: AUG,
      budget: 575,
      spent: 30,
      dayOfMonth: 3,
      daysInMonth: 31,
      observations: observeDays(AUG, [spend('2026-08-01', 30)], 3),
      priorObservations: observeDays('2026-07', [spend('2026-07-04', 25), spend('2026-07-19', 40)], 31),
    });
    expect(f.usedPriorMonths).toBe(true);
    expect(f.sampleSize).toBe(34);
    expect(f.thin).toBe(false);
  });

  it('says nothing rash with no history at all', () => {
    const f = forecastMonth({
      month: AUG, budget: 575, spent: 0, dayOfMonth: 0, daysInMonth: 31, observations: [],
    });
    expect(f.median).toBe(0);
    expect(f.bands).toEqual([]);
    expect(f.probabilityWithinBudget).toBe(1);
  });

  it('treats a finished month as settled', () => {
    const f = forecastMonth({
      month: AUG, budget: 575, spent: 600, dayOfMonth: 31, daysInMonth: 31,
      observations: observeDays(AUG, [spend('2026-08-02', 600)], 31),
    });
    expect(f.median).toBe(600);
    expect(f.probabilityWithinBudget).toBe(0);
  });
});

describe('what the money left buys', () => {
  it('is expressed in days, not a rate', () => {
    const shape = affordableShape(300, 20, 0.7, 20, 60, 6);
    expect(shape.spendDays).toBe(6);
    expect(shape.quietDays).toBe(14);
    expect(shape.bigNights).toBe(3); // (300 - 120) / 60
  });

  it('never offers more nights out than there are weekends left', () => {
    expect(affordableShape(1000, 20, 0.9, 10, 50, 2).bigNights).toBe(2);
  });

  it('offers nothing when the money is gone', () => {
    expect(affordableShape(-20, 10, 0.5, 20, 50, 4)).toEqual({
      spendDays: 0, bigNights: 0, quietDays: 10,
    });
  });
});

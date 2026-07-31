/**
 * Parity test: the engine must reproduce the Financial Plan workbook's own cached
 * values, cell for cell, from the seeded plan.
 */
import { describe, expect, it } from 'vitest';
import { computePlan, guiltFreePace, round2 } from './engine';
import { defaultState } from './defaults';
import type { AppState } from './types';

const state = defaultState();
const plan = computePlan(state);

// Values read straight out of Financial_Plan_v4_FINAL.xlsx (rows 14, 28, 36, 41, 44,
// 46, 50, 52, 53, 54, 55, 58, 59, 60 across columns B..L).
const NET = [2317.28, 1879.42, 2366.1, 1879.42, 2366.1, 1879.42, 2366.1, 1879.42, 2366.1, 1879.42, 2366.1];
const FIXED = [767.45, 727.45, 721.44, 721.44, 721.44, 721.44, 721.44, 721.44, 721.44, 721.44, 721.44];
const SAVINGS = [2661, 3011, 3410.55, 3833.53, 4543.19, 4976.17, 5695.83, 6103.81, 6823.47, 7281.45, 8226.11];
const HOLIDAY = [275, 0, 60, 120, 180, 280, 530, 655, 905, 1030, 1155];
const GIFT = [0, 50, 100, 150, 0, 0, 0, 0, 0, 0, 0];
const EMERGENCY = [0, 0, 150, 200, 450, 500, 600, 650, 750, 750, 750];
const AVAILABLE = [0, 16.97, 424.66, 22.98, 309.66, 32.98, 319.66, 7.98, 319.66, 57.98, 544.66];
const BC_PAYMENT = [0, 16.97, 375.11, 0, 0, 0, 0, 0, 0, 0, 0];
const BC_END = [392.08, 375.11, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const SPILLOVER = [0, 0, 49.55, 22.98, 309.66, 32.98, 319.66, 7.98, 319.66, 57.98, 544.66];
const NET_POSITION = [2543.92, 2685.89, 3720.55, 4303.53, 5173.19, 5756.17, 6825.83, 7408.81, 8478.47, 9061.45, 10131.11];

const col = (fn: (m: (typeof plan)[number]) => number) => plan.map(fn);
const fund = (id: string) => (m: (typeof plan)[number]) =>
  m.funds.find((f) => f.id === id)!.balance;
const debt = (id: string, key: 'payment' | 'endBalance') => (m: (typeof plan)[number]) =>
  m.debts.find((d) => d.id === id)![key];

describe('workbook parity', () => {
  it('produces 11 months starting August 2026', () => {
    expect(plan.map((m) => m.month)).toEqual([
      '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
      '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
    ]);
  });

  it.each([
    ['net take-home (row 14)', () => col((m) => m.net), NET],
    ['fixed cost subtotal (row 28)', () => col((m) => m.fixedTotal), FIXED],
    ['savings running total (row 36)', () => col((m) => m.savingsBalance), SAVINGS],
    ['holiday fund balance (row 41)', () => col(fund('holiday')), HOLIDAY],
    ['gift fund balance (row 44)', () => col(fund('gift')), GIFT],
    ['emergency fund balance (row 46)', () => col(fund('emergency')), EMERGENCY],
    ['available after allocations (row 52)', () => col((m) => m.available), AVAILABLE],
    ['barclaycard payment (row 53)', () => col(debt('barclaycard', 'payment')), BC_PAYMENT],
    ['barclaycard end balance (row 54)', () => col(debt('barclaycard', 'endBalance')), BC_END],
    ['spillover to savings (row 55)', () => col((m) => m.spillover), SPILLOVER],
    ['total allocated (row 58)', () => col((m) => m.totalAllocated), NET],
    ['net position (row 60)', () => col((m) => m.netPosition), NET_POSITION],
  ])('matches the workbook: %s', (_label, actual, expected) => {
    expect(actual()).toEqual(expected);
  });

  it('balances to zero every month (row 59)', () => {
    expect(col((m) => m.balanceCheck)).toEqual(Array(11).fill(0));
  });

  it('clears the overdraft in the first month (row 50)', () => {
    expect(col(debt('overdraft', 'endBalance'))).toEqual(Array(11).fill(0));
  });
});

describe('engine behaviour', () => {
  it('routes an income shortfall into the debt line, never savings', () => {
    const s: AppState = structuredClone(state);
    s.months['2026-10'].income.bonus = 0; // bonus fails to arrive
    const [oct] = computePlan(s, ['2026-08', '2026-09', '2026-10']).slice(-1);
    expect(oct.savingsContribution).toBe(350);
    expect(oct.available).toBeLessThan(0);
    expect(oct.debts.find((d) => d.id === 'barclaycard')!.payment).toBe(0);
    expect(oct.spillover).toBe(0);
  });

  it('caps a fund contribution at its target', () => {
    const s: AppState = structuredClone(state);
    s.months['2026-10'].fundIn.emergency = 5000;
    const oct = computePlan(s, ['2026-08', '2026-09', '2026-10']).at(-1)!;
    const ef = oct.funds.find((f) => f.id === 'emergency')!;
    expect(ef.appliedContribution).toBe(750);
    expect(ef.balance).toBe(750);
  });

  it('honours a payslip net-pay override', () => {
    const aug = plan[0];
    expect(aug.netIsOverride).toBe(true);
    expect(aug.net).toBe(2317.28);
    expect(aug.totalIn - aug.totalDeductions).not.toBe(2317.28);
  });

  it('never lets a debt payment exceed the balance owed', () => {
    for (const m of plan) {
      for (const d of m.debts) {
        expect(d.payment).toBeLessThanOrEqual(d.startBalance);
        expect(d.endBalance).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('tracks guilt-free pace against elapsed days', () => {
    const pace = guiltFreePace('2026-08', 575, 300, new Date(2026, 7, 15));
    expect(pace.daysInMonth).toBe(31);
    expect(pace.expected).toBe(round2((575 * 15) / 31));
    expect(pace.onTrack).toBe(false);
    expect(pace.remaining).toBe(275);
  });
});

/**
 * The calculation engine — a direct translation of the workbook's formulas.
 *
 * Workbook column -> engine field:
 *   NET TAKE-HOME          =SUM(gross:reimbursement)-SUM(tax:studentLoan)
 *   Subtotal Fixed Costs   =SUM(fixed lines)
 *   Savings Running Total  =prev + contribution + spillover
 *   Fund Balance           =prev + contribution - spent
 *   Debt start balance     =prev end balance
 *   Available              =net - fixed - oneOffs - guiltFree - savings - fundIn - manualDebt
 *   Debt payment           =MIN(startBalance, MAX(0, available))
 *   Debt end balance       =start - payment
 *   Spillover -> savings   =MAX(0, available - payments)
 *   Balance Check          =net - totalAllocated   (must be 0)
 *   Net Position           =savings + funds - debts
 */
import type {
  AppState,
  Config,
  DebtResult,
  FundResult,
  MonthEntry,
  MonthKey,
  MonthResult,
} from './types';

/** Money is rounded to pennies at every step so totals reconcile exactly. */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const sum = (xs: number[]): number => round2(xs.reduce((a, b) => a + b, 0));

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(start: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => addMonths(start, i));
}

export function monthLabel(month: MonthKey, long = false): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString('en-GB', {
    month: long ? 'long' : 'short',
    year: long ? 'numeric' : '2-digit',
    timeZone: 'UTC',
  });
}

export function currentMonthKey(now: Date = new Date()): MonthKey {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function emptyIncome(): MonthEntry['income'] {
  return {
    gross: 0,
    bonus: 0,
    reimbursement: 0,
    otherIncome: [],
    incomeTax: 0,
    nationalInsurance: 0,
    pension: 0,
    studentLoan: 0,
    otherDeductions: [],
    source: 'manual',
  };
}

export function emptyMonth(month: MonthKey): MonthEntry {
  return {
    month,
    income: emptyIncome(),
    fixedCosts: {},
    oneOffs: [],
    fundIn: {},
    fundOut: {},
    debtPayments: {},
  };
}

export function getMonth(state: AppState, month: MonthKey): MonthEntry {
  return state.months[month] ?? emptyMonth(month);
}

/** Net take-home for a month, honouring a payslip's own net-pay figure when present. */
export function computeNet(entry: MonthEntry): {
  totalIn: number;
  totalDeductions: number;
  net: number;
  netIsOverride: boolean;
} {
  const i = entry.income;
  const totalIn = sum([
    i.gross,
    i.bonus,
    i.reimbursement,
    ...i.otherIncome.map((o) => o.amount),
  ]);
  const totalDeductions = sum([
    i.incomeTax,
    i.nationalInsurance,
    i.pension,
    i.studentLoan,
    ...i.otherDeductions.map((o) => o.amount),
  ]);
  const computed = round2(totalIn - totalDeductions);
  const netIsOverride = i.netOverride !== undefined && i.netOverride !== null;
  return {
    totalIn,
    totalDeductions,
    net: netIsOverride ? round2(i.netOverride as number) : computed,
    netIsOverride,
  };
}

const activeFixed = (c: Config) => c.fixedCosts.filter((l) => !l.archived);
const activeFunds = (c: Config) => c.funds.filter((f) => !f.archived);
const activeDebts = (c: Config) =>
  c.debts.filter((d) => !d.archived).slice().sort((a, b) => a.priority - b.priority);

/**
 * Runs the whole plan, month by month. Each month's opening balances are the
 * previous month's closing balances, exactly as the workbook chained its columns.
 */
export function computePlan(state: AppState, months?: MonthKey[]): MonthResult[] {
  const cfg = state.config;
  const keys = months ?? monthRange(cfg.startMonth, cfg.monthCount);
  const fixedLines = activeFixed(cfg);
  const funds = activeFunds(cfg);
  const debts = activeDebts(cfg);

  let savings = round2(cfg.savingsOpeningBalance);
  const fundBalances = new Map(funds.map((f) => [f.id, round2(f.openingBalance)]));
  const debtBalances = new Map(debts.map((d) => [d.id, round2(d.openingBalance)]));

  return keys.map((month) => {
    const entry = getMonth(state, month);
    const { totalIn, totalDeductions, net, netIsOverride } = computeNet(entry);

    const fixedByLine: Record<string, number> = {};
    for (const line of fixedLines) {
      fixedByLine[line.id] = round2(entry.fixedCosts[line.id] ?? line.defaultAmount);
    }
    const fixedTotal = sum(Object.values(fixedByLine));
    const oneOffTotal = sum(entry.oneOffs.map((o) => o.amount));
    const guiltFree = round2(entry.guiltFree ?? cfg.defaultGuiltFree);
    const savingsContribution = round2(
      entry.savingsContribution ?? cfg.defaultSavingsContribution,
    );

    // Sinking funds. A capped fund never overshoots its target.
    const fundResults: FundResult[] = funds.map((f) => {
      const start = fundBalances.get(f.id) ?? 0;
      const contribution = round2(entry.fundIn[f.id] ?? f.defaultContribution);
      const spent = round2(entry.fundOut[f.id] ?? 0);
      let applied = contribution;
      if (f.capAtTarget && f.target !== undefined) {
        applied = round2(Math.min(contribution, Math.max(0, f.target - start)));
      }
      const balance = round2(start + applied - spent);
      fundBalances.set(f.id, balance);
      return {
        id: f.id,
        name: f.name,
        contribution,
        appliedContribution: applied,
        spent,
        balance,
        target: f.target,
      };
    });
    const fundIn = sum(fundResults.map((f) => f.appliedContribution));

    // Manual debt payments come out before the waterfall; auto debts eat what is left.
    const manualPayments = new Map<string, number>();
    for (const d of debts) {
      if (d.mode !== 'manual') continue;
      const start = debtBalances.get(d.id) ?? 0;
      const wanted = round2(entry.debtPayments[d.id] ?? d.defaultPayment ?? 0);
      manualPayments.set(d.id, round2(Math.min(Math.max(0, wanted), start)));
    }
    const manualDebtTotal = sum([...manualPayments.values()]);

    const available = round2(
      net - fixedTotal - oneOffTotal - guiltFree - savingsContribution - fundIn - manualDebtTotal,
    );

    let remaining = available;
    const debtResults: DebtResult[] = debts.map((d) => {
      const start = debtBalances.get(d.id) ?? 0;
      let payment: number;
      if (d.mode === 'manual') {
        payment = manualPayments.get(d.id) ?? 0;
      } else {
        payment = round2(Math.min(start, Math.max(0, remaining)));
        remaining = round2(remaining - payment);
      }
      const end = round2(start - payment);
      debtBalances.set(d.id, end);
      return { id: d.id, name: d.name, mode: d.mode, startBalance: start, payment, endBalance: end };
    });

    const autoDebtTotal = sum(
      debtResults.filter((d) => d.mode === 'auto').map((d) => d.payment),
    );
    const spillover = round2(Math.max(0, remaining));

    savings = round2(savings + savingsContribution + spillover);

    const totalAllocated = sum([
      fixedTotal,
      oneOffTotal,
      guiltFree,
      savingsContribution,
      fundIn,
      manualDebtTotal,
      autoDebtTotal,
      spillover,
    ]);
    const fundsTotal = sum(fundResults.map((f) => f.balance));
    const debtTotal = sum(debtResults.map((d) => d.endBalance));

    return {
      month,
      label: monthLabel(month),
      totalIn,
      totalDeductions,
      net,
      netIsOverride,
      fixedTotal,
      fixedByLine,
      oneOffTotal,
      guiltFree,
      savingsContribution,
      fundIn,
      manualDebtTotal,
      available,
      funds: fundResults,
      debts: debtResults,
      autoDebtTotal,
      spillover,
      savingsBalance: savings,
      totalAllocated,
      balanceCheck: round2(net - totalAllocated),
      fundsTotal,
      debtTotal,
      netPosition: round2(savings + fundsTotal - debtTotal),
      hasPayslip: entry.income.source === 'payslip',
    };
  });
}

/** Month-to-date pace for the guilt-free line (the weekly check in the rules). */
export function guiltFreePace(month: MonthKey, budget: number, spent: number, now = new Date()) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const isCurrent = now.getFullYear() === y && now.getMonth() + 1 === m;
  const isPast = new Date(y, m - 1, 1) < new Date(now.getFullYear(), now.getMonth(), 1);
  const dayOfMonth = isCurrent ? now.getDate() : isPast ? daysInMonth : 0;
  const expected = round2((budget * dayOfMonth) / daysInMonth);
  return {
    daysInMonth,
    dayOfMonth,
    expected,
    variance: round2(spent - expected),
    remaining: round2(budget - spent),
    perDayRemaining:
      daysInMonth - dayOfMonth > 0
        ? round2((budget - spent) / (daysInMonth - dayOfMonth))
        : 0,
    onTrack: spent <= expected,
  };
}

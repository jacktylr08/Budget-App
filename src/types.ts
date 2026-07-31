/** Core data model. Mirrors the structure of the original Financial Plan workbook. */

/** Month key in `YYYY-MM` form, e.g. "2026-08". */
export type MonthKey = string;

export interface LineItem {
  id: string;
  name: string;
  /** Used for any month that has no explicit override. */
  defaultAmount: number;
  archived?: boolean;
}

export interface Fund {
  id: string;
  name: string;
  openingBalance: number;
  /** Optional goal, e.g. £750 emergency fund. */
  target?: number;
  /** When true, a month's contribution is trimmed so the balance never exceeds the target. */
  capAtTarget?: boolean;
  defaultContribution: number;
  archived?: boolean;
}

export interface Debt {
  id: string;
  name: string;
  openingBalance: number;
  /**
   * `auto`   — paid from whatever is left after every other allocation, capped at the
   *            balance owed (the Barclaycard line in the workbook).
   * `manual` — a fixed payment you schedule yourself (the overdraft line).
   */
  mode: 'auto' | 'manual';
  /** Lower number is paid first. Only meaningful for `auto` debts. */
  priority: number;
  defaultPayment?: number;
  /** Free text, e.g. "0% ends January 2027". */
  note?: string;
  archived?: boolean;
}

export interface NamedAmount {
  id: string;
  name: string;
  amount: number;
}

export interface MonthIncome {
  gross: number;
  bonus: number;
  reimbursement: number;
  otherIncome: NamedAmount[];
  incomeTax: number;
  nationalInsurance: number;
  pension: number;
  studentLoan: number;
  otherDeductions: NamedAmount[];
  /**
   * Net pay straight off the payslip. When set it wins over the computed figure,
   * so the plan always reflects what actually landed in the account.
   */
  netOverride?: number;
  /** Provenance for the income block, set when a payslip is imported. */
  source?: 'manual' | 'payslip';
  importedAt?: string;
}

export interface MonthEntry {
  month: MonthKey;
  income: MonthIncome;
  /** Overrides keyed by fixed-cost id. Absent id = use that line's default. */
  fixedCosts: Record<string, number>;
  oneOffs: NamedAmount[];
  guiltFree?: number;
  savingsContribution?: number;
  /** Keyed by fund id. */
  fundIn: Record<string, number>;
  fundOut: Record<string, number>;
  /** Keyed by debt id. Only read for `manual` debts. */
  debtPayments: Record<string, number>;
  /** What you have actually spent so far, for the weekly pace check. */
  actualGuiltFree?: number;
  notes?: string;
  /** Set once you have reconciled the month against your bank. */
  locked?: boolean;
}

export interface Config {
  currency: string;
  locale: string;
  startMonth: MonthKey;
  monthCount: number;
  savingsOpeningBalance: number;
  savingsAccountName: string;
  defaultSavingsContribution: number;
  defaultGuiltFree: number;
  fixedCosts: LineItem[];
  funds: Fund[];
  debts: Debt[];
  /** Payslip label aliases, keyed by the income field they feed. */
  payslipMappings: PayslipMappings;
}

export type PayslipField =
  | 'gross'
  | 'bonus'
  | 'reimbursement'
  | 'incomeTax'
  | 'nationalInsurance'
  | 'pension'
  | 'studentLoan'
  | 'net';

export type PayslipMappings = Record<PayslipField, string[]>;

export interface AppState {
  version: number;
  config: Config;
  months: Record<MonthKey, MonthEntry>;
  rules: string;
}

/* ---------- Computed output ---------- */

export interface FundResult {
  id: string;
  name: string;
  contribution: number;
  /** Contribution actually applied after any target cap. */
  appliedContribution: number;
  spent: number;
  balance: number;
  target?: number;
}

export interface DebtResult {
  id: string;
  name: string;
  mode: 'auto' | 'manual';
  startBalance: number;
  payment: number;
  endBalance: number;
}

export interface MonthResult {
  month: MonthKey;
  label: string;
  /** Gross pay + bonus + reimbursement + other income. */
  totalIn: number;
  totalDeductions: number;
  net: number;
  netIsOverride: boolean;
  fixedTotal: number;
  fixedByLine: Record<string, number>;
  oneOffTotal: number;
  guiltFree: number;
  savingsContribution: number;
  fundIn: number;
  manualDebtTotal: number;
  /** Net minus everything above — the pot the auto debts draw from. */
  available: number;
  funds: FundResult[];
  debts: DebtResult[];
  autoDebtTotal: number;
  spillover: number;
  savingsBalance: number;
  totalAllocated: number;
  /** Must be 0. Anything else means the month does not balance. */
  balanceCheck: number;
  fundsTotal: number;
  debtTotal: number;
  netPosition: number;
  hasPayslip: boolean;
}

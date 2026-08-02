/**
 * Seed data. Structure and line names come from the Financial Plan workbook so the
 * app is usable immediately; every figure is editable in Settings.
 */
import { emptyMonth, monthRange } from './engine';
import type { AppState, Config, MonthEntry, PayslipMappings } from './types';

export const DEFAULT_PAYSLIP_MAPPINGS: PayslipMappings = {
  gross: ['basic pay', 'basic salary', 'gross pay', 'gross', 'salary', 'total gross pay'],
  bonus: ['bonus', 'commission', 'incentive', 'performance pay'],
  reimbursement: ['expenses', 'expense reimbursement', 'reimbursement', 'mileage'],
  incomeTax: ['income tax', 'paye', 'paye tax', 'tax paid', 'tax'],
  nationalInsurance: ['national insurance', 'nat insurance', 'ni contribution', 'employee ni', 'ni'],
  pension: ['pension', 'pension ee', 'employee pension', 'pension contribution', 'salary sacrifice'],
  studentLoan: ['student loan', 'student loan repayment', 'slc', 'postgraduate loan'],
  net: ['net pay', 'total net pay', 'net payment', 'take home', 'amount payable', 'paid this period'],
};

const START_MONTH = '2026-08';
const MONTH_COUNT = 11;

export const DEFAULT_CONFIG: Config = {
  currency: 'GBP',
  locale: 'en-GB',
  startMonth: START_MONTH,
  monthCount: MONTH_COUNT,
  savingsAccountName: 'Savings (Trading 212)',
  savingsOpeningBalance: 2311,
  defaultSavingsContribution: 400,
  defaultGuiltFree: 575,
  bigNightThreshold: 50,
  fixedCosts: [
    { id: 'rent', name: 'Rent', defaultAmount: 500 },
    { id: 'petrol', name: 'Petrol', defaultAmount: 70 },
    { id: 'insurance', name: 'Insurance', defaultAmount: 35.94 },
    { id: 'gym', name: 'Gym', defaultAmount: 34.99 },
    { id: 'phone', name: 'Phone', defaultAmount: 44.5 },
    { id: 'spotify', name: 'Spotify', defaultAmount: 12.99 },
    { id: 'prime', name: 'Amazon Prime', defaultAmount: 4.49 },
    { id: 'vpn', name: 'ExpressVPN', defaultAmount: 9.54 },
    { id: 'xbox', name: 'Xbox Gold', defaultAmount: 5.99 },
    { id: 'monzo', name: 'Monzo Extra', defaultAmount: 3 },
    { id: 'klarna', name: 'Klarna', defaultAmount: 0 },
  ],
  funds: [
    { id: 'holiday', name: 'Holiday Fund', openingBalance: 150, defaultContribution: 125 },
    { id: 'gift', name: 'Gift Fund', openingBalance: 0, defaultContribution: 0 },
    {
      id: 'emergency',
      name: 'Emergency / Car Fund',
      openingBalance: 0,
      defaultContribution: 0,
      target: 750,
      capAtTarget: true,
    },
  ],
  debts: [
    {
      id: 'overdraft',
      name: 'Overdraft',
      openingBalance: 462,
      mode: 'manual',
      priority: 0,
      defaultPayment: 0,
    },
    {
      id: 'barclaycard',
      name: 'Barclaycard',
      openingBalance: 392.08,
      mode: 'auto',
      priority: 1,
      note: '0% ends January 2027',
    },
  ],
  payslipMappings: DEFAULT_PAYSLIP_MAPPINGS,
};

export const DEFAULT_RULES = `# Operating rules

These rules are what make the plan a plan rather than a forecast. The app handles the
arithmetic; these handle the behaviour.

## 1. The two locked lines
Guilt-free spending and the savings contribution are fixed. Guilt-free is set from
evidence, not aspiration. If you overspend, the debt / spillover line absorbs it —
never savings.

## 2. Clear the promotional-rate card before the rate expires
Bonus months exist to kill debt. Do not raise fund contributions in a month whose
surplus is committed to a card.

## 3. The December cap
Decide in August what December looks like. A cap chosen in advance is a plan; the
same cap discovered on 20 December is a crisis.

## 4. The January rule
January has no Christmas fund and often no debt payment, which makes the surplus feel
free. It is already allocated. Nothing changes about guilt-free spending in January.

## 5. The bonus rule
Verify every bonus against the payslip on the day. Do not spend against an assumed
bonus before it lands. If a bonus does not arrive, reduce that month's savings and
fund contributions — never the guilt-free line.

## 6. Emergency fund target
The fund stops at its target. Contributions after that go to savings instead.

## 7. The weekly check
Every Sunday, compare month-to-date guilt-free spending against the pace bar on the
Month page. Ahead of pace on the 10th is fixable; ahead of pace on the 28th is not.
Every payday, import the payslip and check net pay against the plan before spending.

## 8. When you overspend
You will overspend a month. It is built in: the debt / spillover line is the shock
absorber. Overspending slows debt payoff or fund growth — it does not touch savings.
Return to budget the following month and carry on. Do not compensate by slashing the
next month; that is the boom-bust cycle.
`;

/** The 11-month plan from the workbook, used as the initial month data. */
function seedMonths(): Record<string, MonthEntry> {
  const keys = monthRange(START_MONTH, MONTH_COUNT);
  const bonus = [785, 0, 785, 0, 785, 0, 785, 0, 785, 0, 785];
  const reimbursement = [0, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35];
  const incomeTax = [369.4, 221, 369.4, 221, 369.4, 221, 369.4, 221, 369.4, 221, 369.4];
  const ni = [147.78, 88.47, 147.78, 88.47, 147.78, 88.47, 147.78, 88.47, 147.78, 88.47, 147.78];
  const pension = [139.72, 96.11, 139.72, 96.11, 139.72, 96.11, 139.72, 96.11, 139.72, 96.11, 139.72];
  const studentLoan = [47, 0, 47, 0, 47, 0, 47, 0, 47, 0, 47];
  const petrol = [75, ...Array(10).fill(70)];
  const xbox = [16.99, ...Array(10).fill(5.99)];
  const klarna = [30.01, 6.01, ...Array(9).fill(0)];
  const guiltFree = [547.23, ...Array(10).fill(575)];
  const savings = [350, 350, 350, ...Array(8).fill(400)];
  const holidayIn = [125, 125, 60, 60, 60, 100, 250, 125, 250, 125, 125];
  const holidayOut = [0, 400, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const giftIn = [0, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0];
  const giftOut = [0, 0, 0, 0, 200, 0, 0, 0, 0, 0, 0];
  const emergencyIn = [0, 0, 150, 50, 250, 50, 100, 50, 100, 0, 0];
  const overdraft = [462, ...Array(10).fill(0)];
  const oneOffs: Array<{ name: string; amount: number }[]> = [
    [{ name: 'Edinburgh train', amount: 65.6 }],
    [{ name: 'One-off', amount: 35 }],
    [{ name: 'One-off', amount: 35 }],
    [], [], [], [], [], [], [], [],
  ];

  const months: Record<string, MonthEntry> = {};
  keys.forEach((key, i) => {
    const base = emptyMonth(key);
    months[key] = {
      ...base,
      income: {
        ...base.income,
        gross: 2250,
        bonus: bonus[i],
        reimbursement: reimbursement[i],
        incomeTax: incomeTax[i],
        nationalInsurance: ni[i],
        pension: pension[i],
        studentLoan: studentLoan[i],
        // August's net came off a real payslip and differs from the modelled figure.
        netOverride: i === 0 ? 2317.28 : undefined,
        source: i === 0 ? 'payslip' : 'manual',
      },
      // Only months that differ from the line's default are stored as overrides.
      fixedCosts: Object.fromEntries(
        (
          [
            ['petrol', petrol[i]],
            ['xbox', xbox[i]],
            ['klarna', klarna[i]],
          ] as const
        ).filter(([id, amount]) => amount !== DEFAULT_CONFIG.fixedCosts.find((l) => l.id === id)!.defaultAmount),
      ),
      oneOffs: oneOffs[i].map((o, n) => ({ id: `${key}-oneoff-${n}`, ...o })),
      guiltFree: guiltFree[i],
      savingsContribution: savings[i],
      fundIn: { holiday: holidayIn[i], gift: giftIn[i], emergency: emergencyIn[i] },
      fundOut: { holiday: holidayOut[i], gift: giftOut[i] },
      debtPayments: { overdraft: overdraft[i] },
    };
  });
  return months;
}

export function defaultState(): AppState {
  return {
    version: 1,
    config: structuredClone(DEFAULT_CONFIG),
    months: seedMonths(),
    rules: DEFAULT_RULES,
  };
}

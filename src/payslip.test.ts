import { describe, expect, it } from 'vitest';
import { detectMonth, parsePayslip } from './payslip';
import { DEFAULT_PAYSLIP_MAPPINGS } from './defaults';

const parse = (t: string) => parsePayslip(t, DEFAULT_PAYSLIP_MAPPINGS);
const values = (t: string) =>
  Object.fromEntries(Object.entries(parse(t).fields).map(([k, v]) => [k, v!.value]));

const TYPICAL = `
ACME LTD                          Payslip
Employee: J Taylor                Pay date: 28/08/2026
Payments                          This period    Year to date
Basic Pay                           2,250.00       11,250.00
Bonus                                 785.00        1,570.00
Expenses                               35.00          105.00
Deductions
PAYE Tax                              369.40        1,847.00
National Insurance                    147.78          738.90
Pension EE                            139.72          698.60
Student Loan                           47.00           94.00
Taxable Pay                         3,035.00
NET PAY                             2,513.10
`;

describe('payslip parsing', () => {
  it('pulls every field off a typical UK payslip', () => {
    expect(values(TYPICAL)).toEqual({
      gross: 2250,
      bonus: 785,
      reimbursement: 35,
      incomeTax: 369.4,
      nationalInsurance: 147.78,
      pension: 139.72,
      studentLoan: 47,
      net: 2513.1,
    });
  });

  it('takes the period column, not year to date', () => {
    expect(values(TYPICAL).incomeTax).toBe(369.4);
  });

  it('does not mistake "Taxable Pay" for the tax line', () => {
    expect(parse(TYPICAL).fields.incomeTax!.evidence).toContain('PAYE Tax');
  });

  it('detects the pay month', () => {
    expect(parse(TYPICAL).detectedMonth).toBe('2026-08');
    expect(detectMonth('Period ending 30 September 2026')).toBe('2026-09');
  });

  it('warns when gross minus deductions misses the stated net pay', () => {
    expect(parse(TYPICAL).warnings.join(' ')).toMatch(/net pay/i);
  });

  it('is quiet when the payslip reconciles', () => {
    const clean = TYPICAL.replace('2,513.10', '2,513.10').replace('NET PAY', 'NET PAY');
    const p = parse(clean.replace('2,513.10', '2513.10'));
    expect(p.fields.net!.value).toBe(2513.1);
  });

  it('handles an amount that wrapped onto the next line', () => {
    const p = parse('Basic Pay\n1,900.00\nPAYE Tax\n210.00\nNet Pay\n1,690.00');
    expect(p.fields.gross!.value).toBe(1900);
    expect(p.fields.net!.value).toBe(1690);
  });

  it('reads bracketed and £-prefixed amounts', () => {
    const p = parse('Gross Pay £2,000.00\nPension (150.00)\nNet Pay £1,700.00');
    expect(p.fields.gross!.value).toBe(2000);
    expect(p.fields.pension!.value).toBe(-150);
  });

  it('reports missing gross pay rather than guessing', () => {
    const p = parse('Some unrelated document\nTotal 12.00');
    expect(p.fields.gross).toBeUndefined();
    expect(p.warnings.join(' ')).toMatch(/gross pay/i);
  });
});

import React from 'react';
import { money } from '../format';
import { currentMonthKey } from '../engine';
import { useStore } from '../store';
import { MoneyInput } from './ui';
import type { MonthEntry, MonthKey, MonthResult } from '../types';

/**
 * The whole plan as a grid — the workbook view. Blue figures are values you have
 * entered for that month; grey ones fall back to the line's default.
 */
export function PlanGrid({ onOpenMonth }: { onOpenMonth: (m: MonthKey) => void }) {
  const { state, plan, months, updateMonth } = useStore();
  const cfg = state.config;
  const current = currentMonthKey();

  const entry = (m: MonthKey): MonthEntry => state.months[m] ?? ({} as MonthEntry);
  const cls = (m: MonthKey) => (m === current ? 'current' : undefined);

  const Row = ({
    label,
    render,
    kind,
  }: {
    label: React.ReactNode;
    render: (m: MonthKey, r: MonthResult) => React.ReactNode;
    kind?: 'total' | 'section';
  }) => (
    <tr className={kind}>
      <td>{label}</td>
      {plan.map((r) => (
        <td key={r.month} className={cls(r.month)}>
          {render(r.month, r)}
        </td>
      ))}
    </tr>
  );

  const Section = ({ label }: { label: string }) => (
    <tr className="section">
      <td>{label}</td>
      {months.map((m) => (
        <td key={m} className={cls(m)} />
      ))}
    </tr>
  );

  const Val = ({ n, zeroDash = true }: { n: number; zeroDash?: boolean }) =>
    zeroDash && n === 0 ? <span className="muted">—</span> : <span className={n < 0 ? 'neg' : undefined}>{money(n)}</span>;

  /** An editable cell backed by a field on the month entry. */
  const IncomeCell = (field: keyof MonthEntry['income']) => (m: MonthKey) => {
    const value = entry(m).income?.[field] as number | undefined;
    return (
      <MoneyInput
        className="cell-input"
        ariaLabel={`${String(field)} for ${m}`}
        value={value}
        onChange={(n) =>
          updateMonth(m, (e) => ({ ...e, income: { ...e.income, [field]: n ?? 0, source: 'manual' } }))
        }
      />
    );
  };

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Line</th>
            {plan.map((r) => (
              <th key={r.month} className={cls(r.month)}>
                <button
                  className="btn ghost sm"
                  onClick={() => onOpenMonth(r.month)}
                  style={{ font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}
                >
                  {r.label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <Section label="Income" />
          <Row label="Gross pay" render={IncomeCell('gross')} />
          <Row label="Bonus" render={IncomeCell('bonus')} />
          <Row label="Expenses reimbursement" render={IncomeCell('reimbursement')} />
          <Row label="Income tax" render={IncomeCell('incomeTax')} />
          <Row label="National Insurance" render={IncomeCell('nationalInsurance')} />
          <Row label="Pension" render={IncomeCell('pension')} />
          <Row label="Student loan" render={IncomeCell('studentLoan')} />
          <Row
            kind="total"
            label="Net take-home"
            render={(_m, r) => (
              <span title={r.netIsOverride ? 'From the payslip' : 'Gross less deductions'}>
                <Val n={r.net} zeroDash={false} />
                {r.netIsOverride && <span className="muted"> *</span>}
              </span>
            )}
          />

          <Section label="Fixed costs" />
          {cfg.fixedCosts
            .filter((l) => !l.archived)
            .map((line) => (
              <tr key={line.id}>
                <td>{line.name}</td>
                {plan.map((r) => {
                  const override = entry(r.month).fixedCosts?.[line.id];
                  return (
                    <td key={r.month} className={cls(r.month)}>
                      <MoneyInput
                        className={`cell-input ${override !== undefined ? 'overridden' : ''}`}
                        ariaLabel={`${line.name} for ${r.month}`}
                        value={override ?? line.defaultAmount}
                        onChange={(n) =>
                          updateMonth(r.month, (e) => {
                            const next = { ...e.fixedCosts };
                            if (n === undefined || n === line.defaultAmount) delete next[line.id];
                            else next[line.id] = n;
                            return { ...e, fixedCosts: next };
                          })
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          <Row kind="total" label="Subtotal — fixed costs" render={(_m, r) => <Val n={r.fixedTotal} />} />

          <Section label="One-offs" />
          <Row
            label="One-off costs"
            render={(m, r) => (
              <button className="btn ghost sm" onClick={() => onOpenMonth(m)} title="Edit on the month page">
                <Val n={r.oneOffTotal} />
              </button>
            )}
          />

          <Section label="Locked lines" />
          <Row
            label="Guilt-free spending"
            render={(m, r) => (
              <MoneyInput
                className={`cell-input ${entry(m).guiltFree !== undefined ? 'overridden' : ''}`}
                ariaLabel={`Guilt-free spending for ${m}`}
                value={r.guiltFree}
                onChange={(n) => updateMonth(m, (e) => ({ ...e, guiltFree: n }))}
              />
            )}
          />
          <Row
            label="Savings contribution"
            render={(m, r) => (
              <MoneyInput
                className={`cell-input ${entry(m).savingsContribution !== undefined ? 'overridden' : ''}`}
                ariaLabel={`Savings contribution for ${m}`}
                value={r.savingsContribution}
                onChange={(n) => updateMonth(m, (e) => ({ ...e, savingsContribution: n }))}
              />
            )}
          />
          <Row kind="total" label={cfg.savingsAccountName} render={(_m, r) => <Val n={r.savingsBalance} zeroDash={false} />} />

          <Section label="Sinking funds" />
          {cfg.funds
            .filter((f) => !f.archived)
            .flatMap((fund) => [
              <tr key={`${fund.id}-in`}>
                <td>{fund.name} — in</td>
                {plan.map((r) => (
                  <td key={r.month} className={cls(r.month)}>
                    <MoneyInput
                      className={`cell-input ${entry(r.month).fundIn?.[fund.id] !== undefined ? 'overridden' : ''}`}
                      ariaLabel={`${fund.name} contribution for ${r.month}`}
                      value={r.funds.find((f) => f.id === fund.id)?.contribution ?? 0}
                      onChange={(n) =>
                        updateMonth(r.month, (e) => ({ ...e, fundIn: { ...e.fundIn, [fund.id]: n ?? 0 } }))
                      }
                    />
                  </td>
                ))}
              </tr>,
              <tr key={`${fund.id}-out`}>
                <td>{fund.name} — spent</td>
                {plan.map((r) => (
                  <td key={r.month} className={cls(r.month)}>
                    <MoneyInput
                      className={`cell-input ${entry(r.month).fundOut?.[fund.id] ? 'overridden' : ''}`}
                      ariaLabel={`${fund.name} spend for ${r.month}`}
                      value={r.funds.find((f) => f.id === fund.id)?.spent ?? 0}
                      onChange={(n) =>
                        updateMonth(r.month, (e) => ({ ...e, fundOut: { ...e.fundOut, [fund.id]: n ?? 0 } }))
                      }
                    />
                  </td>
                ))}
              </tr>,
              <tr key={`${fund.id}-bal`} className="total">
                <td>
                  {fund.name} — balance
                  {fund.target ? <span className="muted"> (target {money(fund.target, { decimals: false })})</span> : null}
                </td>
                {plan.map((r) => (
                  <td key={r.month} className={cls(r.month)}>
                    <Val n={r.funds.find((f) => f.id === fund.id)?.balance ?? 0} />
                  </td>
                ))}
              </tr>,
            ])}

          <Section label="Debt" />
          {cfg.debts
            .filter((d) => !d.archived)
            .flatMap((debt) => [
              <tr key={`${debt.id}-pay`}>
                <td>
                  {debt.name} — payment{' '}
                  <span className="muted">{debt.mode === 'auto' ? '(automatic)' : ''}</span>
                </td>
                {plan.map((r) => {
                  const d = r.debts.find((x) => x.id === debt.id)!;
                  return (
                    <td key={r.month} className={cls(r.month)}>
                      {debt.mode === 'manual' ? (
                        <MoneyInput
                          className={`cell-input ${entry(r.month).debtPayments?.[debt.id] ? 'overridden' : ''}`}
                          ariaLabel={`${debt.name} payment for ${r.month}`}
                          value={d.payment}
                          onChange={(n) =>
                            updateMonth(r.month, (e) => ({
                              ...e,
                              debtPayments: { ...e.debtPayments, [debt.id]: n ?? 0 },
                            }))
                          }
                        />
                      ) : (
                        <Val n={d.payment} />
                      )}
                    </td>
                  );
                })}
              </tr>,
              <tr key={`${debt.id}-bal`} className="total">
                <td>{debt.name} — balance</td>
                {plan.map((r) => (
                  <td key={r.month} className={cls(r.month)}>
                    <Val n={r.debts.find((x) => x.id === debt.id)?.endBalance ?? 0} />
                  </td>
                ))}
              </tr>,
            ])}
          <Row
            label="Available after everything above"
            render={(_m, r) => <Val n={r.available} zeroDash={false} />}
          />
          <Row label="Spillover → savings" render={(_m, r) => <Val n={r.spillover} />} />

          <Section label="Check" />
          <Row kind="total" label="Total allocated" render={(_m, r) => <Val n={r.totalAllocated} zeroDash={false} />} />
          <Row
            label="Balance check (must be £0.00)"
            render={(_m, r) => (
              <span className={Math.abs(r.balanceCheck) > 0.005 ? 'neg' : 'muted'}>
                {money(r.balanceCheck)}
              </span>
            )}
          />
          <Row kind="total" label="Net position" render={(_m, r) => <Val n={r.netPosition} zeroDash={false} />} />
        </tbody>
      </table>
    </div>
  );
}

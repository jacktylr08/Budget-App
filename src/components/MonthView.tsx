import React from 'react';
import { addMonths, currentMonthKey, monthLabel } from '../engine';
import { money } from '../format';
import { useStore } from '../store';
import { useThemeColors } from '../charts/Charts';
import { PayslipImport } from './PayslipImport';
import { SpendingCard } from './SpendingCard';
import { Badge, Card, Field, Money, MoneyInput } from './ui';
import type { MonthKey, MonthResult } from '../types';

export function MonthView({
  month,
  setMonth,
}: {
  month: MonthKey;
  setMonth: (m: MonthKey) => void;
}) {
  const { state, plan, months, updateMonth } = useStore();
  const colors = useThemeColors();
  const result = plan.find((m) => m.month === month);
  const entry = state.months[month];
  const cfg = state.config;

  if (!result) {
    return (
      <div className="callout warn">
        {monthLabel(month, true)} is outside the plan window. Extend the plan in Settings, or pick
        another month.
      </div>
    );
  }

  const index = months.indexOf(month);
  const prev = plan[index - 1];
  const isCurrent = month === currentMonthKey();

  // The waterfall: each step consumes part of the take-home.
  const steps = [
    { name: 'Fixed costs', amount: result.fixedTotal, color: colors.series[0] },
    { name: 'One-offs', amount: result.oneOffTotal, color: colors.series[1] },
    { name: 'Guilt-free spending', amount: result.guiltFree, color: colors.series[2] },
    { name: 'Savings contribution', amount: result.savingsContribution, color: colors.series[3] },
    ...result.funds.map((f, i) => ({
      name: `${f.name} contribution`,
      amount: f.appliedContribution,
      color: colors.series[(4 + i) % 8],
    })),
    ...result.debts
      .filter((d) => d.payment > 0)
      .map((d) => ({ name: `${d.name} payment`, amount: d.payment, color: colors.series[7] })),
    { name: 'Spillover → savings', amount: result.spillover, color: colors.series[3] },
  ].filter((s) => s.amount !== 0);

  const maxStep = Math.max(...steps.map((s) => Math.abs(s.amount)), 1);

  return (
    <>
      <div className="page-head">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              className="btn sm"
              onClick={() => setMonth(addMonths(month, -1))}
              disabled={index <= 0}
              aria-label="Previous month"
            >
              ←
            </button>
            <h1>{monthLabel(month, true)}</h1>
            <button
              className="btn sm"
              onClick={() => setMonth(addMonths(month, 1))}
              disabled={index >= months.length - 1}
              aria-label="Next month"
            >
              →
            </button>
            {isCurrent && <Badge tone="neutral">this month</Badge>}
            {result.hasPayslip ? <Badge tone="good">payslip imported</Badge> : <Badge>planned</Badge>}
            {Math.abs(result.balanceCheck) > 0.005 ? (
              <Badge tone="bad">does not balance</Badge>
            ) : result.available < 0 ? (
              <Badge tone="warn">overcommitted</Badge>
            ) : (
              <Badge tone="good">balanced</Badge>
            )}
          </div>
          <p>
            {money(result.net)} take-home, allocated down to {money(result.balanceCheck)} unassigned.
          </p>
        </div>
        <div className="spacer" />
        <div className="chip-row">
          {months.map((m) => (
            <button key={m} className="chip" aria-pressed={m === month} onClick={() => setMonth(m)}>
              {monthLabel(m)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid cols-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card title="Import payslip" sub="Drop it in and the income lines fill themselves">
            <PayslipImport month={month} onApplied={setMonth} />
          </Card>

          <Card title="Income" sub={result.hasPayslip ? 'From your payslip' : 'Planned figures'}>
            <div className="grid cols-2" style={{ gap: 10 }}>
              {(
                [
                  ['gross', 'Gross pay'],
                  ['bonus', 'Bonus'],
                  ['reimbursement', 'Expenses reimbursed'],
                  ['incomeTax', 'Income tax'],
                  ['nationalInsurance', 'National Insurance'],
                  ['pension', 'Pension'],
                  ['studentLoan', 'Student loan'],
                ] as const
              ).map(([field, label]) => (
                <Field key={field} label={label}>
                  <MoneyInput
                    value={entry?.income?.[field] ?? 0}
                    onChange={(n) =>
                      updateMonth(month, (e) => ({
                        ...e,
                        income: { ...e.income, [field]: n ?? 0, source: 'manual' },
                      }))
                    }
                  />
                </Field>
              ))}
              <Field label="Net pay override" hint="Blank = calculated from the lines above">
                <MoneyInput
                  value={entry?.income?.netOverride}
                  onChange={(n) =>
                    updateMonth(month, (e) => ({ ...e, income: { ...e.income, netOverride: n } }))
                  }
                />
              </Field>
            </div>
            <dl className="kv" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <dt>Total in</dt>
              <dd>{money(result.totalIn)}</dd>
              <dt>Total deductions</dt>
              <dd>−{money(result.totalDeductions)}</dd>
              <dt>
                <strong>Net take-home</strong>
              </dt>
              <dd>
                <strong>{money(result.net)}</strong>
              </dd>
            </dl>
          </Card>

          <Card title="Fixed costs" sub={`${money(result.fixedTotal)} this month`}>
            {cfg.fixedCosts
              .filter((l) => !l.archived)
              .map((line) => {
                const override = entry?.fixedCosts?.[line.id];
                return (
                  <div className="list-row" key={line.id}>
                    <span>
                      {line.name}
                      {override !== undefined && override !== line.defaultAmount && (
                        <span className="muted"> · usually {money(line.defaultAmount)}</span>
                      )}
                    </span>
                    <MoneyInput
                      value={override ?? line.defaultAmount}
                      onChange={(n) =>
                        updateMonth(month, (e) => {
                          const next = { ...e.fixedCosts };
                          if (n === undefined) delete next[line.id];
                          else next[line.id] = n;
                          return { ...e, fixedCosts: next };
                        })
                      }
                    />
                    <span />
                  </div>
                );
              })}
          </Card>

          <Card
            title="One-off costs"
            sub="Anything that only happens this month"
            actions={
              <button
                className="btn sm"
                onClick={() =>
                  updateMonth(month, (e) => ({
                    ...e,
                    oneOffs: [
                      ...e.oneOffs,
                      { id: `${month}-${Date.now()}`, name: 'One-off', amount: 0 },
                    ],
                  }))
                }
              >
                Add
              </button>
            }
          >
            {(entry?.oneOffs ?? []).length === 0 && <p>None this month.</p>}
            {(entry?.oneOffs ?? []).map((o) => (
              <div className="list-row" key={o.id}>
                <input
                  value={o.name}
                  onChange={(ev) =>
                    updateMonth(month, (e) => ({
                      ...e,
                      oneOffs: e.oneOffs.map((x) => (x.id === o.id ? { ...x, name: ev.target.value } : x)),
                    }))
                  }
                />
                <MoneyInput
                  value={o.amount}
                  onChange={(n) =>
                    updateMonth(month, (e) => ({
                      ...e,
                      oneOffs: e.oneOffs.map((x) => (x.id === o.id ? { ...x, amount: n ?? 0 } : x)),
                    }))
                  }
                />
                <button
                  className="btn ghost sm"
                  aria-label={`Remove ${o.name}`}
                  onClick={() =>
                    updateMonth(month, (e) => ({ ...e, oneOffs: e.oneOffs.filter((x) => x.id !== o.id) }))
                  }
                >
                  ✕
                </button>
              </div>
            ))}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SpendingCard month={month} result={result} />

          <Card title="Allocation" sub={`Every penny of ${money(result.net)}`}>
            <div className="waterfall">
              {steps.map((s) => (
                <React.Fragment key={s.name}>
                  <div className="wf-row" style={{ borderBottom: 'none', paddingBottom: 2 }}>
                    <span className="wf-name">
                      <i className="swatch" style={{ background: s.color }} />
                      {s.name}
                    </span>
                    <span className="wf-amount">{money(s.amount)}</span>
                  </div>
                  <div className="wf-bar" style={{ marginBottom: 8 }}>
                    <i style={{ width: `${(Math.abs(s.amount) / maxStep) * 100}%`, background: s.color }} />
                  </div>
                </React.Fragment>
              ))}
            </div>
            <dl className="kv" style={{ marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <dt>Available before debt</dt>
              <dd className={result.available < 0 ? 'neg' : undefined}>{money(result.available)}</dd>
              <dt>Total allocated</dt>
              <dd>{money(result.totalAllocated)}</dd>
              <dt>Unallocated (must be nil)</dt>
              <dd className={Math.abs(result.balanceCheck) > 0.005 ? 'neg' : 'muted'}>
                {money(result.balanceCheck)}
              </dd>
            </dl>
            {result.available < 0 && (
              <div className="callout warn" style={{ marginTop: 10 }}>
                You have committed {money(-result.available)} more than you earned this month. Trim a
                contribution or a one-off — do not let it fall through to next month.
              </div>
            )}
          </Card>

          <Card title="Balances at the end of the month">
            <dl className="kv">
              <dt>{cfg.savingsAccountName}</dt>
              <dd>
                {money(result.savingsBalance)}
                {prev && (
                  <span className="muted" style={{ fontWeight: 400 }}>
                    {' '}
                    ({money(result.savingsBalance - prev.savingsBalance, { sign: true })})
                  </span>
                )}
              </dd>
              {result.funds.map((f) => (
                <React.Fragment key={f.id}>
                  <dt>
                    {f.name}
                    {f.target && f.balance >= f.target && <span className="muted"> · target met</span>}
                  </dt>
                  <dd>{money(f.balance)}</dd>
                </React.Fragment>
              ))}
              {result.debts.map((d) => (
                <React.Fragment key={d.id}>
                  <dt>{d.name} owed</dt>
                  <dd className={d.endBalance > 0 ? 'neg' : undefined}>{money(d.endBalance)}</dd>
                </React.Fragment>
              ))}
              <dt>
                <strong>Net position</strong>
              </dt>
              <dd>
                <strong>
                  <Money n={result.netPosition} />
                </strong>
              </dd>
            </dl>
          </Card>

          <Card title="Notes">
            <textarea
              rows={4}
              placeholder="What happened this month, and what you decided to do about it."
              value={entry?.notes ?? ''}
              onChange={(e) => updateMonth(month, (x) => ({ ...x, notes: e.target.value }))}
            />
          </Card>
        </div>
      </div>
    </>
  );
}

export function monthSummaryLine(r: MonthResult): string {
  return `${r.label}: ${money(r.net)} in, ${money(r.savingsBalance)} saved`;
}

import { AllocationChart, BalancesChart, FundMeter, useThemeColors } from '../charts/Charts';
import { money } from '../format';
import { currentMonthKey, monthLabel } from '../engine';
import { useStore } from '../store';
import { analyseSpending, formatDayOfMonth } from '../spending';
import { Badge, Card, Money, Stat } from './ui';
import type { MonthKey } from '../types';

export function Dashboard({ onOpenMonth }: { onOpenMonth: (m: MonthKey) => void }) {
  const { plan, state } = useStore();
  const colors = useThemeColors();
  const current = currentMonthKey();

  if (plan.length === 0) {
    return <p>No months in the plan yet — set a start month in Settings.</p>;
  }

  // "Now" is the current month if it is in the plan, otherwise the last month of it.
  const nowIndex = Math.max(0, plan.findIndex((m) => m.month === current));
  const now = plan[nowIndex];
  const last = plan[plan.length - 1];
  const first = plan[0];

  const unbalanced = plan.filter((m) => Math.abs(m.balanceCheck) > 0.005);
  const shortfalls = plan.filter((m) => m.available < 0);
  const noPayslip = plan.filter((m) => !m.hasPayslip && m.month <= current);
  const debtFreeMonth = plan.find((m) => m.debtTotal === 0);
  const savingsGrowth = last.savingsBalance - state.config.savingsOpeningBalance;

  // Guilt-free spending for the month in progress — the thing worth knowing today.
  const currentResult = plan.find((m) => m.month === current);
  const spending = currentResult
    ? analyseSpending({
        month: current,
        budget: currentResult.guiltFree,
        spends: state.months[current]?.spends ?? [],
        fallbackTotal: state.months[current]?.actualGuiltFree ?? 0,
        bigNightThreshold: state.config.bigNightThreshold,
        history: Object.values(state.months)
          .filter((e) => e.month < current && (e.spends?.length ?? 0) > 0)
          .map((e) => ({ month: e.month, spends: e.spends ?? [] })),
      })
    : undefined;
  // Only speak up when the odds are genuinely against the month, not on every wobble.
  const spendingAlert =
    spending &&
    (spending.status === 'spent-up' ||
      (spending.daysLeft > 0 && !spending.forecast.thin && spending.forecast.probabilityWithinBudget < 0.5));

  return (
    <>
      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <Stat
          label={`Net position · ${now.label}`}
          value={money(now.netPosition, { decimals: false })}
          note={`${money(last.netPosition, { decimals: false })} projected by ${last.label}`}
        />
        <Stat
          label="Savings balance"
          value={money(now.savingsBalance, { decimals: false })}
          note={`${money(savingsGrowth, { decimals: false, sign: true })} over the plan`}
        />
        <Stat
          label="Debt owed"
          value={money(now.debtTotal, { decimals: false })}
          tone={now.debtTotal > 0 ? 'warn' : 'good'}
          note={
            now.debtTotal === 0
              ? 'Clear'
              : debtFreeMonth
                ? `Clear by ${debtFreeMonth.label}`
                : 'Not cleared within the plan'
          }
        />
        <Stat
          label="Sinking funds"
          value={money(now.fundsTotal, { decimals: false })}
          note={`${now.funds.filter((f) => f.target && f.balance >= f.target).length} of ${
            now.funds.filter((f) => f.target).length
          } targets met`}
        />
      </div>

      {(unbalanced.length > 0 || shortfalls.length > 0 || noPayslip.length > 0 || spendingAlert) && (
        <Card title="Needs attention" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {spending && spendingAlert && (
              <div className={`callout ${spending.status === 'spent-up' ? 'bad' : 'warn'}`}>
                {spending.status === 'spent-up'
                  ? `Guilt-free budget for ${now.label} ran out on the ${formatDayOfMonth(
                      current,
                      spending.ranOutOnDay!,
                    )}, ${money(Math.abs(spending.remaining))} over with ${spending.daysLeft} days left.`
                  : `${now.label}'s guilt-free spending is heading for ${money(
                      spending.forecast.median,
                    )} against a ${money(spending.budget)} budget — a ${Math.round(
                      spending.forecast.probabilityWithinBudget * 100,
                    )}% chance of staying inside it.`}{' '}
                <button className="btn ghost sm" onClick={() => onOpenMonth(current)}>
                  Open the month →
                </button>
              </div>
            )}
            {unbalanced.length > 0 && (
              <div className="callout bad">
                {unbalanced.length} month{unbalanced.length > 1 ? 's do' : ' does'} not balance:{' '}
                {unbalanced.map((m) => m.label).join(', ')}. Every penny of take-home must be
                allocated.
              </div>
            )}
            {shortfalls.length > 0 && (
              <div className="callout warn">
                Overcommitted in {shortfalls.map((m) => `${m.label} (${money(m.available)})`).join(', ')}.
                Reduce a contribution or a one-off in {shortfalls.length > 1 ? 'those months' : 'that month'} —
                the debt line cannot absorb a negative.
              </div>
            )}
            {noPayslip.length > 0 && (
              <div className="callout">
                No payslip imported for {noPayslip.map((m) => m.label).join(', ')}. Those months are
                still running on estimates.
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <Card title="Balances over time" sub={`${first.label} to ${last.label}`}>
          <BalancesChart plan={plan} />
        </Card>
        <Card title="Where each month goes" sub="Every month's take-home, fully allocated">
          <AllocationChart plan={plan} />
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Sinking funds" sub={`Balances at ${now.label}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {now.funds.length === 0 && <p>No funds set up yet. Add one in Settings.</p>}
            {now.funds.map((f, i) => (
              <div key={f.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <i className="swatch" style={{ background: colors.series[(i + 2) % 8] }} />
                  <strong style={{ fontSize: 13 }}>{f.name}</strong>
                  <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {money(f.balance)}
                  </span>
                </div>
                {f.target ? (
                  <FundMeter balance={f.balance} target={f.target} color={colors.series[(i + 2) % 8]} />
                ) : (
                  <div className="card-sub">
                    {money(f.appliedContribution)} in this month
                    {f.spent > 0 && ` · ${money(f.spent)} out`}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Month by month" sub="Click a month to open it">
          <div className="table-scroll" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Net pay</th>
                  <th>Savings</th>
                  <th>Debt</th>
                  <th>Net position</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plan.map((m) => (
                  <tr
                    key={m.month}
                    onClick={() => onOpenMonth(m.month)}
                    style={{ cursor: 'pointer' }}
                    className={m.month === current ? 'current-month' : undefined}
                  >
                    <td>
                      {monthLabel(m.month, true)}
                      {m.month === current && (
                        <span style={{ marginLeft: 8 }}>
                          <Badge tone="neutral">now</Badge>
                        </span>
                      )}
                    </td>
                    <td>
                      <Money n={m.net} />
                    </td>
                    <td>
                      <Money n={m.savingsBalance} />
                    </td>
                    <td>
                      <Money n={m.debtTotal} zeroDash />
                    </td>
                    <td>
                      <Money n={m.netPosition} />
                    </td>
                    <td>
                      {Math.abs(m.balanceCheck) > 0.005 ? (
                        <Badge tone="bad">off by {money(m.balanceCheck)}</Badge>
                      ) : m.available < 0 ? (
                        <Badge tone="warn">short</Badge>
                      ) : m.hasPayslip ? (
                        <Badge tone="good">payslip</Badge>
                      ) : (
                        <Badge tone="neutral">planned</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

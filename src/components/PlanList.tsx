import { money } from '../format';
import { monthLabel } from '../engine';
import { useStore } from '../store';
import { Badge } from './ui';
import type { MonthKey } from '../types';

/**
 * The plan on a phone. The grid is unusable at this width — a wide table dragged
 * sideways — so each month becomes a card you open, with the same figures.
 */
export function PlanList({ onOpenMonth }: { onOpenMonth: (m: MonthKey) => void }) {
  const { state, plan } = useStore();
  const cfg = state.config;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {plan.map((r) => (
        <details className="card card-collapsible" key={r.month}>
          <summary>
            <span className="collapsible-title">
              {monthLabel(r.month, true)}
              <span className="card-sub">{money(r.net)} take-home</span>
            </span>
            <span className="collapsible-summary">
              {Math.abs(r.balanceCheck) > 0.005 ? (
                <Badge tone="bad">off by {money(r.balanceCheck)}</Badge>
              ) : r.available < 0 ? (
                <Badge tone="warn">short</Badge>
              ) : (
                money(r.netPosition, { decimals: false })
              )}
            </span>
            <span className="collapsible-chevron" aria-hidden="true" />
          </summary>
          <div className="collapsible-body">
            <dl className="kv">
              <dt>Net take-home</dt>
              <dd>{money(r.net)}</dd>
              <dt>Fixed costs</dt>
              <dd>−{money(r.fixedTotal)}</dd>
              {r.oneOffTotal > 0 && (
                <>
                  <dt>One-offs</dt>
                  <dd>−{money(r.oneOffTotal)}</dd>
                </>
              )}
              <dt>Guilt-free</dt>
              <dd>−{money(r.guiltFree)}</dd>
              <dt>Savings contribution</dt>
              <dd>−{money(r.savingsContribution)}</dd>
              {r.funds.map((f) => (
                <div key={f.id} style={{ display: 'contents' }}>
                  <dt>
                    {f.name}
                    {f.spent > 0 && <span className="muted"> · {money(f.spent)} out</span>}
                  </dt>
                  <dd>{money(f.balance)}</dd>
                </div>
              ))}
              {r.debts
                .filter((d) => d.payment > 0 || d.endBalance > 0)
                .map((d) => (
                  <div key={d.id} style={{ display: 'contents' }}>
                    <dt>
                      {d.name}
                      {d.payment > 0 && <span className="muted"> · {money(d.payment)} paid</span>}
                    </dt>
                    <dd className={d.endBalance > 0 ? 'neg' : undefined}>{money(d.endBalance)}</dd>
                  </div>
                ))}
              {r.spillover > 0 && (
                <>
                  <dt>Spillover → savings</dt>
                  <dd>{money(r.spillover)}</dd>
                </>
              )}
              <dt>
                <strong>{cfg.savingsAccountName}</strong>
              </dt>
              <dd>
                <strong>{money(r.savingsBalance)}</strong>
              </dd>
              <dt>
                <strong>Net position</strong>
              </dt>
              <dd>
                <strong>{money(r.netPosition)}</strong>
              </dd>
            </dl>
            <button
              className="btn primary"
              style={{ marginTop: 12, width: '100%' }}
              onClick={() => onOpenMonth(r.month)}
            >
              Open {monthLabel(r.month, true)}
            </button>
          </div>
        </details>
      ))}
    </div>
  );
}

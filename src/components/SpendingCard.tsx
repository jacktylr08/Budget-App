import { useMemo, useState } from 'react';
import { SpendBurndownChart } from '../charts/Charts';
import { money } from '../format';
import { analyseSpending, formatDayOfMonth } from '../spending';
import { useStore } from '../store';
import { MonzoImport } from './MonzoImport';
import { Badge, Card, MoneyInput } from './ui';
import type { MonthKey, MonthResult, SpendEntry } from '../types';

/**
 * The headline verdict comes from the odds of finishing inside the budget, not from
 * whether today sits above a straight line — a big night on the 1st puts you "over
 * pace" for a fortnight while the month is in fact completely fine.
 */
function verdict(a: ReturnType<typeof analyseSpending>): { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' } {
  if (a.dayOfMonth === 0) return { label: 'not started', tone: 'neutral' };
  if (a.remaining <= 0) return { label: 'budget gone', tone: 'bad' };
  if (a.daysLeft === 0) return { label: 'finished inside', tone: 'good' };
  if (a.forecast.thin) return { label: 'early days', tone: 'neutral' };
  const p = a.forecast.probabilityWithinBudget;
  if (p >= 0.7) return { label: 'on track', tone: 'good' };
  if (p >= 0.4) return { label: 'tight', tone: 'warn' };
  return { label: 'off track', tone: 'bad' };
}

const todayIn = (month: MonthKey): string => {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return iso === month ? `${month}-${String(now.getDate()).padStart(2, '0')}` : `${month}-01`;
};

/**
 * "Spending this month" — where the guilt-free budget stands, when it runs out at the
 * current rate, and what to do about it.
 */
export function SpendingCard({ month, result }: { month: MonthKey; result: MonthResult }) {
  const { state, updateMonth } = useStore();
  const entry = state.months[month];
  const spends = useMemo(() => entry?.spends ?? [], [entry?.spends]);

  // Earlier months' logs, so a month only a few days old still has days to resample.
  const history = useMemo(
    () =>
      Object.values(state.months)
        .filter((e) => e.month < month && (e.spends?.length ?? 0) > 0)
        .map((e) => ({ month: e.month, spends: e.spends ?? [] })),
    [state.months, month],
  );

  // Offer the biggest fund as the emergency option in the advice.
  const biggestFund = [...result.funds].sort((a, b) => b.balance - a.balance)[0];

  const a = useMemo(
    () =>
      analyseSpending({
        month,
        budget: result.guiltFree,
        spends,
        fallbackTotal: entry?.actualGuiltFree ?? 0,
        bigNightThreshold: state.config.bigNightThreshold,
        fundName: biggestFund?.name,
        fundBalance: biggestFund?.balance ?? 0,
        history,
      }),
    [month, result.guiltFree, spends, entry?.actualGuiltFree, state.config.bigNightThreshold, biggestFund, history],
  );

  // Log individual spends, or just keep one number — both are always available.
  const [mode, setMode] = useState<'log' | 'total'>(spends.length > 0 ? 'log' : 'total');

  const [draft, setDraft] = useState<{ date: string; amount: number | undefined; note: string }>({
    date: todayIn(month),
    amount: undefined,
    note: '',
  });

  const addSpend = () => {
    if (!draft.amount) return;
    const next: SpendEntry = {
      id: `${month}-${Date.now()}`,
      date: draft.date,
      amount: draft.amount,
      note: draft.note.trim(),
    };
    updateMonth(month, (e) => ({ ...e, spends: [...(e.spends ?? []), next] }));
    setDraft({ date: todayIn(month), amount: undefined, note: '' });
  };

  const removeSpend = (id: string) =>
    updateMonth(month, (e) => ({ ...e, spends: (e.spends ?? []).filter((s) => s.id !== id) }));

  const f = a.forecast;
  const pc = (n: number) => `${Math.round(n * 100)}%`;

  // The headline is where the month lands and how sure that is — not a worst case.
  const outlook = (): { value: string; sub: string; tone: 'good' | 'warn' | 'bad' } => {
    if (a.dayOfMonth === 0) {
      return { value: money(a.budget, { decimals: false }), sub: 'not started yet', tone: 'good' };
    }
    if (a.daysLeft === 0) {
      return {
        value: money(a.spent, { decimals: false }),
        sub: a.remaining >= 0 ? `${money(a.remaining)} under budget` : `${money(-a.remaining)} over`,
        tone: a.remaining >= 0 ? 'good' : 'bad',
      };
    }
    const over = f.median - a.budget;
    return {
      value: money(f.median, { decimals: false }),
      sub:
        over > 0
          ? `${money(over, { decimals: false })} over budget`
          : `${money(-over, { decimals: false })} under budget`,
      tone: over > 0 ? 'bad' : 'good',
    };
  };
  const headline = outlook();
  const v = verdict(a);
  const oddsTone: 'good' | 'warn' | 'bad' =
    f.probabilityWithinBudget >= 0.7 ? 'good' : f.probabilityWithinBudget >= 0.4 ? 'warn' : 'bad';


  return (
    <Card
      title="Spending this month"
      sub={`${money(a.budget)} guilt-free budget`}
      actions={<Badge tone={v.tone}>{v.label}</Badge>}
    >
      <div className="spend-stats">
        <div>
          <div className="stat-label">Left to spend</div>
          <div className={`spend-figure ${a.remaining < 0 ? 'neg' : ''}`}>{money(a.remaining)}</div>
          <div className="card-sub">
            {a.daysLeft > 0
              ? `${money(a.spent)} gone · ${a.daysLeft} days left`
              : `${money(a.spent)} spent, month complete`}
          </div>
        </div>
        <div>
          <div className="stat-label">Heading for</div>
          <div className={`spend-figure ${headline.tone === 'bad' ? 'neg' : ''}`}>{headline.value}</div>
          <div className="card-sub">{headline.sub}</div>
        </div>
        <div>
          <div className="stat-label">Chance of staying in</div>
          <div className={`spend-figure ${oddsTone === 'bad' ? 'neg' : ''}`}>
            {a.daysLeft > 0 && !f.thin ? pc(f.probabilityWithinBudget) : '—'}
          </div>
          <div className="card-sub">
            {a.daysLeft === 0
              ? 'month finished'
              : f.thin
                ? 'not enough days logged yet'
                : `usually lands ${money(f.low, { decimals: false })}–${money(f.high, { decimals: false })}`}
          </div>
        </div>
        <div>
          <div className="stat-label">Safe per day</div>
          <div className="spend-figure">{money(a.dailyAllowance)}</div>
          <div className="card-sub">
            {f.quietDayShare > 0
              ? `on average — ${pc(f.quietDayShare)} of your days cost nothing`
              : 'average across the days left'}
          </div>
        </div>
      </div>

      {a.daysLeft > 0 && a.remaining > 0 && (
        <div className="shape-strip">
          <span className="shape-label">What that covers</span>
          <span className="shape-items">
            {a.shape.quietDays > 0 && <span className="shape-pill">{a.shape.quietDays} quiet days</span>}
            {a.shape.spendDays > 0 && (
              <span className="shape-pill">
                {a.shape.spendDays} days at ~{money(f.typicalSpendDay, { decimals: false })}
              </span>
            )}
            {a.shape.bigNights > 0 && (
              <span className="shape-pill strong">
                {a.shape.bigNights} night{a.shape.bigNights === 1 ? '' : 's'} out
              </span>
            )}
            {a.shape.bigNights === 0 && a.weekendNightsLeft > 0 && (
              <span className="shape-pill">no big nights</span>
            )}
          </span>
        </div>
      )}

      <div className="pace-track" style={{ margin: '14px 0 6px' }}>
        <div
          className="pace-fill"
          style={{
            width: `${Math.min(100, (a.spent / Math.max(a.budget, 1)) * 100)}%`,
            background:
              a.remaining < 0 ? 'var(--bad)' : v.tone === 'warn' ? 'var(--warn)' : 'var(--good)',
          }}
        />
      </div>
      <div className="card-sub" style={{ marginBottom: 14 }}>
        {money(a.spent)} of {money(a.budget)} used, day {a.dayOfMonth} of {a.daysInMonth}
        {a.spendDays > 0 && ` · ${a.spendDays} spend days, ${a.noSpendDays} quiet`}
        {a.bigNights.length > 0 &&
          `, ${a.bigNights.length} big night${a.bigNights.length === 1 ? '' : 's'}`}
      </div>

      {a.dayOfMonth > 0 && <SpendBurndownChart analysis={a} />}

      {a.tips.length > 0 && (
        <div className="tips">
          {a.tips.map((t) => (
            <div className={`tip ${t.tone}`} key={t.id}>
              <div className="tip-title">{t.title}</div>
              <p className="tip-body">{t.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="spend-log">
        <div className="card-head" style={{ marginBottom: 8 }}>
          <h3>Spend log</h3>
          <div className="chip-row" style={{ marginLeft: 10 }}>
            <button className="chip" aria-pressed={mode === 'log'} onClick={() => setMode('log')}>
              Log each spend
            </button>
            <button className="chip" aria-pressed={mode === 'total'} onClick={() => setMode('total')}>
              Running total
            </button>
          </div>
          <div className="spacer" />
          <span className="card-sub">
            {spends.length > 0
              ? `${spends.length} entr${spends.length === 1 ? 'y' : 'ies'} · ${a.bigNights.length} big night${
                  a.bigNights.length === 1 ? '' : 's'
                }`
              : 'nothing logged yet'}
          </span>
        </div>

      {mode === 'total' ? (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="field" style={{ maxWidth: 200 }}>
              <span>Spent so far this month</span>
              <MoneyInput
                value={entry?.actualGuiltFree}
                onChange={(n) => updateMonth(month, (e) => ({ ...e, actualGuiltFree: n }))}
              />
            </label>
            <p style={{ margin: 0, flex: 1, minWidth: 240 }}>
              One number, updated whenever you check your bank. Quick — but with no dates the
              projection has to assume you spend evenly, which no one does.
              {spends.length > 0 && (
                <>
                  {' '}
                  <strong>
                    {spends.length} logged spend{spends.length === 1 ? '' : 's'} are being used
                    instead of this figure.
                  </strong>
                </>
              )}
            </p>
          </div>
          <details className="disclose">
            <summary>Import from a Monzo CSV export</summary>
            <MonzoImport month={month} />
          </details>
        </>
      ) : (
        <>
        <div className="spend-add">
          <input
            type="date"
            value={draft.date}
            min={`${month}-01`}
            max={`${month}-${a.daysInMonth}`}
            onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            aria-label="Date of spend"
          />
          <MoneyInput
            value={draft.amount}
            onChange={(n) => setDraft((d) => ({ ...d, amount: n }))}
            placeholder="Amount"
            ariaLabel="Amount spent"
          />
          <input
            value={draft.note}
            placeholder="What was it? e.g. night out"
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && addSpend()}
            aria-label="Note"
          />
          <button className="btn primary" onClick={addSpend} disabled={!draft.amount}>
            Add
          </button>
        </div>

        <details className="disclose">
          <summary>Import from a Monzo CSV export</summary>
          <MonzoImport month={month} />
        </details>

        {spends.length > 0 && (
          <div className="spend-rows">
            {[...spends]
              .sort((x, y) => y.date.localeCompare(x.date))
              .map((s) => {
                // Classified by the day's total, so every payment from a big night is marked.
                const big = a.bigNights.some((b) => b.date === s.date);
                return (
                  <div className="spend-row" key={s.id}>
                    <span className="card-sub">{formatDayOfMonth(month, Number(s.date.slice(8, 10)))}</span>
                    <span>
                      {s.note || 'Spend'}
                      {big && (
                        <span style={{ marginLeft: 8 }} title="This day's total counts as a big night">
                          <Badge tone="neutral">big night</Badge>
                        </span>
                      )}
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {money(s.amount)}
                    </span>
                    <button className="btn ghost sm" aria-label={`Remove ${s.note || 'spend'}`} onClick={() => removeSpend(s.id)}>
                      ✕
                    </button>
                  </div>
                );
              })}
          </div>
        )}
        </>
      )}
      </div>
    </Card>
  );
}

import { useMemo, useState } from 'react';
import { SpendBurndownChart } from '../charts/Charts';
import { money } from '../format';
import { analyseSpending, formatDayOfMonth } from '../spending';
import { useStore } from '../store';
import { MonzoImport } from './MonzoImport';
import { Badge, Card, MoneyInput } from './ui';
import type { MonthKey, MonthResult, SpendEntry } from '../types';

const STATUS_TONE = {
  'not-started': 'neutral',
  'under-pace': 'good',
  'on-pace': 'good',
  'over-pace': 'warn',
  'spent-up': 'bad',
} as const;

const STATUS_LABEL = {
  'not-started': 'not started',
  'under-pace': 'under pace',
  'on-pace': 'on pace',
  'over-pace': 'over pace',
  'spent-up': 'budget gone',
} as const;

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
      }),
    [month, result.guiltFree, spends, entry?.actualGuiltFree, state.config.bigNightThreshold, biggestFund],
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

  // Lead with the realistic line (everyday spending), not an averaged-out worst case.
  const runOutHeadline = (): { value: string; sub: string; tone: 'good' | 'warn' | 'bad' } => {
    if (a.ranOutOnDay !== undefined) {
      return {
        value: `Ran out ${formatDayOfMonth(month, a.ranOutOnDay)}`,
        sub: `${money(Math.abs(a.remaining))} past budget`,
        tone: 'bad',
      };
    }
    if (a.projectionEveryday.runOutDay !== undefined) {
      return {
        value: formatDayOfMonth(month, a.projectionEveryday.runOutDay),
        sub: 'on your usual pattern, no nights out',
        tone: 'bad',
      };
    }
    if (a.projectionEveryWeekend.runOutDay !== undefined) {
      return {
        value: formatDayOfMonth(month, a.projectionEveryWeekend.runOutDay),
        sub: `only if all ${a.weekendNightsLeft} weekends are big`,
        tone: 'warn',
      };
    }
    return {
      value: 'Lasts the month',
      sub: `ends at ${money(a.projectionEveryday.endOfMonthTotal)} at this rate`,
      tone: 'good',
    };
  };
  const headline = runOutHeadline();

  return (
    <Card
      title="Spending this month"
      sub={`${money(a.budget)} guilt-free budget`}
      actions={<Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>}
    >
      <div className="spend-stats">
        <div>
          <div className="stat-label">Spent</div>
          <div className="spend-figure">{money(a.spent)}</div>
          <div className="card-sub">
            {a.dayOfMonth > 0 ? `by day ${a.dayOfMonth} of ${a.daysInMonth}` : 'not started'}
          </div>
        </div>
        <div>
          <div className="stat-label">Left</div>
          <div className={`spend-figure ${a.remaining < 0 ? 'neg' : ''}`}>{money(a.remaining)}</div>
          <div className="card-sub">
            {a.daysLeft > 0 ? `over ${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'}` : 'month complete'}
          </div>
        </div>
        <div>
          <div className="stat-label">Safe per day</div>
          <div className="spend-figure">{money(a.dailyAllowance)}</div>
          <div className="card-sub">
            {a.spendDays > 0
              ? `you spend on ${a.spendDays} of ${a.dayOfMonth} days, ${money(a.typicalSpendDay)} a time`
              : 'no everyday spending logged yet'}
          </div>
        </div>
        <div>
          <div className="stat-label">Money runs out</div>
          <div className={`spend-figure ${headline.tone === 'bad' ? 'neg' : ''}`}>{headline.value}</div>
          <div className="card-sub">{headline.sub}</div>
        </div>
      </div>

      <div className="pace-track" style={{ margin: '14px 0 6px' }}>
        <div
          className="pace-fill"
          style={{
            width: `${Math.min(100, (a.spent / Math.max(a.budget, 1)) * 100)}%`,
            background: a.remaining < 0 ? 'var(--bad)' : a.variance > 0 ? 'var(--warn)' : 'var(--good)',
          }}
        />
        {a.dayOfMonth > 0 && (
          <div
            className="pace-marker"
            style={{ left: `${(a.dayOfMonth / a.daysInMonth) * 100}%` }}
            title={`Even pace on day ${a.dayOfMonth}: ${money(a.expectedByNow)}`}
          />
        )}
      </div>
      <div className="card-sub" style={{ marginBottom: 14 }}>
        The marker is where even spending would have you today ({money(a.expectedByNow)}).
        {a.variance !== 0 &&
          ` You are ${money(Math.abs(a.variance))} ${a.variance > 0 ? 'ahead of' : 'behind'} it.`}
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

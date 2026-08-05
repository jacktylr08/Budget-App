import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { monthLabel } from '../engine';
import { money, moneyShort } from '../format';
import { summariseHistory } from '../history';
import { useStore } from '../store';
import { useThemeColors } from '../charts/Charts';
import { MonzoImport } from './MonzoImport';
import { Card, Stat } from './ui';

/**
 * The evidence page. Everything the plan's figures should be set from — what months
 * actually cost, how the days fall, and how often a big day really happens.
 */
export function History() {
  const { state, updateConfig } = useStore();
  const colors = useThemeColors();
  const h = useMemo(
    () => summariseHistory(state, state.config.bigNightThreshold),
    [state],
  );
  const budget = state.config.defaultGuiltFree;

  const chartData = h.months.map((m) => ({
    label: monthLabel(m.month),
    total: m.total,
    complete: m.complete,
  }));

  if (h.months.length === 0) {
    return (
      <Card title="No history yet" sub="Import a Monzo CSV to fill this in">
        <p>
          This page reads whatever is in your spend logs. Export a year from Monzo — open the
          Pot you spend from, then Export as CSV — and import it below. Everything after that
          is worked out from your own months rather than from an estimate.
        </p>
        <MonzoImport month={state.config.startMonth} />
      </Card>
    );
  }

  const over = budget - h.recentMedian;

  return (
    <>
      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <Stat
          label="Typical month"
          value={money(h.recentMedian, { decimals: false })}
          note={`median of your last ${Math.min(6, h.completeMonths.length)} complete months`}
        />
        <Stat
          label="Range"
          value={`${money(h.cheapestMonth, { decimals: false })}–${money(h.dearestMonth, { decimals: false })}`}
          note={`across ${h.completeMonths.length} complete months`}
        />
        <Stat
          label="Quiet days"
          value={`${Math.round(h.shape.quietShare * 100)}%`}
          note={`${h.shape.quietDays} of ${h.shape.days} days cost nothing`}
        />
        <Stat
          label="Big days"
          value={h.shape.bigDaysPerMonth.toFixed(1)}
          note={`per month, averaging ${money(h.shape.meanBigDay, { decimals: false })}`}
        />
      </div>

      {h.hasEnoughData && Math.abs(over) > 20 && (
        <Card style={{ marginBottom: 14 }}>
          <div className={`callout ${over > 0 ? 'good' : 'warn'}`}>
            <strong>
              Your guilt-free budget is {money(budget, { decimals: false })}; your recent months
              actually cost {money(h.recentMedian, { decimals: false })}.
            </strong>{' '}
            {over > 0 ? (
              <>
                That is {money(over, { decimals: false })} a month of headroom the plan is not
                using — {money(over * 12, { decimals: false })} a year that could go to savings or
                debt instead. Setting the budget to {money(h.suggestedBudget, { decimals: false })}{' '}
                still covers your dearest recent month with room to spare.
              </>
            ) : (
              <>
                You have been spending {money(-over, { decimals: false })} a month more than the
                budget allows. Either the budget is too tight to be real, or the extra is coming
                from somewhere the plan does not see.
              </>
            )}
          </div>
          <button
            className="btn primary"
            style={{ marginTop: 10 }}
            onClick={() => updateConfig({ defaultGuiltFree: h.suggestedBudget })}
          >
            Set guilt-free budget to {money(h.suggestedBudget, { decimals: false })}
          </button>
          <span className="card-sub" style={{ marginLeft: 10 }}>
            Applies to months you have not overridden.
          </span>
        </Card>
      )}

      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <Card
          title="What each month actually cost"
          sub={`Against a ${money(budget, { decimals: false })} budget`}
        >
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ top: 8, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: colors.text, fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fill: colors.text, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={moneyShort}
                width={50}
              />
              <Tooltip
                cursor={{ fill: colors.grid, opacity: 0.35 }}
                contentStyle={{
                  background: colors.surface,
                  border: '1px solid var(--border-strong)',
                  borderRadius: 8,
                  fontSize: 12.5,
                }}
                formatter={(v) => [money(Number(v)), 'Spent'] as [string, string]}
              />
              <ReferenceLine
                y={budget}
                stroke={colors.series[7]}
                strokeDasharray="4 3"
                label={{ value: 'Budget', position: 'insideTopRight', fill: colors.text, fontSize: 11 }}
              />
              <ReferenceLine y={h.recentMedian} stroke={colors.series[2]} strokeDasharray="2 3" />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} stroke={colors.surface} strokeWidth={2}>
                {chartData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={!d.complete ? colors.muted : d.total > budget ? colors.series[7] : colors.series[0]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="legend" style={{ marginTop: 8 }}>
            <span className="item">
              <i className="swatch" style={{ background: colors.series[0] }} /> inside budget
            </span>
            <span className="item">
              <i className="swatch" style={{ background: colors.series[7] }} /> over
            </span>
            <span className="item">
              <i className="swatch" style={{ background: colors.muted }} /> month in progress
            </span>
            <span className="item">
              <span style={{ borderTop: `2px dashed ${colors.series[2]}`, width: 14 }} /> your median
            </span>
          </div>
        </Card>

        <Card title="How your days fall" sub={`${h.shape.days} days of history`}>
          <dl className="kv" style={{ marginBottom: 14 }}>
            <dt>Days costing nothing</dt>
            <dd>
              {h.shape.quietDays} of {h.shape.days} ({Math.round(h.shape.quietShare * 100)}%)
            </dd>
            <dt>Typical spend day</dt>
            <dd>{money(h.shape.medianSpendDay)}</dd>
            <dt>Dearer day (1 in 4)</dt>
            <dd>{money(h.shape.p75)}</dd>
            <dt>Big day (1 in 10)</dt>
            <dd>{money(h.shape.p90)}</dd>
            <dt>Rare day (1 in 20)</dt>
            <dd>{money(h.shape.p95)}</dd>
            <dt>Biggest day on record</dt>
            <dd>{money(h.shape.biggestDay)}</dd>
            <dt>
              Days over {money(state.config.bigNightThreshold, { decimals: false })}
            </dt>
            <dd>
              {h.shape.bigDaysPerMonth.toFixed(1)} a month ·{' '}
              {Math.round(h.shape.bigDayShareOfSpend * 100)}% of all spending
            </dd>
          </dl>

          <h3 style={{ marginBottom: 8 }}>By day of the week</h3>
          <div className="weekday-grid">
            {h.shape.byWeekday.map((d) => {
              const max = Math.max(...h.shape.byWeekday.map((x) => x.mean), 1);
              return (
                <div key={d.name} className="weekday">
                  <span className="weekday-name">{d.name}</span>
                  <span className="weekday-bar">
                    <i
                      style={{
                        width: `${(d.mean / max) * 100}%`,
                        background: d.mean >= max * 0.8 ? colors.series[7] : colors.series[0],
                      }}
                    />
                  </span>
                  <span className="weekday-value">{money(d.mean)}</span>
                  <span className="weekday-odds card-sub">
                    {Math.round(d.spendDayOdds * 100)}% of days
                  </span>
                </div>
              );
            })}
          </div>
          <p className="card-sub" style={{ marginTop: 10 }}>
            Average per day, including the days you spend nothing. The forecast draws
            weekends from your weekends and weekdays from your weekdays.
          </p>
        </Card>
      </div>

      <Card title="Import more history" sub="A year of it makes every forecast sharper">
        <MonzoImport month={state.config.startMonth} />
      </Card>
    </>
  );
}

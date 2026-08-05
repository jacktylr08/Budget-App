import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { money, moneyShort } from '../format';
import type { SpendingAnalysis } from '../spending';
import type { MonthResult } from '../types';

/**
 * Recharts writes colours into SVG presentation attributes, which do not resolve
 * `var(--x)`, so the theme's values are read off the document and re-read whenever
 * the theme changes.
 */
export function useThemeColors() {
  const read = () => {
    const s = getComputedStyle(document.documentElement);
    const v = (name: string) => s.getPropertyValue(name).trim();
    return {
      series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--series-${i}`)),
      surface: v('--surface-1'),
      grid: v('--border'),
      text: v('--text-secondary'),
      muted: v('--text-muted'),
      good: v('--good'),
      bad: v('--bad'),
    };
  };
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const update = () => setColors(read());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    return () => {
      observer.disconnect();
      mq.removeEventListener('change', update);
    };
  }, []);
  return colors;
}

interface TooltipEntry {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
}

function MoneyTooltip({
  active,
  payload,
  label,
  total,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  total?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value !== undefined);
  const sum = rows.reduce((a, r) => a + (r.value ?? 0), 0);
  return (
    <div className="tooltip-card">
      <div className="t-title">{label}</div>
      {rows.map((r) => (
        <div className="t-row" key={r.dataKey}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i
              className="swatch"
              style={{ background: r.color, display: 'inline-block', width: 9, height: 9, borderRadius: 3 }}
            />
            {r.name}
          </span>
          <span>{money(r.value ?? 0)}</span>
        </div>
      ))}
      {total && rows.length > 1 && (
        <div className="t-row" style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid var(--border)' }}>
          <span>Total</span>
          <span>{money(sum)}</span>
        </div>
      )}
    </div>
  );
}

const axisProps = (text: string) => ({
  tick: { fill: text, fontSize: 11 },
  tickLine: false,
  axisLine: false,
});

/** Savings, sinking funds, debt and overall net position, month by month. */
export function BalancesChart({ plan }: { plan: MonthResult[] }) {
  const c = useThemeColors();
  const data = useMemo(
    () =>
      plan.map((m) => ({
        label: m.label,
        Savings: m.savingsBalance,
        'Sinking funds': m.fundsTotal,
        'Debt owed': m.debtTotal,
        'Net position': m.netPosition,
      })),
    [plan],
  );
  const series = [
    { key: 'Net position', color: c.series[6], width: 2.5 },
    { key: 'Savings', color: c.series[0], width: 2 },
    { key: 'Sinking funds', color: c.series[2], width: 2 },
    { key: 'Debt owed', color: c.series[7], width: 2 },
  ];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(c.text)} />
        <YAxis {...axisProps(c.text)} tickFormatter={moneyShort} width={56} />
        <Tooltip content={<MoneyTooltip />} cursor={{ stroke: c.muted, strokeWidth: 1 }} />
        <Legend
          verticalAlign="top"
          align="left"
          height={28}
          iconType="plainline"
          wrapperStyle={{ fontSize: 12, color: c.text }}
        />
        <ReferenceLine y={0} stroke={c.grid} />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={s.width}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Where each month's take-home actually goes. */
export function AllocationChart({ plan }: { plan: MonthResult[] }) {
  const c = useThemeColors();
  const data = useMemo(
    () =>
      plan.map((m) => ({
        label: m.label,
        'Fixed costs': m.fixedTotal,
        'One-offs': m.oneOffTotal,
        'Guilt-free': m.guiltFree,
        Savings: m.savingsContribution,
        'Sinking funds': m.fundIn,
        Debt: m.manualDebtTotal + m.autoDebtTotal,
        Spillover: m.spillover,
      })),
    [plan],
  );
  const keys = ['Fixed costs', 'One-offs', 'Guilt-free', 'Savings', 'Sinking funds', 'Debt', 'Spillover'];
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(c.text)} />
        <YAxis {...axisProps(c.text)} tickFormatter={moneyShort} width={56} />
        <Tooltip content={<MoneyTooltip total />} cursor={{ fill: c.grid, opacity: 0.35 }} />
        <Legend verticalAlign="top" align="left" height={28} wrapperStyle={{ fontSize: 12, color: c.text }} />
        {keys.map((k, i) => (
          <Bar
            key={k}
            dataKey={k}
            stackId="a"
            fill={c.series[i]}
            stroke={c.surface}
            strokeWidth={2}
            radius={i === keys.length - 1 ? [4, 4, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** A single fund's balance against its target. */
export function FundMeter({
  balance,
  target,
  color,
}: {
  balance: number;
  target?: number;
  color: string;
}) {
  if (!target) return null;
  const ratio = Math.max(0, Math.min(1, balance / target));
  return (
    <div className="pace">
      <div className="pace-track">
        <div className="pace-fill" style={{ width: `${ratio * 100}%`, background: color }} />
      </div>
      <div className="card-sub">
        {money(balance)} of {money(target)} · {Math.round(ratio * 100)}%
      </div>
    </div>
  );
}

/**
 * The month's spending: what has actually gone, then the range the rest of the month
 * lands in. The band is the middle 80% of a couple of thousand simulated months drawn
 * from your own days, so it widens exactly as far as your own variation justifies.
 */
export function SpendBurndownChart({
  analysis,
  height = 230,
}: {
  analysis: SpendingAnalysis;
  height?: number;
}) {
  const c = useThemeColors();
  const { dayOfMonth, budget, forecast } = analysis;

  const data = useMemo(() => {
    const bandByDay = new Map(forecast.bands.map((b) => [b.day, b]));
    return analysis.cumulativeByDay.map(({ day, spent, budgetLine }) => {
      const band = bandByDay.get(day);
      return {
        day,
        Pace: budgetLine,
        Spent: spent,
        // Recharts draws a two-value array as a band between the two.
        range: band ? [band.low, band.high] : null,
        Likely: band ? band.mid : null,
      };
    });
  }, [analysis.cumulativeByDay, forecast.bands]);

  const runOut = analysis.ranOutOnDay ?? forecast.likelyRunOutDay;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="day" {...axisProps(c.text)} interval={4} />
        <YAxis {...axisProps(c.text)} tickFormatter={moneyShort} width={48} />
        <Tooltip
          content={<MoneyTooltip />}
          labelFormatter={(d) => `Day ${d}`}
          cursor={{ stroke: c.muted, strokeWidth: 1 }}
        />
        <Legend
          verticalAlign="top"
          align="left"
          height={26}
          iconType="plainline"
          wrapperStyle={{ fontSize: 11.5, color: c.text }}
        />
        <ReferenceLine
          y={budget}
          stroke={c.bad}
          strokeDasharray="2 3"
          label={{ value: 'Budget', position: 'insideTopRight', fill: c.text, fontSize: 11 }}
        />
        {runOut !== undefined && forecast.probabilityRunOut >= 0.25 && (
          <ReferenceLine x={runOut} stroke={c.bad} strokeDasharray="3 3" strokeWidth={1.5} />
        )}
        <Area
          dataKey="range"
          name="Likely range"
          stroke="none"
          fill={c.series[0]}
          fillOpacity={0.16}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="Likely"
          name="Most likely"
          stroke={c.series[0]}
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          connectNulls
        />
        <Line type="linear" dataKey="Pace" stroke={c.muted} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
        <Line
          type="monotone"
          dataKey="Spent"
          stroke={c.series[0]}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }}
          connectNulls={false}
        />
        {dayOfMonth > 0 && <ReferenceLine x={dayOfMonth} stroke={c.muted} strokeDasharray="2 2" />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

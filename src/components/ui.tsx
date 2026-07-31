import React, { useEffect, useRef, useState } from 'react';
import { money } from '../format';

export function Card({
  title,
  sub,
  actions,
  children,
  style,
}: {
  title?: string;
  sub?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section className="card" style={style}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {actions && <div className="spacer" />}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: React.ReactNode;
  tone?: 'good' | 'bad' | 'warn';
}) {
  const color = tone ? `var(--${tone})` : undefined;
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>
        {value}
      </div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

/**
 * A number input that only commits on blur/Enter, so typing "1" on the way to
 * "150" does not send a half-finished figure through the plan.
 */
export function MoneyInput({
  value,
  onChange,
  placeholder,
  className = '',
  ariaLabel,
  allowNegative = false,
}: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  allowNegative?: boolean;
}) {
  const [draft, setDraft] = useState<string>(value === undefined ? '' : String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value === undefined ? '' : String(value));
  }, [value]);

  const commit = () => {
    focused.current = false;
    const trimmed = draft.trim();
    if (trimmed === '') return onChange(undefined);
    const n = Number(trimmed.replace(/[£,\s]/g, ''));
    if (!Number.isFinite(n)) return setDraft(value === undefined ? '' : String(value));
    onChange(allowNegative ? n : Math.max(0, n));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      className={className}
      placeholder={placeholder}
      value={draft}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(value === undefined ? '' : String(value));
          e.currentTarget.blur();
        }
      }}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    />
  );
}

export function Money({ n, sign = false, zeroDash = false }: { n: number; sign?: boolean; zeroDash?: boolean }) {
  if (zeroDash && n === 0) return <span className="muted">—</span>;
  const cls = n < 0 ? 'neg' : sign && n > 0 ? 'pos' : undefined;
  return <span className={cls}>{money(n, { sign })}</span>;
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
  children: React.ReactNode;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <span className="card-sub">{hint}</span>}
    </label>
  );
}

export const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
  'var(--series-8)',
];

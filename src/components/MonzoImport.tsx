import { useMemo, useRef, useState } from 'react';
import { money } from '../format';
import { monthLabel } from '../engine';
import {
  DEFAULT_EXCLUDED_CATEGORIES,
  mergeSpends,
  parseMonzoCsv,
  rowsToSpends,
  type MonzoParseResult,
} from '../monzoCsv';
import { useStore } from '../store';
import type { MonthKey } from '../types';

/**
 * Imports a Monzo CSV export into the spend log. Categories are chosen before anything
 * is written, since most of a statement (rent, bills, transfers) is not guilt-free
 * spending and is already budgeted elsewhere in the plan.
 */
export function MonzoImport({ month }: { month: MonthKey }) {
  const { updateMonth, state } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<MonzoParseResult | null>(null);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<MonthKey>(month);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setDone(null);
    try {
      const result = parseMonzoCsv(await file.text());
      setParsed(result);
      // Everything except the categories that are never discretionary.
      setIncluded(
        new Set(
          result.categories
            .filter((c) => !DEFAULT_EXCLUDED_CATEGORIES.includes(c.name.toLowerCase()))
            .map((c) => c.name),
        ),
      );
      if (result.months.length && !result.months.includes(month)) setTarget(result.months[0]);
      else setTarget(month);
    } catch (e) {
      setError(`Could not read that file: ${(e as Error).message}`);
    }
  };

  const preview = useMemo(
    () => (parsed ? rowsToSpends(parsed.rows, target, included) : []),
    [parsed, target, included],
  );
  const previewTotal = preview.reduce((a, s) => a + s.amount, 0);

  const apply = () => {
    let added = 0;
    let skipped = 0;
    updateMonth(target, (e) => {
      const result = mergeSpends(e.spends ?? [], preview);
      added = result.added;
      skipped = result.skipped;
      return { ...e, spends: result.merged };
    });
    setDone(
      `Added ${added} spend${added === 1 ? '' : 's'} to ${monthLabel(target, true)}${
        skipped > 0 ? `, skipping ${skipped} already imported` : ''
      }.`,
    );
    setParsed(null);
  };

  const toggle = (name: string) =>
    setIncluded((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Choose Monzo CSV
        </button>
        <span className="card-sub">Monzo app → Account → Statements → Export as CSV</span>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {error && <div className="callout bad">{error}</div>}
      {done && <div className="callout good">{done}</div>}

      {parsed && parsed.rows.length === 0 && (
        <div className="callout warn">{parsed.warnings[0] ?? 'Nothing spendable in that file.'}</div>
      )}

      {parsed && parsed.rows.length > 0 && (
        <>
          {parsed.warnings.map((w) => (
            <div className="callout" key={w}>
              {w}
            </div>
          ))}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <span>Import into</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 'auto' }}>
                {[...new Set([...parsed.months, month])].sort().map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m, true)}
                  </option>
                ))}
              </select>
            </label>
            <span className="card-sub">
              file covers {parsed.months.map((m) => monthLabel(m)).join(', ')}
            </span>
          </div>

          <div>
            <div className="card-sub" style={{ marginBottom: 6 }}>
              Which of these count as guilt-free spending? Rent, bills and transfers are
              budgeted elsewhere in the plan, so they are off by default.
            </div>
            <div className="chip-row">
              {parsed.categories.map((c) => (
                <button
                  key={c.name}
                  className="chip"
                  aria-pressed={included.has(c.name)}
                  onClick={() => toggle(c.name)}
                >
                  {c.name} · {money(c.total, { decimals: false })}
                </button>
              ))}
            </div>
          </div>

          <div className="callout">
            {preview.length} spend{preview.length === 1 ? '' : 's'} totalling{' '}
            <strong>{money(previewTotal)}</strong> will be added to {monthLabel(target, true)}.
            {(state.months[target]?.spends?.length ?? 0) > 0 &&
              ' Anything already imported from this file is skipped.'}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" onClick={apply} disabled={preview.length === 0}>
              Import {preview.length} spend{preview.length === 1 ? '' : 's'}
            </button>
            <button className="btn ghost" onClick={() => setParsed(null)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

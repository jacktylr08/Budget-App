import { useMemo, useRef, useState } from 'react';
import { money } from '../format';
import { monthLabel } from '../engine';
import {
  DEFAULT_EXCLUDED_CATEGORIES,
  mergeSpends,
  parseMonzoCsv,
  rowsToSpends,
  rowsToSpendsByMonth,
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
  const { updateMonth } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<MonzoParseResult | null>(null);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<MonthKey>(month);
  // A year of history in one go is what makes the forecast worth trusting.
  const [allMonths, setAllMonths] = useState(true);
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

  const byMonth = useMemo(
    () => (parsed && allMonths ? rowsToSpendsByMonth(parsed.rows, included) : null),
    [parsed, allMonths, included],
  );
  const preview = useMemo(
    () => (parsed && !allMonths ? rowsToSpends(parsed.rows, target, included) : []),
    [parsed, allMonths, target, included],
  );
  const previewCount = byMonth
    ? Object.values(byMonth).reduce((a, s) => a + s.length, 0)
    : preview.length;
  const previewTotal = byMonth
    ? Object.values(byMonth).flat().reduce((a, s) => a + s.amount, 0)
    : preview.reduce((a, s) => a + s.amount, 0);

  const apply = () => {
    let added = 0;
    let skipped = 0;
    const months = byMonth ?? { [target]: preview };
    for (const [m, spends] of Object.entries(months)) {
      updateMonth(m, (e) => {
        const result = mergeSpends(e.spends ?? [], spends);
        added += result.added;
        skipped += result.skipped;
        return { ...e, spends: result.merged };
      });
    }
    const count = Object.keys(months).length;
    setDone(
      `Added ${added} spend${added === 1 ? '' : 's'} across ${count} month${count === 1 ? '' : 's'}${
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
            <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}>
              <input
                type="checkbox"
                style={{ width: 'auto', minHeight: 0 }}
                checked={allMonths}
                onChange={(e) => setAllMonths(e.target.checked)}
              />
              Import all {parsed.months.length} month{parsed.months.length === 1 ? '' : 's'} in the file
            </label>
            {!allMonths && (
              <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <span>into</span>
                <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 'auto' }}>
                  {[...new Set([...parsed.months, month])].sort().map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m, true)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {allMonths && (
            <div className="table-scroll" style={{ maxHeight: 190, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Spends</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.months.map((m) => (
                    <tr key={m}>
                      <td>{monthLabel(m, true)}</td>
                      <td>{byMonth?.[m]?.length ?? 0}</td>
                      <td>{money((byMonth?.[m] ?? []).reduce((a, s) => a + s.amount, 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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
            {previewCount} spend{previewCount === 1 ? '' : 's'} totalling{' '}
            <strong>{money(previewTotal)}</strong> will be added
            {allMonths
              ? ` across ${parsed.months.length} month${parsed.months.length === 1 ? '' : 's'}`
              : ` to ${monthLabel(target, true)}`}
            . Anything already imported is skipped, and entries you typed yourself are left alone.
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" onClick={apply} disabled={previewCount === 0}>
              Import {previewCount} spend{previewCount === 1 ? '' : 's'}
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

import { useMemo, useRef, useState } from 'react';
import { applyParsed, extractText, parsePayslip } from '../payslip';
import { monthLabel } from '../engine';
import { money } from '../format';
import { useStore } from '../store';
import { Badge, MoneyInput } from './ui';
import type { MonthKey, PayslipField } from '../types';

const FIELD_LABELS: Record<PayslipField, string> = {
  gross: 'Gross / basic pay',
  bonus: 'Bonus',
  reimbursement: 'Expenses reimbursed',
  incomeTax: 'Income tax',
  nationalInsurance: 'National Insurance',
  pension: 'Pension',
  studentLoan: 'Student loan',
  net: 'Net pay (as printed)',
};

const ORDER: PayslipField[] = [
  'gross',
  'bonus',
  'reimbursement',
  'incomeTax',
  'nationalInsurance',
  'pension',
  'studentLoan',
  'net',
];

/**
 * Drop a payslip (PDF, text or CSV) or paste its contents. Everything it finds is
 * shown for review — nothing is written to the plan until you press Apply.
 */
export function PayslipImport({
  month,
  onApplied,
}: {
  month: MonthKey;
  onApplied: (target: MonthKey) => void;
}) {
  const { state, updateMonth } = useStore();
  const [text, setText] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Partial<Record<PayslipField, number>> | null>(null);
  const [target, setTarget] = useState<MonthKey>(month);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(
    () => (text.trim() ? parsePayslip(text, state.config.payslipMappings) : null),
    [text, state.config.payslipMappings],
  );

  const runParse = (raw: string) => {
    setText(raw);
    const result = parsePayslip(raw, state.config.payslipMappings);
    setValues(
      Object.fromEntries(
        ORDER.map((f) => [f, result.fields[f]?.value]).filter(([, v]) => v !== undefined),
      ) as Partial<Record<PayslipField, number>>,
    );
    if (result.detectedMonth) setTarget(result.detectedMonth);
  };

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      runParse(await extractText(file));
    } catch (e) {
      setError(
        `Could not read ${file.name}. If it is a scanned image, copy the figures in by hand below. (${
          (e as Error).message
        })`,
      );
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!values) return;
    updateMonth(target, (e) => ({ ...e, income: applyParsed(e.income, values) }));
    setText('');
    setValues(null);
    onApplied(target);
  };

  const computedNet =
    values &&
    (values.gross ?? 0) +
      (values.bonus ?? 0) +
      (values.reimbursement ?? 0) -
      ((values.incomeTax ?? 0) +
        (values.nationalInsurance ?? 0) +
        (values.pension ?? 0) +
        (values.studentLoan ?? 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          {busy ? 'Reading payslip…' : 'Drop this month’s payslip here'}
        </div>
        <div className="card-sub" style={{ marginBottom: 10 }}>
          PDF, text or CSV. It is read in your browser and never uploaded anywhere.
        </div>
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          Choose a file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.csv,.tsv,text/*"
          hidden
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {error && <div className="callout bad">{error}</div>}

      <details className="disclose">
        <summary>Or paste the payslip text</summary>
        <textarea
          rows={6}
          placeholder={'Basic Pay 2,250.00\nPAYE Tax 369.40\nNational Insurance 147.78\nNet Pay 1,879.42'}
          value={text}
          onChange={(e) => runParse(e.target.value)}
          style={{ marginTop: 8 }}
        />
      </details>

      {values && (
        <>
          {parsed?.warnings.map((w) => (
            <div className="callout warn" key={w}>
              {w}
            </div>
          ))}

          <div>
            <div className="card-head" style={{ marginBottom: 8 }}>
              <h3>Found on the payslip</h3>
              <div className="spacer" />
              <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <span>Apply to</span>
                <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 'auto' }}>
                  {Object.keys(state.months)
                    .concat(target)
                    .filter((m, i, a) => a.indexOf(m) === i)
                    .sort()
                    .map((m) => (
                      <option key={m} value={m}>
                        {monthLabel(m, true)}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {ORDER.map((f) => {
                const hit = parsed?.fields[f];
                return (
                  <div className="list-row" key={f}>
                    <div>
                      <div style={{ fontSize: 13 }}>{FIELD_LABELS[f]}</div>
                      <div className="card-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>
                        {hit ? `matched “${hit.matchedLabel}” · ${hit.evidence}` : 'not found — enter it if it applies'}
                      </div>
                    </div>
                    <MoneyInput
                      value={values[f]}
                      allowNegative
                      onChange={(n) => setValues((v) => ({ ...v, [f]: n }))}
                    />
                    {hit ? <Badge tone="good">read</Badge> : <Badge tone="neutral">blank</Badge>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="callout">
            {values.net !== undefined ? (
              <>
                Gross less deductions comes to <strong>{money(computedNet ?? 0)}</strong> and the
                payslip states <strong>{money(values.net)}</strong>. The stated figure is what gets
                allocated.
              </>
            ) : (
              <>
                Gross less deductions comes to <strong>{money(computedNet ?? 0)}</strong>, which is
                what will be allocated.
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" onClick={apply}>
              Apply to {monthLabel(target, true)}
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setValues(null);
                setText('');
              }}
            >
              Discard
            </button>
          </div>
        </>
      )}
    </div>
  );
}

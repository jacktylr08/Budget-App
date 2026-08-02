import { useRef, useState } from 'react';
import { monthLabel } from '../engine';
import { useStore } from '../store';
import { Card, Field, MoneyInput } from './ui';
import { DEFAULT_PAYSLIP_MAPPINGS } from '../defaults';
import type { Debt, Fund, LineItem, PayslipField } from '../types';

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

export function Settings() {
  const { state, updateConfig, reset, exportJson, importJson } = useStore();
  const cfg = state.config;
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const patchFixed = (id: string, patch: Partial<LineItem>) =>
    updateConfig({ fixedCosts: cfg.fixedCosts.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const patchFund = (id: string, patch: Partial<Fund>) =>
    updateConfig({ funds: cfg.funds.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const patchDebt = (id: string, patch: Partial<Debt>) =>
    updateConfig({ debts: cfg.debts.map((d) => (d.id === id ? { ...d, ...patch } : d)) });

  return (
    <div className="grid cols-2">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card title="Plan window" sub="Which months the app shows and projects">
          <div className="grid cols-2" style={{ gap: 10 }}>
            <Field label="First month">
              <input
                type="month"
                value={cfg.startMonth}
                onChange={(e) => updateConfig({ startMonth: e.target.value })}
              />
            </Field>
            <Field label="Number of months">
              <input
                type="number"
                min={1}
                max={60}
                value={cfg.monthCount}
                onChange={(e) =>
                  updateConfig({ monthCount: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })
                }
              />
            </Field>
          </div>
          <p className="card-sub" style={{ marginTop: 8 }}>
            Currently {monthLabel(cfg.startMonth, true)} onwards, {cfg.monthCount} months.
          </p>
        </Card>

        <Card title="Savings and defaults" sub="Applied to any month you have not overridden">
          <div className="grid cols-2" style={{ gap: 10 }}>
            <Field label="Savings account name">
              <input
                value={cfg.savingsAccountName}
                onChange={(e) => updateConfig({ savingsAccountName: e.target.value })}
              />
            </Field>
            <Field label="Opening balance">
              <MoneyInput
                value={cfg.savingsOpeningBalance}
                onChange={(n) => updateConfig({ savingsOpeningBalance: n ?? 0 })}
              />
            </Field>
            <Field label="Default monthly contribution">
              <MoneyInput
                value={cfg.defaultSavingsContribution}
                onChange={(n) => updateConfig({ defaultSavingsContribution: n ?? 0 })}
              />
            </Field>
            <Field label="Default guilt-free budget" hint="Set from evidence, not aspiration">
              <MoneyInput
                value={cfg.defaultGuiltFree}
                onChange={(n) => updateConfig({ defaultGuiltFree: n ?? 0 })}
              />
            </Field>
            <Field
              label="A night out costs at least"
              hint="Spends this size are counted separately from everyday spending"
            >
              <MoneyInput
                value={cfg.bigNightThreshold}
                onChange={(n) => updateConfig({ bigNightThreshold: n ?? 50 })}
              />
            </Field>
          </div>
        </Card>

        <Card
          title="Fixed costs"
          sub="Default amount for every month"
          actions={
            <button
              className="btn sm"
              onClick={() =>
                updateConfig({
                  fixedCosts: [...cfg.fixedCosts, { id: uid('fixed'), name: 'New cost', defaultAmount: 0 }],
                })
              }
            >
              Add
            </button>
          }
        >
          {cfg.fixedCosts.map((line) => (
            <div className="list-row" key={line.id}>
              <input value={line.name} onChange={(e) => patchFixed(line.id, { name: e.target.value })} />
              <MoneyInput value={line.defaultAmount} onChange={(n) => patchFixed(line.id, { defaultAmount: n ?? 0 })} />
              <button
                className="btn ghost sm"
                aria-label={`Remove ${line.name}`}
                onClick={() => updateConfig({ fixedCosts: cfg.fixedCosts.filter((l) => l.id !== line.id) })}
              >
                ✕
              </button>
            </div>
          ))}
        </Card>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card
          title="Sinking funds"
          sub="Pots you pay into for known future costs"
          actions={
            <button
              className="btn sm"
              onClick={() =>
                updateConfig({
                  funds: [
                    ...cfg.funds,
                    { id: uid('fund'), name: 'New fund', openingBalance: 0, defaultContribution: 0 },
                  ],
                })
              }
            >
              Add
            </button>
          }
        >
          {cfg.funds.map((f) => (
            <div key={f.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input value={f.name} onChange={(e) => patchFund(f.id, { name: e.target.value })} />
                <button
                  className="btn ghost sm"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => updateConfig({ funds: cfg.funds.filter((x) => x.id !== f.id) })}
                >
                  ✕
                </button>
              </div>
              <div className="grid cols-3" style={{ gap: 8 }}>
                <Field label="Opening balance">
                  <MoneyInput value={f.openingBalance} onChange={(n) => patchFund(f.id, { openingBalance: n ?? 0 })} />
                </Field>
                <Field label="Default monthly">
                  <MoneyInput
                    value={f.defaultContribution}
                    onChange={(n) => patchFund(f.id, { defaultContribution: n ?? 0 })}
                  />
                </Field>
                <Field label="Target">
                  <MoneyInput value={f.target} onChange={(n) => patchFund(f.id, { target: n })} />
                </Field>
              </div>
              <label style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 8, fontSize: 12.5 }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={!!f.capAtTarget}
                  onChange={(e) => patchFund(f.id, { capAtTarget: e.target.checked })}
                />
                Stop contributing once the target is reached
              </label>
            </div>
          ))}
        </Card>

        <Card
          title="Debts"
          sub="Automatic debts are paid with whatever is left, in priority order"
          actions={
            <button
              className="btn sm"
              onClick={() =>
                updateConfig({
                  debts: [
                    ...cfg.debts,
                    {
                      id: uid('debt'),
                      name: 'New debt',
                      openingBalance: 0,
                      mode: 'auto',
                      priority: cfg.debts.length,
                    },
                  ],
                })
              }
            >
              Add
            </button>
          }
        >
          {cfg.debts.map((d) => (
            <div key={d.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input value={d.name} onChange={(e) => patchDebt(d.id, { name: e.target.value })} />
                <button
                  className="btn ghost sm"
                  aria-label={`Remove ${d.name}`}
                  onClick={() => updateConfig({ debts: cfg.debts.filter((x) => x.id !== d.id) })}
                >
                  ✕
                </button>
              </div>
              <div className="grid cols-3" style={{ gap: 8 }}>
                <Field label="Opening balance">
                  <MoneyInput value={d.openingBalance} onChange={(n) => patchDebt(d.id, { openingBalance: n ?? 0 })} />
                </Field>
                <Field label="Payment">
                  <select
                    value={d.mode}
                    onChange={(e) => patchDebt(d.id, { mode: e.target.value as Debt['mode'] })}
                  >
                    <option value="auto">Whatever is left</option>
                    <option value="manual">Fixed amount I set</option>
                  </select>
                </Field>
                <Field label={d.mode === 'auto' ? 'Priority (low pays first)' : 'Default payment'}>
                  {d.mode === 'auto' ? (
                    <input
                      type="number"
                      value={d.priority}
                      onChange={(e) => patchDebt(d.id, { priority: Number(e.target.value) || 0 })}
                    />
                  ) : (
                    <MoneyInput value={d.defaultPayment} onChange={(n) => patchDebt(d.id, { defaultPayment: n })} />
                  )}
                </Field>
              </div>
              <Field label="Note">
                <input
                  value={d.note ?? ''}
                  placeholder="e.g. 0% ends January 2027"
                  onChange={(e) => patchDebt(d.id, { note: e.target.value })}
                />
              </Field>
            </div>
          ))}
        </Card>

        <Card title="Payslip labels" sub="Comma-separated wording to look for on your payslip">
          {(Object.keys(cfg.payslipMappings) as PayslipField[]).map((field) => (
            <Field key={field} label={field.replace(/([A-Z])/g, ' $1').toLowerCase()}>
              <input
                value={cfg.payslipMappings[field].join(', ')}
                onChange={(e) =>
                  updateConfig({
                    payslipMappings: {
                      ...cfg.payslipMappings,
                      [field]: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    },
                  })
                }
              />
            </Field>
          ))}
          <button
            className="btn sm"
            style={{ marginTop: 10 }}
            onClick={() => updateConfig({ payslipMappings: structuredClone(DEFAULT_PAYSLIP_MAPPINGS) })}
          >
            Restore default labels
          </button>
        </Card>

        <Card title="Your data" sub="Everything lives in this browser">
          <p>
            Nothing is sent anywhere. Export regularly — clearing your browser data wipes the plan.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={exportJson}>
              Export backup
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              Import backup
            </button>
            <button
              className="btn danger"
              onClick={() => {
                if (confirm('Reset everything back to the starting plan? This cannot be undone.')) {
                  reset();
                  setMessage('Reset to the starting plan.');
                }
              }}
            >
              Reset
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                await importJson(file);
                setMessage(`Imported ${file.name}.`);
              } catch (err) {
                setMessage(`Could not import: ${(err as Error).message}`);
              }
              e.target.value = '';
            }}
          />
          {message && (
            <div className="callout" style={{ marginTop: 10 }}>
              {message}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

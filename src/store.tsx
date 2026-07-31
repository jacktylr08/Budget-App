/**
 * App state: a single object in localStorage. No account, no server — the data
 * never leaves the browser. Export/import gives you a portable backup.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { defaultState } from './defaults';
import { computePlan, emptyMonth, monthRange } from './engine';
import type { AppState, MonthEntry, MonthKey, MonthResult } from './types';

const STORAGE_KEY = 'budget-app.state.v1';

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed?.config?.fixedCosts) return defaultState();
    return parsed;
  } catch {
    return defaultState();
  }
}

interface Store {
  state: AppState;
  plan: MonthResult[];
  months: MonthKey[];
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  /** Patch a single month, creating it if it does not exist yet. */
  updateMonth: (month: MonthKey, patch: (entry: MonthEntry) => MonthEntry) => void;
  updateConfig: (patch: Partial<AppState['config']>) => void;
  reset: () => void;
  exportJson: () => void;
  importJson: (file: File) => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const months = useMemo(
    () => monthRange(state.config.startMonth, state.config.monthCount),
    [state.config.startMonth, state.config.monthCount],
  );
  const plan = useMemo(() => computePlan(state, months), [state, months]);

  const updateMonth = useCallback((month: MonthKey, patch: (e: MonthEntry) => MonthEntry) => {
    setState((s) => ({
      ...s,
      months: { ...s.months, [month]: patch(s.months[month] ?? emptyMonth(month)) },
    }));
  }, []);

  const updateConfig = useCallback((patch: Partial<AppState['config']>) => {
    setState((s) => ({ ...s, config: { ...s.config, ...patch } }));
  }, []);

  const reset = useCallback(() => setState(defaultState()), []);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const importJson = useCallback(async (file: File) => {
    const parsed = JSON.parse(await file.text()) as AppState;
    if (!parsed?.config?.fixedCosts || !parsed.months) throw new Error('Not a budget backup file');
    setState(parsed);
  }, []);

  const value: Store = {
    state,
    plan,
    months,
    setState,
    updateMonth,
    updateConfig,
    reset,
    exportJson,
    importJson,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

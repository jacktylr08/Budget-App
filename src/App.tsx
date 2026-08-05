import { useEffect, useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { MonthView } from './components/MonthView';
import { PlanGrid } from './components/PlanGrid';
import { PlanList } from './components/PlanList';
import { History } from './components/History';
import { Rules } from './components/Rules';
import { Settings } from './components/Settings';
import { currentMonthKey } from './engine';
import { setMoneyFormat } from './format';
import { StoreProvider, useStore } from './store';
import { useIsMobile } from './useMediaQuery';
import type { MonthKey } from './types';

type Tab = 'dashboard' | 'month' | 'plan' | 'history' | 'rules' | 'settings';

const TABS: Array<{ id: Tab; label: string; short: string; icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home', icon: '◈' },
  { id: 'month', label: 'This month', short: 'Month', icon: '◑' },
  { id: 'plan', label: 'Plan', short: 'Plan', icon: '☰' },
  { id: 'history', label: 'History', short: 'History', icon: '◔' },
  { id: 'rules', label: 'Rules', short: 'Rules', icon: '§' },
  { id: 'settings', label: 'Settings', short: 'Setup', icon: '⚙' },
];

function useTheme() {
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(
    () => (localStorage.getItem('budget-app.theme') as 'light' | 'dark') ?? 'system',
  );
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('budget-app.theme', theme);
  }, [theme]);
  return { theme, setTheme };
}

function Shell() {
  const { state, months } = useStore();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [month, setMonth] = useState<MonthKey>(() => {
    const now = currentMonthKey();
    return now;
  });
  const { theme, setTheme } = useTheme();
  const isMobile = useIsMobile();

  useEffect(() => {
    setMoneyFormat(state.config.locale, state.config.currency);
  }, [state.config.locale, state.config.currency]);

  // Keep the selected month inside the plan window.
  useEffect(() => {
    if (months.length && !months.includes(month)) {
      const now = currentMonthKey();
      setMonth(months.includes(now) ? now : months[0]);
    }
  }, [months, month]);

  const openMonth = (m: MonthKey) => {
    setMonth(m);
    setTab('month');
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">£</span>
          Budget
        </div>
        {!isMobile && (
          <nav className="nav">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}
        <div className="topbar-right">
          <button
            className="btn ghost sm"
            onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')}
            title={`Theme: ${theme}`}
          >
            {theme === 'dark' ? '◐ Dark' : theme === 'light' ? '◑ Light' : '◒ Auto'}
          </button>
        </div>
      </header>

      <main className="page">
        {tab === 'dashboard' && (
          <>
            <div className="page-head">
              <div>
                <h1>Dashboard</h1>
                <p>
                  Where the plan stands, and what needs a decision. Figures update the moment you
                  change anything.
                </p>
              </div>
            </div>
            <Dashboard onOpenMonth={openMonth} />
          </>
        )}

        {tab === 'month' && <MonthView month={month} setMonth={setMonth} />}

        {tab === 'plan' && (
          <>
            <div className="page-head">
              <div>
                <h1>Plan</h1>
                <p>
                  {isMobile
                    ? 'Every month of the plan. Tap one to see where its money goes.'
                    : 'The whole plan in one grid. Type in any cell to change that month only — blue figures are overrides, grey ones come from the defaults in Settings.'}
                </p>
              </div>
            </div>
            {isMobile ? <PlanList onOpenMonth={openMonth} /> : <PlanGrid onOpenMonth={openMonth} />}
          </>
        )}

        {tab === 'history' && (
          <>
            <div className="page-head">
              <div>
                <h1>History</h1>
                <p>
                  What your logs actually say. These are the figures the plan should be set
                  from — not an estimate of what a month costs, but what yours have cost.
                </p>
              </div>
            </div>
            <History />
          </>
        )}

        {tab === 'rules' && (
          <>
            <div className="page-head">
              <div>
                <h1>Rules</h1>
                <p>Read this before changing anything.</p>
              </div>
            </div>
            <Rules />
          </>
        )}

        {tab === 'settings' && (
          <>
            <div className="page-head">
              <div>
                <h1>Settings</h1>
                <p>Lines, funds, debts and defaults. Changes apply across every month.</p>
              </div>
            </div>
            <Settings />
          </>
        )}
      </main>

      {isMobile && (
        <nav className="bottom-nav" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                window.scrollTo({ top: 0 });
              }}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              <span className="bottom-nav-icon" aria-hidden="true">
                {t.icon}
              </span>
              {t.short}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

/**
 * Monzo CSV import — main-account exports and per-Pot exports alike.
 *
 * The Monzo API does not expose what happens inside a Pot, and neither does the
 * main-account CSV. A **per-Pot export**, taken from the Pot itself in the app, does: it
 * lists the card payments made from that Pot. That is the file to use for a spending Pot.
 *
 * Both shapes contain rows that are not spending, and both are filtered out here:
 * transfers in and out of the Pot, and payments to investment platforms, which are saving.
 *
 * The export's columns have changed over the years, so headers are matched by name
 * rather than position, and both the `Amount` and `Money Out` layouts are handled.
 */
import { round2 } from './engine';
import type { MonthKey, SpendEntry } from './types';

export interface MonzoRow {
  id: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Positive number of pounds spent. */
  amount: number;
  description: string;
  category: string;
  /** Transfers into and out of Pots, which are not spending. */
  isPotTransfer: boolean;
  /** Money moved to an investment or savings platform — saving, not spending. */
  isInvestment: boolean;
}

export interface MonzoParseResult {
  rows: MonzoRow[];
  /** Categories present, with totals, for the include/exclude choice. */
  categories: Array<{ name: string; total: number; count: number }>;
  potTransferTotal: number;
  potTransferCount: number;
  investmentTotal: number;
  investmentCount: number;
  months: MonthKey[];
  /** Spend total per month, so a whole file can be reviewed before importing. */
  monthTotals: Record<MonthKey, number>;
  warnings: string[];
}

/**
 * Paying money into an investment platform is saving, not discretionary spending — but it
 * appears in a Pot export as an ordinary card payment, and one such transfer distorted a
 * month by £1,670 during testing.
 */
export const INVESTMENT_PAYEES = [
  'trading 212',
  'trading212',
  'vanguard',
  'freetrade',
  'invest engine',
  'investengine',
  'moneybox',
  'nutmeg',
  'hargreaves',
  'chip',
  'plum',
];

/**
 * Categories that are not guilt-free spending, and so are off by default.
 *
 * Two groups: money the plan budgets elsewhere (rent, bills, transfers, savings), and
 * lumpy things the plan funds from a sinking fund rather than the monthly budget
 * (holidays, events, car repairs). All of them can be switched back on per import.
 */
export const DEFAULT_EXCLUDED_CATEGORIES = [
  'transfers',
  'transfer',
  'savings',
  'investment',
  'income',
  'bills',
  'finances',
  'rent',
  'mortgage',
  'subscriptions',
  'holidays',
  'holiday spending',
  'events',
  'car repairs',
];

/** Splits a CSV line, honouring quoted fields that contain commas. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Monzo writes DD/MM/YYYY; ISO is accepted too in case the export changes again. */
export function parseMonzoDate(raw: string): string | undefined {
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return undefined;
}

const toAmount = (raw: string): number | undefined => {
  const cleaned = raw.replace(/[£"\s,]/g, '');
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
};

const POT = /\bpot\b/i;
const isInvestmentPayee = (name: string) =>
  INVESTMENT_PAYEES.some((p) => name.toLowerCase().includes(p));

export function parseMonzoCsv(text: string): MonzoParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const warnings: string[] = [];
  if (lines.length < 2) {
    return {
      rows: [],
      categories: [],
      potTransferTotal: 0,
      potTransferCount: 0,
      investmentTotal: 0,
      investmentCount: 0,
      months: [],
      monthTotals: {},
      warnings: ['That file has no rows in it.'],
    };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/^"|"$/g, ''));
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };

  const iDate = col('date');
  const iAmount = col('amount', 'local amount');
  const iOut = col('money out');
  const iName = col('name', 'description', 'counterparty');
  const iDesc = col('description', 'notes and #tags', 'name');
  const iCategory = col('category');
  const iType = col('type');
  const iId = col('transaction id', 'id');

  if (iDate === -1 || (iAmount === -1 && iOut === -1)) {
    return {
      rows: [],
      categories: [],
      potTransferTotal: 0,
      potTransferCount: 0,
      investmentTotal: 0,
      investmentCount: 0,
      months: [],
      monthTotals: {},
      warnings: [
        'This does not look like a Monzo CSV export — no Date and Amount columns were found. In the Monzo app: Account → Statements → Export as CSV.',
      ],
    };
  }

  const rows: MonzoRow[] = [];
  let skippedIncoming = 0;
  let unparsedDates = 0;

  lines.slice(1).forEach((line, n) => {
    const cells = splitCsvLine(line);
    const date = parseMonzoDate(cells[iDate] ?? '');
    if (!date) {
      unparsedDates++;
      return;
    }
    const raw = iAmount !== -1 ? toAmount(cells[iAmount] ?? '') : undefined;
    const out = iOut !== -1 ? toAmount(cells[iOut] ?? '') : undefined;
    // Money Out is written as a positive number in some exports and negative in others.
    const signed = raw !== undefined ? raw : out !== undefined ? -Math.abs(out) : undefined;
    if (signed === undefined) return;
    if (signed >= 0) {
      skippedIncoming++;
      return;
    }

    const name = (cells[iName] ?? '').replace(/^"|"$/g, '');
    const desc = (cells[iDesc] ?? '').replace(/^"|"$/g, '');
    const category = (cells[iCategory] ?? '').replace(/^"|"$/g, '') || 'Uncategorised';
    const type = (cells[iType] ?? '').replace(/^"|"$/g, '');

    rows.push({
      id: (cells[iId] ?? '').replace(/^"|"$/g, '') || `${date}-${n}`,
      date,
      amount: round2(Math.abs(signed)),
      description: [name, desc].filter(Boolean).find(Boolean) || 'Spend',
      category,
      isPotTransfer: POT.test(type) || POT.test(name) || POT.test(category) || POT.test(desc),
      isInvestment: isInvestmentPayee(name) || isInvestmentPayee(desc),
    });
  });

  const potRows = rows.filter((r) => r.isPotTransfer);
  const investmentRows = rows.filter((r) => !r.isPotTransfer && r.isInvestment);
  const spendRows = rows.filter((r) => !r.isPotTransfer && !r.isInvestment);

  const totals = new Map<string, { total: number; count: number }>();
  for (const r of spendRows) {
    const t = totals.get(r.category) ?? { total: 0, count: 0 };
    totals.set(r.category, { total: round2(t.total + r.amount), count: t.count + 1 });
  }

  if (unparsedDates > 0) warnings.push(`${unparsedDates} row${unparsedDates === 1 ? '' : 's'} had a date that could not be read and were skipped.`);
  if (skippedIncoming > 0) warnings.push(`${skippedIncoming} incoming payment${skippedIncoming === 1 ? '' : 's'} ignored — only money out counts as spending.`);
  if (potRows.length > 0) {
    warnings.push(
      `${potRows.length} Pot transfer${potRows.length === 1 ? '' : 's'} excluded — moving money between Pots is not spending. Card payments made from a Pot are kept.`,
    );
  }

  if (investmentRows.length > 0) {
    const total = round2(investmentRows.reduce((a, r) => a + r.amount, 0));
    warnings.push(
      `£${total.toFixed(2)} paid to ${[...new Set(investmentRows.map((r) => r.description))].join(', ')} treated as saving, not spending, and left out.`,
    );
  }

  const monthTotals: Record<MonthKey, number> = {};
  for (const r of spendRows) {
    const m = r.date.slice(0, 7);
    monthTotals[m] = round2((monthTotals[m] ?? 0) + r.amount);
  }

  return {
    rows: spendRows,
    categories: [...totals.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total),
    potTransferTotal: round2(potRows.reduce((a, r) => a + r.amount, 0)),
    potTransferCount: potRows.length,
    investmentTotal: round2(investmentRows.reduce((a, r) => a + r.amount, 0)),
    investmentCount: investmentRows.length,
    months: [...new Set(spendRows.map((r) => r.date.slice(0, 7)))].sort(),
    monthTotals,
    warnings,
  };
}

/** Every month in the file at once, so a year of history lands in one go. */
export function rowsToSpendsByMonth(
  rows: MonzoRow[],
  includedCategories: Set<string>,
): Record<MonthKey, SpendEntry[]> {
  const out: Record<MonthKey, SpendEntry[]> = {};
  for (const r of rows) {
    if (!includedCategories.has(r.category)) continue;
    const m = r.date.slice(0, 7);
    (out[m] ??= []).push({
      id: `monzo-${r.id}`,
      date: r.date,
      amount: r.amount,
      note: r.description,
    });
  }
  return out;
}

/** Rows for one month, in the categories you kept, as spend-log entries. */
export function rowsToSpends(
  rows: MonzoRow[],
  month: MonthKey,
  includedCategories: Set<string>,
): SpendEntry[] {
  return rows
    .filter((r) => r.date.startsWith(month) && includedCategories.has(r.category))
    .map((r) => ({
      id: `monzo-${r.id}`,
      date: r.date,
      amount: r.amount,
      note: r.description,
    }));
}

/** Merges imported entries into existing ones, ignoring anything already imported. */
export function mergeSpends(existing: SpendEntry[], incoming: SpendEntry[]) {
  const seen = new Set(existing.map((s) => s.id));
  const added = incoming.filter((s) => !seen.has(s.id));
  return { merged: [...existing, ...added], added: added.length, skipped: incoming.length - added.length };
}

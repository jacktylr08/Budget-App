/**
 * Monzo CSV import.
 *
 * Monzo's own API does not expose what happens inside a Pot, and neither does its CSV
 * export, so a spend made directly from a Pot cannot be imported by any route — those
 * still have to be logged by hand. Everything spent from the main balance is here.
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
}

export interface MonzoParseResult {
  rows: MonzoRow[];
  /** Categories present, with totals, for the include/exclude choice. */
  categories: Array<{ name: string; total: number; count: number }>;
  potTransferTotal: number;
  potTransferCount: number;
  months: MonthKey[];
  warnings: string[];
}

/** Categories that are never guilt-free spending. */
export const DEFAULT_EXCLUDED_CATEGORIES = [
  'transfers',
  'savings',
  'income',
  'bills',
  'finances',
  'rent',
  'mortgage',
  'transfer',
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

export function parseMonzoCsv(text: string): MonzoParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const warnings: string[] = [];
  if (lines.length < 2) {
    return { rows: [], categories: [], potTransferTotal: 0, potTransferCount: 0, months: [], warnings: ['That file has no rows in it.'] };
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
      months: [],
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
    });
  });

  const potRows = rows.filter((r) => r.isPotTransfer);
  const spendRows = rows.filter((r) => !r.isPotTransfer);

  const totals = new Map<string, { total: number; count: number }>();
  for (const r of spendRows) {
    const t = totals.get(r.category) ?? { total: 0, count: 0 };
    totals.set(r.category, { total: round2(t.total + r.amount), count: t.count + 1 });
  }

  if (unparsedDates > 0) warnings.push(`${unparsedDates} row${unparsedDates === 1 ? '' : 's'} had a date that could not be read and were skipped.`);
  if (skippedIncoming > 0) warnings.push(`${skippedIncoming} incoming payment${skippedIncoming === 1 ? '' : 's'} ignored — only money out counts as spending.`);
  if (potRows.length > 0) {
    warnings.push(
      `${potRows.length} Pot transfer${potRows.length === 1 ? '' : 's'} excluded. Moving money into a Pot is not spending — and anything you spent *directly from* a Pot is not in this file at all, because Monzo does not put Pot transactions in the export. Log those by hand.`,
    );
  }

  return {
    rows: spendRows,
    categories: [...totals.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total),
    potTransferTotal: round2(potRows.reduce((a, r) => a + r.amount, 0)),
    potTransferCount: potRows.length,
    months: [...new Set(spendRows.map((r) => r.date.slice(0, 7)))].sort(),
    warnings,
  };
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

/**
 * Payslip parsing. Takes the text of a payslip (pasted, or extracted from a PDF or
 * text/CSV file) and pulls out the figures that feed a month's income block.
 *
 * The label aliases live in config so you can teach it your employer's wording
 * without touching code.
 */
import type { MonthIncome, MonthKey, PayslipField, PayslipMappings } from './types';

export interface ParsedField {
  field: PayslipField;
  value: number;
  /** The line it came from, shown in the preview so you can check the match. */
  evidence: string;
  matchedLabel: string;
}

export interface ParsedPayslip {
  fields: Partial<Record<PayslipField, ParsedField>>;
  /** Pay date detected in the document, if any. */
  detectedMonth?: MonthKey;
  unmatchedLines: string[];
  warnings: string[];
}

const NUMBER = /-?\(?£?\s?\d[\d,]*\.?\d*\)?/g;

function toNumber(raw: string): number | undefined {
  const negative = raw.includes('(') || raw.trim().startsWith('-');
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned || cleaned === '.') return undefined;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return undefined;
  return negative ? -n : n;
}

/** Numbers on a line, with the index at which each starts. */
function numbersWithPositions(line: string): Array<{ value: number; index: number }> {
  const out: Array<{ value: number; index: number }> = [];
  for (const m of line.matchAll(NUMBER)) {
    const value = toNumber(m[0]);
    // A bare year or a payroll number is not money.
    if (value === undefined) continue;
    out.push({ value, index: m.index ?? 0 });
  }
  return out;
}

const YTD = /(year[\s-]?to[\s-]?date|\bytd\b|to date)/i;

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Finds a pay date such as "Pay date: 28/08/2026" or "Period ending 31 August 2026". */
export function detectMonth(text: string): MonthKey | undefined {
  const dmy = text.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && year > 1990) {
      return `${year}-${String(month).padStart(2, '0')}`;
    }
  }
  const named = text
    .toLowerCase()
    .match(new RegExp(`(${MONTHS.join('|')})[a-z]*\\s+(\\d{4})`, 'i'));
  if (named) {
    const month = MONTHS.indexOf(named[1].toLowerCase()) + 1;
    return `${named[2]}-${String(month).padStart(2, '0')}`;
  }
  return undefined;
}

/**
 * Field order matters: specific labels claim their line before looser ones
 * ("income tax" before "tax"), and each line is only consumed once.
 */
const FIELD_ORDER: PayslipField[] = [
  'net',
  'studentLoan',
  'nationalInsurance',
  'pension',
  'incomeTax',
  'bonus',
  'reimbursement',
  'gross',
];

export function parsePayslip(text: string, mappings: PayslipMappings): ParsedPayslip {
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const claimed = new Set<number>();
  const fields: Partial<Record<PayslipField, ParsedField>> = {};
  const warnings: string[] = [];

  for (const field of FIELD_ORDER) {
    const aliases = [...(mappings[field] ?? [])].sort((a, b) => b.length - a.length);
    let best: { parsed: ParsedField; lineIndex: number; isYtd: boolean } | undefined;

    for (const alias of aliases) {
      const needle = alias.toLowerCase();
      for (let i = 0; i < rawLines.length; i++) {
        if (claimed.has(i)) continue;
        const line = rawLines[i];
        // Whole-word match, so "tax" does not fire on "Taxable Pay".
        const boundary = new RegExp(
          `(?<![a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`,
          'i',
        );
        const found = boundary.exec(line);
        if (!found) continue;

        const labelEnd = found.index + found[0].length;
        let nums = numbersWithPositions(line).filter((n) => n.index >= labelEnd);
        let sourceLine = line;
        let lineIndex = i;

        // PDF text extraction often puts the amount on the following line.
        if (nums.length === 0 && i + 1 < rawLines.length && !claimed.has(i + 1)) {
          const next = rawLines[i + 1];
          if (!/[a-z]{4,}/i.test(next.replace(/[£\d.,\s-]/g, ''))) {
            nums = numbersWithPositions(next);
            sourceLine = `${line} / ${next}`;
            lineIndex = i;
          }
        }
        if (nums.length === 0) continue;

        const isYtd = YTD.test(line);
        // First figure after the label is the period amount; later ones are usually YTD.
        const candidate = {
          parsed: {
            field,
            value: nums[0].value,
            evidence: sourceLine,
            matchedLabel: alias,
          },
          lineIndex,
          isYtd,
        };
        // Prefer a non-YTD line, then the longest alias match (already ordered).
        if (!best || (best.isYtd && !isYtd)) best = candidate;
        if (best && !best.isYtd) break;
      }
      if (best && !best.isYtd) break;
    }

    if (best) {
      fields[field] = best.parsed;
      claimed.add(best.lineIndex);
      if (best.isYtd) {
        warnings.push(
          `"${best.parsed.matchedLabel}" was only found on a year-to-date line — check the value.`,
        );
      }
    }
  }

  // Sanity check: does gross minus deductions land on the stated net pay?
  const g = fields.gross?.value ?? 0;
  const b = fields.bonus?.value ?? 0;
  const r = fields.reimbursement?.value ?? 0;
  const deductions =
    (fields.incomeTax?.value ?? 0) +
    (fields.nationalInsurance?.value ?? 0) +
    (fields.pension?.value ?? 0) +
    (fields.studentLoan?.value ?? 0);
  const net = fields.net?.value;
  if (net !== undefined && g > 0) {
    const diff = Math.abs(g + b + r - deductions - net);
    if (diff > 1) {
      warnings.push(
        `Gross minus deductions is £${(g + b + r - deductions).toFixed(2)} but the payslip says net pay is £${net.toFixed(2)} (£${diff.toFixed(2)} out). The payslip's net pay figure will be used.`,
      );
    }
  }
  if (!fields.gross) warnings.push('No gross pay line was found — enter it by hand below.');

  const matchedLines = new Set([...claimed]);
  return {
    fields,
    detectedMonth: detectMonth(text),
    unmatchedLines: rawLines.filter((_, i) => !matchedLines.has(i)),
    warnings,
  };
}

/** Folds a parse result into an income block, keeping anything it could not find. */
export function applyParsed(
  income: MonthIncome,
  parsed: Partial<Record<PayslipField, number>>,
): MonthIncome {
  return {
    ...income,
    gross: parsed.gross ?? 0,
    bonus: parsed.bonus ?? 0,
    reimbursement: parsed.reimbursement ?? 0,
    incomeTax: parsed.incomeTax ?? 0,
    nationalInsurance: parsed.nationalInsurance ?? 0,
    pension: parsed.pension ?? 0,
    studentLoan: parsed.studentLoan ?? 0,
    netOverride: parsed.net,
    source: 'payslip',
    importedAt: new Date().toISOString(),
  };
}

/** Reads a dropped file. PDFs go through pdf.js; everything else is read as text. */
export async function extractText(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist');
    // The worker is bundled as source and started from a blob, so the app stays a
    // self-contained page with no second file to fetch.
    const workerSource = (await import('pdfjs-dist/build/pdf.worker.min.mjs?raw')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
      new Blob([workerSource], { type: 'text/javascript' }),
    );
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      // Group text items into lines by their y position.
      const rows = new Map<number, Array<{ x: number; s: string }>>();
      for (const item of content.items as Array<{ str: string; transform: number[] }>) {
        if (!item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key)!.push({ x: item.transform[4], s: item.str });
      }
      const ordered = [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, items]) => items.sort((a, b) => a.x - b.x).map((i) => i.s).join(' '));
      pages.push(ordered.join('\n'));
    }
    return pages.join('\n');
  }
  return file.text();
}

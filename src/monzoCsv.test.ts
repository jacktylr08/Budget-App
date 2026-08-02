import { describe, expect, it } from 'vitest';
import {
  mergeSpends,
  parseMonzoCsv,
  parseMonzoDate,
  rowsToSpends,
  splitCsvLine,
} from './monzoCsv';

// The personal-account export layout.
const CSV = `Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Notes and #tags,Description
tx_001,01/08/2026,21:14,Card payment,"The Bar, Leeds",🍺,Eating out,-31.50,GBP,,BAR LEEDS
tx_002,01/08/2026,23:40,Card payment,Uber,🚕,Transport,-18.00,GBP,,UBER
tx_003,02/08/2026,09:02,Card payment,Pret,☕,Eating out,-4.40,GBP,,PRET
tx_004,02/08/2026,12:00,Pot transfer,Holiday Fund,,Transfers,-125.00,GBP,,POT
tx_005,03/08/2026,08:00,Faster payment,Landlord,,Bills,-500.00,GBP,,RENT
tx_006,05/08/2026,10:00,Faster payment,Employer,,Income,2317.28,GBP,,SALARY
tx_007,06/08/2026,19:30,Card payment,Tesco,🛒,Groceries,-42.10,GBP,,TESCO`;

describe('parsing a Monzo export', () => {
  const r = parseMonzoCsv(CSV);

  it('keeps money out and drops money in', () => {
    expect(r.rows.map((x) => x.description)).toEqual([
      'The Bar, Leeds',
      'Uber',
      'Pret',
      'Landlord',
      'Tesco',
    ]);
    expect(r.warnings.join(' ')).toMatch(/1 incoming payment/);
  });

  it('handles a quoted field containing a comma', () => {
    expect(splitCsvLine('a,"b, c",d')).toEqual(['a', 'b, c', 'd']);
    expect(r.rows[0].amount).toBe(31.5);
  });

  it('converts Monzo dates to ISO', () => {
    expect(parseMonzoDate('01/08/2026')).toBe('2026-08-01');
    expect(parseMonzoDate('1/8/2026')).toBe('2026-08-01');
    expect(parseMonzoDate('2026-08-01T10:00:00Z')).toBe('2026-08-01');
    expect(parseMonzoDate('nonsense')).toBeUndefined();
  });

  it('separates Pot transfers out of spending', () => {
    expect(r.rows.some((x) => x.isPotTransfer)).toBe(false);
    expect(r.potTransferCount).toBe(1);
    expect(r.potTransferTotal).toBe(125);
  });

  it('says plainly that spending from a Pot is not in the file', () => {
    expect(r.warnings.join(' ')).toMatch(/directly from.*Pot is not in this file/i);
  });

  it('totals each category so they can be included or excluded', () => {
    expect(r.categories[0]).toEqual({ name: 'Bills', total: 500, count: 1 });
    expect(r.categories.find((c) => c.name === 'Eating out')).toEqual({
      name: 'Eating out',
      total: 35.9,
      count: 2,
    });
  });

  it('reports which months the file covers', () => {
    expect(r.months).toEqual(['2026-08']);
  });
});

describe('turning rows into spend-log entries', () => {
  const r = parseMonzoCsv(CSV);
  const included = new Set(['Eating out', 'Transport', 'Groceries']);

  it('takes only the chosen categories for the chosen month', () => {
    const spends = rowsToSpends(r.rows, '2026-08', included);
    expect(spends).toHaveLength(4);
    expect(spends.some((s) => s.note === 'Landlord')).toBe(false);
    expect(spends.reduce((a, s) => a + s.amount, 0)).toBe(96);
  });

  it('returns nothing for a month the file does not cover', () => {
    expect(rowsToSpends(r.rows, '2026-09', included)).toEqual([]);
  });

  it('does not duplicate on a second import of the same file', () => {
    const first = rowsToSpends(r.rows, '2026-08', included);
    const { merged, added } = mergeSpends([], first);
    expect(added).toBe(4);
    const again = mergeSpends(merged, rowsToSpends(r.rows, '2026-08', included));
    expect(again.added).toBe(0);
    expect(again.skipped).toBe(4);
    expect(again.merged).toHaveLength(4);
  });

  it('keeps entries you typed in yourself', () => {
    const manual = [{ id: 'mine-1', date: '2026-08-04', amount: 20, note: 'Cash' }];
    const { merged } = mergeSpends(manual, rowsToSpends(r.rows, '2026-08', included));
    expect(merged).toHaveLength(5);
    expect(merged[0].id).toBe('mine-1');
  });
});

describe('awkward files', () => {
  it('handles the Money Out column layout', () => {
    const r = parseMonzoCsv('Date,Name,Category,Money Out,Money In\n07/08/2026,Sainsburys,Groceries,23.40,');
    expect(r.rows[0].amount).toBe(23.4);
    expect(r.rows[0].date).toBe('2026-08-07');
  });

  it('explains itself when handed the wrong file', () => {
    const r = parseMonzoCsv('foo,bar\n1,2');
    expect(r.rows).toEqual([]);
    expect(r.warnings[0]).toMatch(/does not look like a Monzo CSV/i);
    expect(r.warnings[0]).toMatch(/Export as CSV/);
  });

  it('survives an empty file', () => {
    expect(parseMonzoCsv('').rows).toEqual([]);
  });

  it('skips rows with an unreadable date rather than dropping the import', () => {
    const r = parseMonzoCsv('Date,Name,Category,Amount\nnot-a-date,X,Y,-5\n08/08/2026,Z,Y,-6');
    expect(r.rows).toHaveLength(1);
    expect(r.warnings.join(' ')).toMatch(/1 row had a date that could not be read/);
  });
});

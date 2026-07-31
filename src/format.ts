let currency = 'GBP';
let locale = 'en-GB';

export function setMoneyFormat(nextLocale: string, nextCurrency: string) {
  locale = nextLocale;
  currency = nextCurrency;
}

export function money(n: number, opts: { decimals?: boolean; sign?: boolean } = {}): string {
  const { decimals = true, sign = false } = opts;
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(n);
  return sign && n > 0 ? `+${formatted}` : formatted;
}

/** Compact form for axis ticks, e.g. £8.2k. */
export function moneyShort(n: number): string {
  const abs = Math.abs(n);
  const symbol = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 })
    .format(0)
    .replace(/[\d.,\s]/g, '');
  if (abs >= 1000) return `${n < 0 ? '-' : ''}${symbol}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `${n < 0 ? '-' : ''}${symbol}${abs.toFixed(0)}`;
}

export const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;

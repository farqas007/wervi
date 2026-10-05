/**
 * ISO 4217 currency metadata.
 *
 * Amounts are stored as integer minor units. Decimal places differ per
 * currency (JPY has 0, BHD has 3), so the exponent must be looked up rather
 * than assumed to be 2.
 */

export const CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'BRL',
  'MXN',
  'ZAR',
  'INR',
  'SGD',
  'HKD',
  'JPY',
  'KRW',
  'AED',
  'TRY',
  'BHD',
  'KWD',
] as const;

export type Currency = (typeof CURRENCIES)[number];

const EXPONENTS: Record<Currency, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  CHF: 2,
  SEK: 2,
  NOK: 2,
  DKK: 2,
  PLN: 2,
  BRL: 2,
  MXN: 2,
  ZAR: 2,
  INR: 2,
  SGD: 2,
  HKD: 2,
  JPY: 0,
  KRW: 0,
  AED: 2,
  TRY: 2,
  BHD: 3,
  KWD: 3,
};

/** Currencies WERVI v1 can settle payouts in. */
export const PAYOUT_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'INR',
  'BRL',
  'JPY',
] as const satisfies readonly Currency[];

export type PayoutCurrency = (typeof PAYOUT_CURRENCIES)[number];

export function isCurrency(value: string): value is Currency {
  return Object.hasOwn(EXPONENTS, value);
}

/** Number of decimal places used by the currency. */ export function currencyExponent(
  currency: Currency,
): number {
  const exponent = EXPONENTS[currency];
  if (exponent === undefined) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  return exponent;
}

/** Smallest indivisible unit of the currency, e.g. 1 for USD, 1 for JPY. */
export function minorUnitFactor(currency: Currency): number {
  return 10 ** currencyExponent(currency);
}

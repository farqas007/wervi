import {
  currencyExponent,
  minorUnitFactor,
  type Currency,
} from '../constants/currency.js';
import { type Money } from '../schemas/money.js';

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be an integer number of minor units`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} exceeds the safe integer range`);
  }
}

/**
 * Convert a major-unit decimal (e.g. 1250.5) into minor units (125050).
 *
 * Scaling is done on the decimal text, never by multiplying a float, so values
 * like 0.1 cannot drift into 0.0999999.
 *
 * The two input types have deliberately different contracts:
 *  - `string` is strict. Excess precision throws, because a string came from a
 *    human (a form field, an API payload) and "10.999 USD" is a mistake worth
 *    reporting rather than silently altering.
 *  - `number` is rounded half-up. A float has already lost its exact decimal
 *    value by the time it exists (`1.005` really is 1.0049999…), so rejecting
 *    it would be pedantry; rounding matches what the human intended.
 */
export function toMinorUnits(
  major: number | string,
  currency: Currency,
): number {
  const exponent = currencyExponent(currency);
  const text = (
    typeof major === 'number' ? major.toString() : major.trim()
  ).replace(/^\+/, '');

  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new MoneyError(`Cannot parse major-unit amount: ${text}`);
  }

  const fraction = text.split('.')[1] ?? '';
  // Trailing zeros are harmless ("1500.00" is a valid JPY amount); a non-zero
  // digit past the currency exponent is genuine excess precision ("10.999").
  const hasExcessPrecision = fraction
    .slice(exponent)
    .split('')
    .some((digit) => digit !== '0');

  if (hasExcessPrecision && typeof major === 'string') {
    throw new MoneyError(
      `${currency} supports at most ${exponent} decimal places, received "${text}"`,
    );
  }

  const minor = scaleDecimalString(text, exponent);

  if (!Number.isSafeInteger(minor)) {
    throw new MoneyError('Amount exceeds the safe integer range');
  }

  return minor;
}

function scaleDecimalString(text: string, exponent: number): number {
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = unsigned.split('.');

  const kept = fraction.slice(0, exponent).padEnd(exponent, '0');
  const roundsUp = (fraction[exponent] ?? '0') >= '5';

  let minor = BigInt(`${whole}${kept}`);
  if (roundsUp) {
    minor += 1n;
  }

  const signed = negative ? -minor : minor;
  return Number(signed);
}

/** Convert minor units (125050) back to a major-unit decimal (1250.5). */
export function fromMinorUnits(minor: number, currency: Currency): number {
  assertSafeInteger(minor, 'Amount');
  return minor / minorUnitFactor(currency);
}

export function money(minor: number, currency: Currency): Money {
  assertSafeInteger(minor, 'Amount');
  return { amount: minor, currency };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b, 'add');
  assertSafeInteger(a.amount + b.amount, 'Sum');
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b, 'subtract');
  assertSafeInteger(a.amount - b.amount, 'Difference');
  return { amount: a.amount - b.amount, currency: a.currency };
}

export function sumMoney(items: readonly Money[]): Money {
  const [first] = items;
  if (first === undefined) {
    throw new MoneyError('Cannot sum an empty list');
  }
  return items.reduce(addMoney, first);
}

/**
 * Multiply money by a rate using banker's-independent half-up rounding.
 *
 * This is the only sanctioned way to compute platform commission: take the
 * gross amount, derive the fee in minor units, round once, and persist the
 * rounded integer. Never derive the fee from a float.
 */
export function multiplyMoney(value: Money, rate: number): Money {
  if (!Number.isFinite(rate) || rate < 0) {
    throw new MoneyError(`Rate must be a non-negative finite number: ${rate}`);
  }
  const scaled = value.amount * rate;
  const rounded = Math.round(scaled);
  assertSafeInteger(rounded, 'Product');
  return { amount: rounded, currency: value.currency };
}

/**
 * Split an amount into parts that sum exactly back to the original, giving any
 * remainder to the first part. Used to split a milestone between a freelancer
 * and platform commission without losing or inventing minor units.
 */
export function allocateMoney(
  value: Money,
  weights: readonly number[],
): Money[] {
  if (weights.length === 0) {
    throw new MoneyError('allocateMoney requires at least one weight');
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    throw new MoneyError('Allocate weights must sum to a positive number');
  }

  const amounts = weights.map((weight) =>
    Math.floor((value.amount * weight) / total),
  );

  const remainder =
    value.amount - amounts.reduce((sum, amount) => sum + amount, 0);
  const [first] = amounts;
  if (first === undefined) {
    throw new MoneyError('allocateMoney requires at least one weight');
  }
  amounts[0] = first + remainder;

  return amounts.map((amount) => ({ amount, currency: value.currency }));
}

export function isZeroMoney(value: Money): boolean {
  return value.amount === 0;
}

export function isPositiveMoney(value: Money): boolean {
  return value.amount > 0;
}

export function formatMoney(
  value: Money,
  locale = 'en-US',
  options: { compact?: boolean } = {},
): string {
  const major = fromMinorUnits(value.amount, value.currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    notation: options.compact === true ? 'compact' : 'standard',
  }).format(major);
}

function assertSameCurrency(a: Money, b: Money, operation: string): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(
      `Cannot ${operation} ${a.currency} with ${b.currency}: convert first`,
    );
  }
}

import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  addMoney,
  allocateMoney,
  fromMinorUnits,
  money,
  multiplyMoney,
  subtractMoney,
  toMinorUnits,
} from './money.js';

describe('toMinorUnits', () => {
  it('converts two-decimal currencies', () => {
    expect(toMinorUnits(1250.5, 'USD')).toBe(125050);
    expect(toMinorUnits('1250.50', 'USD')).toBe(125050);
    expect(toMinorUnits(0, 'USD')).toBe(0);
  });

  it('avoids binary floating point drift', () => {
    expect(toMinorUnits(0.1, 'USD')).toBe(10);
    expect(toMinorUnits(19.99, 'USD')).toBe(1999);
    expect(toMinorUnits(0.07, 'USD')).toBe(7);
  });

  it('rounds half-up when given an inexact float', () => {
    // 1.005 is really 1.0049999... in binary; the human intent is 1.01.
    expect(toMinorUnits(1.005, 'USD')).toBe(101);
    expect(toMinorUnits(2.675, 'USD')).toBe(268);
    expect(toMinorUnits(0.125, 'JPY')).toBe(0);
  });

  it('rejects excess precision in strings rather than rounding it away', () => {
    expect(() => toMinorUnits('10.999', 'USD')).toThrow(MoneyError);
    expect(() => toMinorUnits('0.5', 'JPY')).toThrow(MoneyError);
  });

  it('handles negative and signed amounts', () => {
    expect(toMinorUnits(-1250.5, 'USD')).toBe(-125050);
    expect(toMinorUnits('-0.01', 'USD')).toBe(-1);
    expect(toMinorUnits('+12.34', 'USD')).toBe(1234);
    expect(toMinorUnits(-0.005, 'USD')).toBe(-1);
  });

  it('respects zero-decimal currencies', () => {
    expect(toMinorUnits(1500, 'JPY')).toBe(1500);
    expect(toMinorUnits('1500.00', 'JPY')).toBe(1500);
  });

  it('respects three-decimal currencies', () => {
    expect(toMinorUnits(12.345, 'BHD')).toBe(12345);
  });

  it('rejects unparseable input', () => {
    expect(() => toMinorUnits('abc', 'USD')).toThrow(MoneyError);
    expect(() => toMinorUnits('', 'USD')).toThrow(MoneyError);
    expect(() => toMinorUnits(Number.NaN, 'USD')).toThrow(MoneyError);
    expect(() => toMinorUnits(Number.POSITIVE_INFINITY, 'USD')).toThrow(
      MoneyError,
    );
    expect(() => toMinorUnits(1e21, 'USD')).toThrow(MoneyError);
  });
});

describe('fromMinorUnits', () => {
  it('round-trips through toMinorUnits', () => {
    expect(fromMinorUnits(125050, 'USD')).toBe(1250.5);
    expect(fromMinorUnits(1500, 'JPY')).toBe(1500);
  });

  it('rejects non-integer minor units', () => {
    expect(() => fromMinorUnits(10.5, 'USD')).toThrow(MoneyError);
  });
});

describe('arithmetic', () => {
  it('adds and subtracts within one currency', () => {
    expect(addMoney(money(1000, 'USD'), money(250, 'USD'))).toEqual(
      money(1250, 'USD'),
    );
    expect(subtractMoney(money(1000, 'USD'), money(250, 'USD'))).toEqual(
      money(750, 'USD'),
    );
  });

  it('refuses to mix currencies', () => {
    expect(() => addMoney(money(1000, 'USD'), money(250, 'EUR'))).toThrow(
      MoneyError,
    );
  });
});

describe('multiplyMoney', () => {
  it('computes platform commission in minor units', () => {
    // 20% of a $1,000.00 milestone is exactly $200.00
    expect(multiplyMoney(money(100000, 'USD'), 0.2)).toEqual(
      money(20000, 'USD'),
    );
  });

  it('rounds half-up so the fee is a whole minor unit', () => {
    // 15% of $10.00 = $1.50 exactly
    expect(multiplyMoney(money(1000, 'USD'), 0.15)).toEqual(money(150, 'USD'));
    // 15% of $0.01 = $0.0015 -> rounds to 0 minor units, never -0 or 1.5
    expect(multiplyMoney(money(1, 'USD'), 0.15)).toEqual(money(0, 'USD'));
  });

  it('rejects negative and non-finite rates', () => {
    expect(() => multiplyMoney(money(100, 'USD'), -0.1)).toThrow(MoneyError);
    expect(() => multiplyMoney(money(100, 'USD'), Number.NaN)).toThrow(
      MoneyError,
    );
  });
});

describe('allocateMoney', () => {
  it('never loses or invents minor units', () => {
    const parts = allocateMoney(money(10000, 'USD'), [0.85, 0.15]);
    expect(parts).toEqual([money(8500, 'USD'), money(1500, 'USD')]);
    expect(parts.reduce((sum, part) => sum + part.amount, 0)).toBe(10000);
  });

  it('gives the rounding remainder to the first part', () => {
    const parts = allocateMoney(money(100, 'USD'), [1, 1, 1]);
    expect(parts.map((part) => part.amount)).toEqual([34, 33, 33]);
  });

  it('handles a zero-weight part', () => {
    const parts = allocateMoney(money(500, 'USD'), [0, 1]);
    expect(parts.map((part) => part.amount)).toEqual([0, 500]);
  });

  it('rejects an empty or zero-total weight list', () => {
    expect(() => allocateMoney(money(100, 'USD'), [])).toThrow(MoneyError);
    expect(() => allocateMoney(money(100, 'USD'), [0, 0])).toThrow(MoneyError);
  });
});

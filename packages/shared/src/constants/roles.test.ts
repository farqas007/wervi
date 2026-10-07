import { describe, expect, it } from 'vitest';
import { findGrantedRole, hasAnyRole } from './roles.js';

describe('hasAnyRole', () => {
  it('is true when any required role is held', () => {
    expect(hasAnyRole(['client'], ['client'])).toBe(true);
    expect(hasAnyRole(['client', 'freelancer'], ['client', 'admin'])).toBe(
      true,
    );
  });

  it('is false when none of the required roles are held', () => {
    expect(hasAnyRole(['freelancer'], ['client'])).toBe(false);
    expect(hasAnyRole([], ['admin'])).toBe(false);
  });

  it('is false for an empty required set', () => {
    expect(hasAnyRole(['admin'], [])).toBe(false);
  });
});

describe('findGrantedRole', () => {
  it('returns the first held role in required order', () => {
    expect(findGrantedRole(['freelancer', 'client'], ['client', 'admin'])).toBe(
      'client',
    );
    expect(findGrantedRole(['admin'], ['client', 'admin'])).toBe('admin');
  });

  it('returns undefined when no required role is held', () => {
    expect(findGrantedRole(['client'], ['admin'])).toBe(undefined);
    expect(findGrantedRole([], ['client'])).toBeUndefined();
  });
});

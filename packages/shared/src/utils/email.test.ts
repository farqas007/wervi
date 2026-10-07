import { describe, expect, it } from 'vitest';
import { emailsMatch, normalizeEmail } from './email.js';

describe('normalizeEmail', () => {
  it('lowercases the address', () => {
    expect(normalizeEmail('Jane.Doe@Example.COM')).toBe('jane.doe@example.com');
    expect(normalizeEmail('UPPERCASE@DOMAIN.TLD')).toBe('uppercase@domain.tld');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  jane@example.com  ')).toBe('jane@example.com');
    expect(normalizeEmail('\tjane@example.com\n')).toBe('jane@example.com');
  });

  it('keeps the local part case-folding, not the result of a full string map', () => {
    // The mailbox part is case-insensitive; normalization must not touch
    // anything else (e.g. IDN characters) that a naive `.toLowerCase()` over
    // the whole address could over-normalize.
    expect(normalizeEmail('User@München.de')).toBe('user@münchen.de');
  });

  it('is idempotent', () => {
    const input = '  MiXeD@Example.COM ';
    const once = normalizeEmail(input);
    expect(normalizeEmail(once)).toBe(once);
  });
});

describe('emailsMatch', () => {
  it('treats case and whitespace differences as the same mailbox', () => {
    expect(emailsMatch('Jane.Doe@example.com', 'jane.doe@EXAMPLE.COM')).toBe(
      true,
    );
    expect(emailsMatch(' jane@example.com ', 'jane@example.com')).toBe(true);
  });

  it('distinguishes different mailboxes', () => {
    expect(emailsMatch('jane@example.com', 'john@example.com')).toBe(false);
    expect(emailsMatch('jane@example.com', 'jane@example.net')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  isValidCountryCode,
  isValidLanguageCode,
  isValidTimeZone,
} from './locale.js';

describe('isValidLanguageCode', () => {
  it('accepts known lowercase ISO 639-1 codes', () => {
    expect(isValidLanguageCode('en')).toBe(true);
    expect(isValidLanguageCode('pt')).toBe(true);
    expect(isValidLanguageCode('es')).toBe(true);
  });

  it('rejects unknown, malformed and uppercase codes', () => {
    expect(isValidLanguageCode('xx')).toBe(false);
    expect(isValidLanguageCode('EN')).toBe(false);
    expect(isValidLanguageCode('english')).toBe(false);
    expect(isValidLanguageCode('e')).toBe(false);
  });
});

describe('isValidCountryCode', () => {
  it('accepts known uppercase alpha-2 codes', () => {
    expect(isValidCountryCode('US')).toBe(true);
    expect(isValidCountryCode('PT')).toBe(true);
    expect(isValidCountryCode('CA')).toBe(true);
  });

  it('rejects unknown, malformed and lowercase codes', () => {
    expect(isValidCountryCode('ZZ')).toBe(false);
    expect(isValidCountryCode('us')).toBe(false);
    expect(isValidCountryCode('USA')).toBe(false);
    expect(isValidCountryCode('1')).toBe(false);
  });

  it('rejects numeric region codes the profile column cannot store', () => {
    expect(isValidCountryCode('00')).toBe(false);
  });
});

describe('isValidTimeZone', () => {
  it('accepts canonical IANA zones', () => {
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Europe/Lisbon')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
  });

  it('rejects unknown zones and junk', () => {
    expect(isValidTimeZone('Europe/Nosuchplace')).toBe(false);
    expect(isValidTimeZone('not-a-zone')).toBe(false);
  });
});

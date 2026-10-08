/**
 * RFC 5646 / CLDR-backed validation for the free-text locale fields on the
 * freelance profile (timezone, country, and spoken languages).
 *
 * Country and language codes are checked against the versioned ISO lists in
 * `constants/iso-codes.ts` so behaviour is identical on every engine. Timezones
 * are verified against the `Intl` IANA table, which accepts fixed-offset names
 * such as `UTC` that `Intl.supportedValuesOf('timeZone')` omits.
 */

import {
  COUNTRY_CODES_SET,
  LANGUAGE_CODES_SET,
} from '../constants/iso-codes.js';

export function isValidLanguageCode(code: string): boolean {
  return /^[a-z]{2}$/.test(code) && LANGUAGE_CODES_SET.has(code);
}

export function isValidCountryCode(code: string): boolean {
  return /^[A-Z]{2}$/.test(code) && COUNTRY_CODES_SET.has(code);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

import {
  AVAILABILITY,
  CURRENCIES,
  EXPERIENCE_LEVELS,
  PROFILE_VISIBILITIES,
} from '@wervi/shared';
import { index, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.js';
import {
  bothOrNeither,
  createdAt,
  currencyCode,
  enumColumn,
  minorUnits,
  nonNegative,
  oneOf,
  optionalEnumColumn,
  optionalOneOf,
  optionalTimestamp,
  updatedAt,
} from '../common/index.js';

/**
 * The freelancer-facing half of an account.
 *
 * `user_id` is both the primary key and the foreign key: the profile is the
 * account, not a separate entity with a surrogate key of its own, which keeps
 * every "profile for this user" query a single index lookup.
 *
 * A freelancer with no listed rate is legitimate — they may bid fixed-price
 * only — so `hourly_rate_minor` and `currency` are optional but must be set
 * together. A CHECK constraint accepts NULL, which is why the non-negative rules
 * below need no `is null` guard.
 */
export const freelancerProfiles = pgTable(
  'freelancer_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    headline: text().notNull(),
    bio: text(),
    hourlyRateMinor: minorUnits('hourly_rate_minor'),
    currency: currencyCode(),
    availability: enumColumn('availability', AVAILABILITY),
    timezone: text().notNull(),
    countryCode: varchar('country_code', { length: 2 }),
    experienceLevel: optionalEnumColumn('experience_level', EXPERIENCE_LEVELS),
    visibility: enumColumn('visibility', PROFILE_VISIBILITIES),
    completedAt: optionalTimestamp('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('freelancer_profiles_availability_idx').on(table.availability),
    index('freelancer_profiles_country_code_idx').on(table.countryCode),
    oneOf('freelancer_profiles_currency_check', table.currency, CURRENCIES),
    oneOf(
      'freelancer_profiles_availability_check',
      table.availability,
      AVAILABILITY,
    ),
    oneOf(
      'freelancer_profiles_visibility_check',
      table.visibility,
      PROFILE_VISIBILITIES,
    ),
    optionalOneOf(
      'freelancer_profiles_experience_level_check',
      table.experienceLevel,
      EXPERIENCE_LEVELS,
    ),
    nonNegative('freelancer_profiles_hourly_rate_check', table.hourlyRateMinor),
    bothOrNeither(
      'freelancer_profiles_rate_currency_pair_check',
      table.hourlyRateMinor,
      table.currency,
    ),
  ],
);

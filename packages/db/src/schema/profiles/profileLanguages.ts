import { LANGUAGE_PROFICIENCIES } from '@wervi/shared';
import {
  index,
  pgTable,
  primaryKey,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { oneOf } from '../common/index.js';
import { freelancerProfiles } from './freelancerProfiles.js';

/**
 * Languages a freelancer works in, as ISO 639-1 codes.
 *
 * Codes rather than rows: the display name comes from `Intl.DisplayNames` at
 * render time, so WERVI does not carry a language table it would only ever
 * read.
 */
export const profileLanguages = pgTable(
  'profile_languages',
  {
    freelancerId: uuid('freelancer_id')
      .notNull()
      .references(() => freelancerProfiles.userId, { onDelete: 'cascade' }),
    languageCode: varchar('language_code', { length: 2 }).notNull(),
    proficiency: text().notNull(),
  },
  (table) => [
    primaryKey({
      name: 'profile_languages_pkey',
      columns: [table.freelancerId, table.languageCode],
    }),
    index('profile_languages_language_code_idx').on(table.languageCode),
    oneOf(
      'profile_languages_proficiency_check',
      table.proficiency,
      LANGUAGE_PROFICIENCIES,
    ),
  ],
);

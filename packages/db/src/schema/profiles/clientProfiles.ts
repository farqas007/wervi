import { index, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.js';
import { createdAt, updatedAt } from '../common/index.js';

/**
 * The client-facing half of an account: who is hiring and why.
 *
 * Separate from `freelancer_profiles` because the two answer different
 * questions and are shown on different pages, and because an account may have
 * both. Neither table implies the `client` role — that lives on the account.
 */
export const clientProfiles = pgTable(
  'client_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyName: text().notNull(),
    about: text(),
    websiteUrl: text(),
    countryCode: varchar('country_code', { length: 2 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('client_profiles_country_code_idx').on(table.countryCode)],
);

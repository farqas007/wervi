import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import {
  createdAt,
  optionalTimestamp,
  primaryId,
  updatedAt,
} from '../common/index.js';
import { users } from './users.js';

/**
 * One authentication method linked to a user: a credential login, or an OAuth
 * identity from a provider. Column names follow the Better Auth core schema.
 *
 * CASCADE on `user_id`: credentials and OAuth links have no meaning without
 * the account, so account deletion must not be blocked by them.
 */
export const authAccounts = pgTable(
  'auth_accounts',
  {
    id: primaryId(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: optionalTimestamp('access_token_expires_at'),
    refreshTokenExpiresAt: optionalTimestamp('refresh_token_expires_at'),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // The provider-side identity is (provider, account); a local id may repeat.
    uniqueIndex('auth_accounts_provider_account_unique').on(
      table.providerId,
      table.accountId,
    ),
    index('auth_accounts_user_id_idx').on(table.userId),
  ],
);

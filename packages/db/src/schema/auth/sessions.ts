import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import {
  createdAt,
  requiredTimestamp,
  primaryId,
  updatedAt,
} from '../common/index.js';
import { users } from './users.js';

/**
 * A signed-in browser session. Better Auth core schema.
 *
 * `token` is unique because it is the bearer credential, and `expires_at` is
 * indexed so expired sessions can be swept in one statement rather than by
 * scanning every session.
 */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: primaryId(),
    token: text().notNull(),
    expiresAt: requiredTimestamp('expires_at'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('auth_sessions_token_unique').on(table.token),
    index('auth_sessions_user_id_idx').on(table.userId),
    index('auth_sessions_expires_at_idx').on(table.expiresAt),
  ],
);

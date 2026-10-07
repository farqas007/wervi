import { index, pgTable, text } from 'drizzle-orm/pg-core';
import {
  createdAt,
  primaryId,
  requiredTimestamp,
  updatedAt,
} from '../common/index.js';

/**
 * Short-lived tokens: email verification, password reset, magic links. Better
 * Auth core schema.
 *
 * Rows are looked up by `identifier` (the email address) and deleted once
 * consumed, so the column is indexed and the table is never joined.
 */
export const authVerifications = pgTable(
  'auth_verifications',
  {
    id: primaryId(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: requiredTimestamp('expires_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('auth_verifications_identifier_idx').on(table.identifier)],
);

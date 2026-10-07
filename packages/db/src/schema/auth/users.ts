import { ROLES, USER_STATUSES, type Role } from '@wervi/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  arraySubsetOf,
  createdAt,
  deletedAt,
  enumColumn,
  oneOf,
  primaryId,
  updatedAt,
} from '../common/index.js';

/**
 * A person who can sign in. Roles are additive: one account may hire *and*
 * bid, which is why they are an array rather than a single column.
 *
 * The table is shaped for the Better Auth Drizzle adapter (Phase 3):
 * `email_verified` is a boolean, `id` is a database-generated UUID, and the
 * adapter is pointed at these tables by name. WERVI adds `roles`, `status` and
 * `deleted_at` on top; Phase 3 declares them through `additionalFields`.
 */
export const users = pgTable(
  'users',
  {
    id: primaryId(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text(),
    // Typed as `Role[]` rather than `string[]`: the array is validated by a
    // CHECK constraint, and carrying the type means a caller cannot build a
    // value the constraint would reject.
    roles: text('roles')
      .array()
      .$type<Role[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: enumColumn('status', USER_STATUSES),
    deletedAt: deletedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Case-insensitive uniqueness: sign-up must not depend on the caller
    // lower-casing the address, and two accounts differing only by case are the
    // same account. Queries match with `lower(email) = lower($1)`.
    uniqueIndex('users_email_unique').on(sql`lower(${table.email})`),
    index('users_roles_idx').using('gin', table.roles),
    index('users_status_idx').on(table.status),
    oneOf('users_status_check', table.status, USER_STATUSES),
    arraySubsetOf('users_roles_check', table.roles, ROLES),
  ],
);

import {
  MAX_REVIEW_RATING,
  MIN_REVIEW_RATING,
  REVIEW_STATUSES,
} from '@wervi/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/users.js';
import {
  createdAt,
  enumColumn,
  inRange,
  oneOf,
  optionalTimestamp,
  primaryId,
  updatedAt,
} from '../common/index.js';
import { contracts } from '../contracts/contracts.js';

/**
 * A two-way review of one party by the other, once a contract has completed.
 *
 * Direction is derived from the contract (`subject_id` is simply the other
 * party) rather than stored, so a row cannot claim to review the wrong side.
 *
 * `(contract_id, author_id)` is unique — one review per party per contract, as
 * docs/SUBSYSTEMS.md requires — and the edit window is represented by
 * `editable_until` rather than by a trigger, so the immutable-after-window rule
 * is enforceable in one transaction in the service layer.
 *
 * Reputation aggregates are not stored here; they are computed asynchronously in
 * Phase 11 and denormalised onto the profile tables then.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: primaryId(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'restrict' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    rating: smallint('rating').notNull(),
    title: text(),
    body: text(),
    status: enumColumn('status', REVIEW_STATUSES),
    editableUntil: optionalTimestamp('editable_until'),
    publishedAt: optionalTimestamp('published_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('reviews_contract_id_author_id_unique').on(
      table.contractId,
      table.authorId,
    ),
    index('reviews_subject_id_status_idx').on(table.subjectId, table.status),
    index('reviews_author_id_idx').on(table.authorId),
    oneOf('reviews_status_check', table.status, REVIEW_STATUSES),
    inRange(
      'reviews_rating_check',
      table.rating,
      MIN_REVIEW_RATING,
      MAX_REVIEW_RATING,
    ),
    check(
      'reviews_author_not_subject_check',
      sql`${table.authorId} <> ${table.subjectId}`,
    ),
  ],
);

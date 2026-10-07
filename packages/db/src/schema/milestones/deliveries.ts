import { DELIVERY_OUTCOMES, MIN_REVISION_NUMBER } from '@wervi/shared';
import {
  index,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/users.js';
import {
  atLeast,
  bothOrNeither,
  createdAt,
  optionalEnumColumn,
  optionalOneOf,
  optionalTimestamp,
  primaryId,
  requiredTimestamp,
} from '../common/index.js';
import { milestones } from './milestones.js';

/**
 * One delivery of a milestone, and the client's verdict on it.
 *
 * Append-only: a revision cycle adds a row rather than overwriting the previous
 * submission, because a dispute (Phase 12) needs the whole history of what was
 * delivered and when. There is no `updated_at` on this table for the same
 * reason — `reviewed_at` and `outcome` are the only fields that ever change.
 *
 * `(milestone_id, revision_number)` is unique, so a delivery can never claim to
 * be the second revision when a first already exists, and `outcome` is tied to
 * `reviewed_at` so a verdict cannot exist without its timestamp.
 */
export const milestoneDeliveries = pgTable(
  'milestone_deliveries',
  {
    id: primaryId(),
    milestoneId: uuid('milestone_id')
      .notNull()
      .references(() => milestones.id, { onDelete: 'cascade' }),
    revisionNumber: smallint('revision_number').notNull(),
    note: text(),
    outcome: optionalEnumColumn('outcome', DELIVERY_OUTCOMES),
    reviewedBy: uuid('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    submittedAt: requiredTimestamp('submitted_at').defaultNow(),
    reviewedAt: optionalTimestamp('reviewed_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('milestone_deliveries_milestone_revision_unique').on(
      table.milestoneId,
      table.revisionNumber,
    ),
    index('milestone_deliveries_milestone_id_idx').on(table.milestoneId),
    atLeast(
      'milestone_deliveries_revision_check',
      table.revisionNumber,
      MIN_REVISION_NUMBER,
    ),
    optionalOneOf(
      'milestone_deliveries_outcome_check',
      table.outcome,
      DELIVERY_OUTCOMES,
    ),
    bothOrNeither(
      'milestone_deliveries_review_pair_check',
      table.outcome,
      table.reviewedAt,
    ),
  ],
);

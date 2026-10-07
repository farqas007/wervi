import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import {
  createdAt,
  nonNegative,
  optionalTimestamp,
  primaryId,
  updatedAt,
} from '../common/index.js';
import { freelancerProfiles } from './freelancerProfiles.js';

/**
 * A piece of work a freelancer wants clients to see.
 *
 * Ordered by `position` rather than a timestamp so a freelancer can reorder
 * their portfolio without re-uploading anything. Attachment metadata arrives in
 * Phase 4 as a `files` row per item rather than as a URL column, so image
 * hosting can change without rewriting this table.
 */
export const portfolioItems = pgTable(
  'portfolio_items',
  {
    id: primaryId(),
    freelancerId: uuid('freelancer_id')
      .notNull()
      .references(() => freelancerProfiles.userId, { onDelete: 'cascade' }),
    title: text().notNull(),
    description: text(),
    position: integer('position').notNull().default(0),
    publishedAt: optionalTimestamp('published_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('portfolio_items_freelancer_id_position_idx').on(
      table.freelancerId,
      table.position,
    ),
    nonNegative('portfolio_items_position_check', table.position),
  ],
);

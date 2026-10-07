import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, primaryId, updatedAt } from '../common/index.js';
import { categories } from './categories.js';

/**
 * The skill taxonomy shared by job listings and freelancer profiles, so a job
 * and the freelancer bidding on it are described in the same vocabulary.
 *
 * RESTRICT on `category_id`: taxonomy rows are referenced by historical jobs
 * and profiles and are deactivated (`is_active = false`) rather than deleted.
 */
export const skills = pgTable(
  'skills',
  {
    id: primaryId(),
    slug: text().notNull(),
    name: text().notNull(),
    categoryId: uuid('category_id').references(() => categories.id, {
      onDelete: 'restrict',
    }),
    position: integer('position').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('skills_slug_unique').on(table.slug),
    index('skills_category_id_idx').on(table.categoryId),
    index('skills_position_idx').on(table.position),
  ],
);

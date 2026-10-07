import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  createdAt,
  notSelfReferential,
  primaryId,
  updatedAt,
} from '../common/index.js';

/**
 * Job categories, one level of nesting deep in practice (`parent_id` allows a
 * tree but the UI only renders two levels).
 *
 * RESTRICT on the parent reference: a category that is still in use by skills
 * or jobs must not disappear from under them.
 */
export const categories = pgTable(
  'categories',
  {
    id: primaryId(),
    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
    parentId: uuid('parent_id'),
    position: integer('position').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('categories_slug_unique').on(table.slug),
    index('categories_parent_id_idx').on(table.parentId),
    index('categories_position_idx').on(table.position),
    notSelfReferential(
      'categories_parent_not_self_check',
      table.parentId,
      table.id,
    ),
    foreignKey({
      name: 'categories_parent_id_fk',
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete('restrict'),
  ],
);

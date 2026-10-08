import {
  BUDGET_MODELS,
  CONTRACT_DURATIONS,
  CURRENCIES,
  EXPERIENCE_LEVELS,
  JOB_STATUSES,
  JOB_VISIBILITIES,
  WORK_MODES,
} from '@wervi/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/users.js';
import { categories } from '../taxonomy/categories.js';
import {
  createdAt,
  currencyCode,
  enumColumn,
  minorUnits,
  nonNegative,
  notGreaterThan,
  oneOf,
  optionalEnumColumn,
  optionalOneOf,
  optionalTimestamp,
  primaryId,
  updatedAt,
} from '../common/index.js';

/**
 * A job listing.
 *
 * `proposal_count` is a denormalised counter maintained transactionally by the
 * proposal service (Phase 6) so the browse page never runs a `COUNT(*)` per
 * row. It is constrained to be non-negative so a bad update cannot quietly
 * corrupt the listing.
 *
 * The unique index on `(id, client_id)` is not for uniqueness of its own: it is
 * the target of the composite foreign key from `proposals` and `contracts`,
 * which is what makes "a proposal's client is the job's client" a database
 * invariant rather than a service-layer promise.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: primaryId(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // The taxonomy row the listing is filed under. RESTRICT, like a skill's
    // category: a category that still files jobs is retired (`is_active =
    // false`), not deleted. Nullable only so the column can be added to a
    // table that already holds rows — every job the API creates carries one.
    categoryId: uuid('category_id').references(() => categories.id, {
      onDelete: 'restrict',
    }),
    slug: text().notNull(),
    title: text().notNull(),
    description: text().notNull(),
    status: enumColumn('status', JOB_STATUSES),
    visibility: enumColumn('visibility', JOB_VISIBILITIES),
    budgetModel: enumColumn('budget_model', BUDGET_MODELS),
    budgetMinMinor: minorUnits('budget_min_minor'),
    budgetMaxMinor: minorUnits('budget_max_minor'),
    currency: currencyCode().notNull(),
    experienceLevel: optionalEnumColumn('experience_level', EXPERIENCE_LEVELS),
    duration: optionalEnumColumn('duration', CONTRACT_DURATIONS),
    workMode: enumColumn('work_mode', WORK_MODES),
    countryCode: varchar('country_code', { length: 2 }),
    proposalCount: integer('proposal_count').notNull().default(0),
    publishedAt: optionalTimestamp('published_at'),
    closedAt: optionalTimestamp('closed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('jobs_slug_key').on(table.slug),
    // A unique *constraint*, not a unique index: `proposals` and `contracts`
    // reference (id, client_id) with a composite foreign key, and PostgreSQL
    // will not accept a plain index as the target of a foreign key.
    unique('jobs_id_client_id_key').on(table.id, table.clientId),
    index('jobs_status_published_at_idx').on(table.status, table.publishedAt),
    index('jobs_client_id_created_at_idx').on(table.clientId, table.createdAt),
    index('jobs_work_mode_idx').on(table.workMode),
    index('jobs_category_id_idx').on(table.categoryId),
    oneOf('jobs_status_check', table.status, JOB_STATUSES),
    oneOf('jobs_visibility_check', table.visibility, JOB_VISIBILITIES),
    oneOf('jobs_budget_model_check', table.budgetModel, BUDGET_MODELS),
    oneOf('jobs_work_mode_check', table.workMode, WORK_MODES),
    oneOf('jobs_currency_check', table.currency, CURRENCIES),
    optionalOneOf(
      'jobs_experience_level_check',
      table.experienceLevel,
      EXPERIENCE_LEVELS,
    ),
    optionalOneOf('jobs_duration_check', table.duration, CONTRACT_DURATIONS),
    nonNegative('jobs_budget_min_check', table.budgetMinMinor),
    nonNegative('jobs_budget_max_check', table.budgetMaxMinor),
    notGreaterThan(
      'jobs_budget_range_check',
      table.budgetMinMinor,
      table.budgetMaxMinor,
    ),
    nonNegative('jobs_proposal_count_check', table.proposalCount),
    // A published listing must carry the timestamp the browse page sorts by.
    check(
      'jobs_published_at_check',
      sql`${table.status} <> 'published' or ${table.publishedAt} is not null`,
    ),
    check(
      'jobs_closed_at_check',
      sql`${table.status} <> 'closed' or ${table.closedAt} is not null`,
    ),
  ],
);

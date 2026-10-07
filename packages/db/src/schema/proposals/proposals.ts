import { CURRENCIES, PROPOSAL_STATUSES } from '@wervi/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/users.js';
import {
  atLeast,
  createdAt,
  currencyCode,
  enumColumn,
  minorUnits,
  oneOf,
  optionalInRange,
  optionalTimestamp,
  primaryId,
  requiredTimestamp,
  updatedAt,
} from '../common/index.js';
import { jobs } from '../jobs/jobs.js';

/**
 * A freelancer's bid on a job.
 *
 * Three rules are enforced here rather than in the service layer, because they
 * are the ones a race condition or a buggy client would break:
 *
 *  1. At most one accepted proposal per job (partial unique index). "A job
 *     accepts at most one proposal" is the exclusivity promise in
 *     docs/SUBSYSTEMS.md, and it must hold even if two accept requests arrive
 *     simultaneously.
 *  2. One proposal per freelancer per job — revising edits the row.
 *  3. `client_id` mirrors the job's client, enforced by the composite foreign
 *     key, which together with the CHECK constraint makes bidding on your own
 *     job impossible at the database level.
 *
 * `client_id` is denormalised for those two constraints and because "proposals
 * on my jobs" is the hottest client-side query; it cannot drift, since the
 * composite FK rejects any mismatch.
 *
 * The row is also the target of two composite foreign keys from `contracts`, so
 * a contract cannot claim a proposal from another job, or a proposal belonging
 * to a different freelancer. That is what keeps escrow and payouts attached to
 * the party who actually won the work.
 */
export const proposals = pgTable(
  'proposals',
  {
    id: primaryId(),
    jobId: uuid('job_id').notNull(),
    clientId: uuid('client_id').notNull(),
    freelancerId: uuid('freelancer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: enumColumn('status', PROPOSAL_STATUSES),
    coverLetter: text().notNull(),
    amountMinor: minorUnits('amount_minor').notNull(),
    currency: currencyCode().notNull(),
    deliveryDays: integer('delivery_days'),
    revision: integer('revision').notNull().default(1),
    clientNote: text('client_note'),
    rejectionReason: text('rejection_reason'),
    submittedAt: requiredTimestamp('submitted_at').defaultNow(),
    shortlistedAt: optionalTimestamp('shortlisted_at'),
    decidedAt: optionalTimestamp('decided_at'),
    withdrawnAt: optionalTimestamp('withdrawn_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: 'proposals_job_id_client_id_fk',
      columns: [table.jobId, table.clientId],
      foreignColumns: [jobs.id, jobs.clientId],
    }).onDelete('restrict'),
    uniqueIndex('proposals_job_id_freelancer_id_unique').on(
      table.jobId,
      table.freelancerId,
    ),
    // Composite foreign-key targets for `contracts`. A contract must reference
    // a proposal that belongs to its own job and whose freelancer is its own
    // freelancer, and PostgreSQL only permits a multi-column foreign key to
    // reference a unique constraint — never a plain index. Redundant against the
    // primary key on `id` alone, and deliberately so, exactly like
    // `jobs_id_client_id_key`: without it the contract side of the relationship
    // cannot be expressed as a database invariant at all.
    unique('proposals_id_job_id_key').on(table.id, table.jobId),
    unique('proposals_id_freelancer_id_key').on(table.id, table.freelancerId),
    uniqueIndex('proposals_one_accepted_per_job_unique')
      .on(table.jobId)
      .where(sql`${table.status} = 'accepted'`),
    index('proposals_freelancer_id_status_idx').on(
      table.freelancerId,
      table.status,
    ),
    index('proposals_client_id_status_idx').on(table.clientId, table.status),
    index('proposals_job_id_status_idx').on(table.jobId, table.status),
    oneOf('proposals_status_check', table.status, PROPOSAL_STATUSES),
    oneOf('proposals_currency_check', table.currency, CURRENCIES),
    check('proposals_amount_positive_check', sql`${table.amountMinor} > 0`),
    atLeast('proposals_revision_check', table.revision, 1),
    check(
      'proposals_client_not_freelancer_check',
      sql`${table.clientId} <> ${table.freelancerId}`,
    ),
    optionalInRange(
      'proposals_delivery_days_check',
      table.deliveryDays,
      1,
      3650,
    ),
    check(
      'proposals_accepted_needs_decision_check',
      sql`${table.status} <> 'accepted' or ${table.decidedAt} is not null`,
    ),
  ],
);

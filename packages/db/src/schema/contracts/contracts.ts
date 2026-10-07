import { BUDGET_MODELS, CONTRACT_STATUSES, CURRENCIES } from '@wervi/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  createdAt,
  currencyCode,
  dateOnly,
  enumColumn,
  minorUnits,
  notGreaterThan,
  oneOf,
  optionalTimestamp,
  primaryId,
  updatedAt,
} from '../common/index.js';
import { users } from '../auth/users.js';
import { jobs } from '../jobs/jobs.js';
import { proposals } from '../proposals/proposals.js';

/**
 * The agreement between a client and a freelancer, created when a proposal is
 * accepted.
 *
 * Terms are snapshotted into real columns rather than referenced from the job
 * and proposal: once money is involved, a later edit to a listing must not be
 * able to rewrite what was agreed. `scope` and `agreed_amount_minor` are what
 * the parties signed up to, whatever the job says later.
 *
 * Exclusivity: a unique index on `proposal_id` (one contract per acceptance)
 * and a partial unique index on `job_id` for contracts that are not cancelled.
 *
 * Both parties are pinned to the accepted proposal by composite foreign keys
 * rather than trusted from the service layer. `job_id` cannot disagree with the
 * proposal's job, and `freelancer_id` cannot disagree with the proposal's
 * freelancer — which is the difference between a contract and a plausible-looking
 * row that would pay the wrong person. `client_id` is already pinned, because it
 * is half of the composite key with `job_id` against `jobs(id, client_id)`.
 */
export const contracts = pgTable(
  'contracts',
  {
    id: primaryId(),
    jobId: uuid('job_id').notNull(),
    proposalId: uuid('proposal_id').notNull(),
    clientId: uuid('client_id').notNull(),
    freelancerId: uuid('freelancer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: enumColumn('status', CONTRACT_STATUSES),
    title: text().notNull(),
    scope: text(),
    budgetModel: enumColumn('budget_model', BUDGET_MODELS),
    agreedAmountMinor: minorUnits('agreed_amount_minor').notNull(),
    currency: currencyCode().notNull(),
    startsOn: dateOnly('starts_on'),
    endsOn: dateOnly('ends_on'),
    activatedAt: optionalTimestamp('activated_at'),
    completedAt: optionalTimestamp('completed_at'),
    cancelledAt: optionalTimestamp('cancelled_at'),
    disputedAt: optionalTimestamp('disputed_at'),
    cancellationReason: text('cancellation_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: 'contracts_job_id_client_id_fk',
      columns: [table.jobId, table.clientId],
      foreignColumns: [jobs.id, jobs.clientId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'contracts_proposal_id_job_id_fk',
      columns: [table.proposalId, table.jobId],
      foreignColumns: [proposals.id, proposals.jobId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'contracts_proposal_id_freelancer_id_fk',
      columns: [table.proposalId, table.freelancerId],
      foreignColumns: [proposals.id, proposals.freelancerId],
    }).onDelete('restrict'),
    uniqueIndex('contracts_proposal_id_unique').on(table.proposalId),
    uniqueIndex('contracts_one_open_per_job_unique')
      .on(table.jobId)
      .where(sql`${table.status} <> 'cancelled'`),
    index('contracts_client_id_status_idx').on(table.clientId, table.status),
    index('contracts_freelancer_id_status_idx').on(
      table.freelancerId,
      table.status,
    ),
    oneOf('contracts_status_check', table.status, CONTRACT_STATUSES),
    oneOf('contracts_budget_model_check', table.budgetModel, BUDGET_MODELS),
    oneOf('contracts_currency_check', table.currency, CURRENCIES),
    check(
      'contracts_amount_positive_check',
      sql`${table.agreedAmountMinor} > 0`,
    ),
    check(
      'contracts_client_not_freelancer_check',
      sql`${table.clientId} <> ${table.freelancerId}`,
    ),
    notGreaterThan('contracts_dates_order_check', table.startsOn, table.endsOn),
    check(
      'contracts_completed_at_check',
      sql`${table.status} <> 'completed' or ${table.completedAt} is not null`,
    ),
    check(
      'contracts_cancelled_at_check',
      sql`${table.status} <> 'cancelled' or ${table.cancelledAt} is not null`,
    ),
  ],
);

import {
  CURRENCIES,
  DEFAULT_MAX_REVISIONS,
  MAX_ALLOWED_REVISIONS,
  MILESTONE_STATUSES,
} from '@wervi/shared';
import {
  index,
  integer,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { contracts } from '../contracts/contracts.js';
import {
  atMost,
  atLeast,
  createdAt,
  currencyCode,
  dateOnly,
  enumColumn,
  minorUnits,
  oneOf,
  optionalTimestamp,
  positive,
  primaryId,
  updatedAt,
} from '../common/index.js';

/**
 * One agreed unit of work inside a contract.
 *
 * `position` is unique per contract and contiguous by convention: milestone
 * order is part of the agreement, not a creation timestamp. `max_revisions`
 * bounds the review loop so a client cannot demand endless revisions by
 * accident and so a freelancer can price the risk.
 *
 * Amounts are per milestone; the contract total is derived, not stored, so a
 * plan cannot disagree with itself.
 */
export const milestones = pgTable(
  'milestones',
  {
    id: primaryId(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'restrict' }),
    title: text().notNull(),
    description: text(),
    position: integer('position').notNull(),
    amountMinor: minorUnits('amount_minor').notNull(),
    currency: currencyCode().notNull(),
    status: enumColumn('status', MILESTONE_STATUSES),
    dueDate: dateOnly('due_date'),
    maxRevisions: smallint('max_revisions')
      .notNull()
      .default(DEFAULT_MAX_REVISIONS),
    fundedAt: optionalTimestamp('funded_at'),
    submittedAt: optionalTimestamp('submitted_at'),
    acceptedAt: optionalTimestamp('accepted_at'),
    releasedAt: optionalTimestamp('released_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('milestones_contract_id_position_unique').on(
      table.contractId,
      table.position,
    ),
    index('milestones_contract_id_status_idx').on(
      table.contractId,
      table.status,
    ),
    index('milestones_due_date_idx').on(table.dueDate),
    oneOf('milestones_status_check', table.status, MILESTONE_STATUSES),
    oneOf('milestones_currency_check', table.currency, CURRENCIES),
    positive('milestones_amount_positive_check', table.amountMinor),
    positive('milestones_position_positive_check', table.position),
    atLeast('milestones_max_revisions_min_check', table.maxRevisions, 0),
    atMost(
      'milestones_max_revisions_max_check',
      table.maxRevisions,
      MAX_ALLOWED_REVISIONS,
    ),
  ],
);

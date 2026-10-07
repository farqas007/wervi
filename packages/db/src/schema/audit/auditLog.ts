import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/users.js';
import { primaryId } from '../common/index.js';

/**
 * Append-only record of state changes worth keeping: acceptances, status
 * transitions, moderation actions, dispute resolutions.
 *
 * Deliberately not a foreign-key-per-entity table. `entity_id` has no foreign
 * key because the point of an audit trail is to outlive the rows it describes,
 * and because a polymorphic owner column (`owner_type` + `owner_id`) is exactly
 * the pattern this schema avoids everywhere else. Structured history that the
 * domain must enforce — contract terms, milestone deliveries — lives in its own
 * table instead.
 *
 * `request_id` correlates a row with the API request that produced it, matching
 * the `requestId` already returned in every error envelope.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: primaryId(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    action: text().notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    requestId: text('request_id'),
    data: jsonb('data').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('audit_log_entity_idx').on(table.entityType, table.entityId),
    index('audit_log_actor_user_id_idx').on(table.actorUserId),
    index('audit_log_created_at_idx').on(table.createdAt),
    index('audit_log_request_id_idx').on(table.requestId),
  ],
);

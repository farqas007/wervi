import { z } from 'zod';

/**
 * Lifecycle statuses for every stateful aggregate in the marketplace.
 *
 * The lists live in `@wervi/shared` rather than in `@wervi/db` for one reason:
 * the database CHECK constraint, the Zod request/response contracts and the
 * TypeScript types must all come from a single list, or they drift and the
 * database starts rejecting values the API happily accepts.
 *
 * Statuses are plain text plus a CHECK constraint rather than native PostgreSQL
 * enums on purpose. `drizzle-kit generate` does not detect a value added to a
 * `pgEnum`, so new statuses would need hand-written `ALTER TYPE` migrations
 * that the CI drift check cannot see. A CHECK constraint evolves as an ordinary
 * generated migration.
 *
 * Transitions are pure data with no side effects; the service layer owns those
 * (emails, escrow, notifications) and maps `InvalidTransitionError` onto the
 * `conflict` error code.
 */

export const USER_STATUSES = [
  'pending',
  'active',
  'suspended',
  'closed',
] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const JOB_STATUSES = ['draft', 'published', 'paused', 'closed'] as const;
export const jobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const PROPOSAL_STATUSES = [
  'submitted',
  'shortlisted',
  'rejected',
  'accepted',
  'withdrawn',
  'expired',
] as const;
export const proposalStatusSchema = z.enum(PROPOSAL_STATUSES);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const CONTRACT_STATUSES = [
  'draft',
  'active',
  'paused',
  'completed',
  'cancelled',
  'disputed',
] as const;
export const contractStatusSchema = z.enum(CONTRACT_STATUSES);
export type ContractStatus = z.infer<typeof contractStatusSchema>;

export const MILESTONE_STATUSES = [
  'planned',
  'funded',
  'in_progress',
  'submitted',
  'changes_requested',
  'approved',
  'released',
  'cancelled',
] as const;
export const milestoneStatusSchema = z.enum(MILESTONE_STATUSES);
export type MilestoneStatus = z.infer<typeof milestoneStatusSchema>;

export const REVIEW_STATUSES = [
  'published',
  'pending_edit',
  'hidden',
  'removed',
] as const;
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

/** A status and the statuses it may move to. Absent means "stays put". */
export type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;

export const USER_STATUS_TRANSITIONS = {
  pending: ['active', 'closed'],
  active: ['suspended', 'closed'],
  suspended: ['active', 'closed'],
  closed: [],
} as const satisfies TransitionMap<UserStatus>;

export const JOB_STATUS_TRANSITIONS = {
  draft: ['published', 'closed'],
  published: ['paused', 'closed'],
  paused: ['published', 'closed'],
  closed: [],
} as const satisfies TransitionMap<JobStatus>;

export const PROPOSAL_STATUS_TRANSITIONS = {
  submitted: ['shortlisted', 'rejected', 'accepted', 'withdrawn', 'expired'],
  shortlisted: ['rejected', 'accepted', 'withdrawn', 'expired'],
  accepted: [],
  rejected: [],
  withdrawn: [],
  expired: [],
} as const satisfies TransitionMap<ProposalStatus>;

export const CONTRACT_STATUS_TRANSITIONS = {
  draft: ['active', 'cancelled'],
  active: ['paused', 'completed', 'cancelled', 'disputed'],
  paused: ['active', 'cancelled', 'disputed'],
  completed: ['disputed'],
  cancelled: [],
  disputed: ['active', 'completed', 'cancelled'],
} as const satisfies TransitionMap<ContractStatus>;

export const MILESTONE_STATUS_TRANSITIONS = {
  planned: ['funded', 'cancelled'],
  funded: ['in_progress', 'cancelled'],
  in_progress: ['submitted', 'cancelled'],
  submitted: ['changes_requested', 'approved', 'cancelled'],
  changes_requested: ['in_progress', 'submitted', 'cancelled'],
  approved: ['released', 'cancelled'],
  released: [],
  cancelled: [],
} as const satisfies TransitionMap<MilestoneStatus>;

/**
 * REVIEW_STATUS_TRANSITIONS is intentionally absent: a review is immutable
 * after its edit window, so its only transition is `published -> hidden` and
 * `hidden -> published` during moderation. That rule belongs to Phase 11 with
 * the rest of the moderation surface.
 */

export class InvalidTransitionError extends Error {
  readonly entity: string;
  readonly from: string;
  readonly to: string;

  constructor(entity: string, from: string, to: string) {
    super(`${entity} cannot move from "${from}" to "${to}"`);
    this.name = 'InvalidTransitionError';
    this.entity = entity;
    this.from = from;
    this.to = to;
  }
}

export function canTransition<S extends string>(
  transitions: TransitionMap<S>,
  from: S,
  to: S,
): boolean {
  return transitions[from].includes(to);
}

/** Throw unless the transition is allowed. Call from the service layer. */
export function assertTransition<S extends string>(
  entity: string,
  transitions: TransitionMap<S>,
  from: S,
  to: S,
): void {
  if (!canTransition(transitions, from, to)) {
    throw new InvalidTransitionError(entity, from, to);
  }
}

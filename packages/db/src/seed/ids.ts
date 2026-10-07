import { randomUUID } from 'node:crypto';

/**
 * Fixed identifiers and timestamps for the development seed.
 *
 * Seed data is generated, not random, and not hashed from a password: the same
 * command produces the same rows in the same order every time, so a seed that
 * breaks can be reproduced and a diff means a real change. UUIDs are pinned
 * here rather than derived from row contents so that re-running the seed can
 * update rows in place instead of orphaning every foreign key that pointed at
 * them.
 */
export const SEED_RUN_ID = '00000000-0000-4000-8000-000000000001';

/** A fixed instant, so seeded timestamps are reproducible across runs. */
export const SEED_TIMESTAMP = new Date('2024-01-01T00:00:00.000Z');

export const seedIds = {
  users: {
    client: '10000000-0000-4000-8000-000000000001',
    freelancerA: '10000000-0000-4000-8000-000000000002',
    freelancerB: '10000000-0000-4000-8000-000000000003',
    admin: '10000000-0000-4000-8000-000000000004',
    suspended: '10000000-0000-4000-8000-000000000005',
    freelancerC: '10000000-0000-4000-8000-000000000006',
  },
  categories: {
    engineering: '20000000-0000-4000-8000-000000000001',
    design: '20000000-0000-4000-8000-000000000002',
    writing: '20000000-0000-4000-8000-000000000003',
  },
  skills: {
    typescript: '30000000-0000-4000-8000-000000000001',
    postgres: '30000000-0000-4000-8000-000000000002',
    react: '30000000-0000-4000-8000-000000000003',
    figure: '30000000-0000-4000-8000-000000000004',
    technicalWriting: '30000000-0000-4000-8000-000000000005',
  },
  jobs: {
    dashboard: '40000000-0000-4000-8000-000000000001',
    mobileApp: '40000000-0000-4000-8000-000000000002',
    apiHardening: '40000000-0000-4000-8000-000000000003',
    brandGuidelines: '40000000-0000-4000-8000-000000000004',
  },
  proposals: {
    acceptedDashboard: '50000000-0000-4000-8000-000000000001',
    shortlistedDashboard: '50000000-0000-4000-8000-000000000002',
    submittedDashboard: '50000000-0000-4000-8000-000000000003',
    acceptedApiHardening: '50000000-0000-4000-8000-000000000004',
    rejectedMobileApp: '50000000-0000-4000-8000-000000000005',
  },
  contracts: {
    dashboard: '60000000-0000-4000-8000-000000000001',
    apiHardening: '60000000-0000-4000-8000-000000000002',
  },
  milestones: {
    first: '70000000-0000-4000-8000-000000000001',
    second: '70000000-0000-4000-8000-000000000002',
    third: '70000000-0000-4000-8000-000000000003',
    fourth: '70000000-0000-4000-8000-000000000004',
  },
  deliveries: {
    firstRevision: '80000000-0000-4000-8000-000000000001',
    secondRevision: '80000000-0000-4000-8000-000000000002',
  },
  reviews: {
    clientToFreelancer: '90000000-0000-4000-8000-000000000001',
    freelancerToClient: '90000000-0000-4000-8000-000000000002',
  },
} as const;

/**
 * Every table, for truncation.
 *
 * PostgreSQL does not check foreign keys between the tables of a single
 * `TRUNCATE`, so the order here is irrelevant to the result — the statement
 * succeeds because all nineteen tables are named together, not because children
 * come before parents. Listing them explicitly instead of using `CASCADE` keeps
 * a table added to the schema later from silently surviving the reset: a new
 * table fails this statement until it is added, which is the failure worth
 * having. The order below roughly follows the dependency graph anyway, which is
 * what makes it readable.
 */
export const TRUNCATE_ORDER = [
  'audit_log',
  'reviews',
  'milestone_deliveries',
  'milestones',
  'contracts',
  'proposals',
  'job_skills',
  'jobs',
  'portfolio_items',
  'profile_languages',
  'profile_skills',
  'freelancer_profiles',
  'client_profiles',
  'skills',
  'categories',
  'auth_verifications',
  'auth_sessions',
  'auth_accounts',
  'users',
] as const;

/** UUIDs for rows a test wants without pinning a fixed id in the seed. */
export function newSeedId(): string {
  return randomUUID();
}

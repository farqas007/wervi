/**
 * Drizzle table definitions.
 *
 * One module per domain area, one table per file, all re-exported here.
 * `drizzle.config.ts` and the client in `src/client.ts` both read this file, so
 * it must stay the single entry point for schema discovery.
 *
 * Rules of the house:
 *  - Column builders come from `schema/common`, never hand-written per table, so
 *    ids, timestamps and money columns are identical everywhere.
 *  - Restricting a column to a shared vocabulary goes through `oneOf()` and
 *    friends in `schema/common/constraints.ts`, which turn a constant list from
 *    `@wervi/shared` into a CHECK constraint.
 *  - This barrel exports tables only. Helpers are imported from
 *    `schema/common/index.js` directly so schema discovery never sees them.
 */

export { auditLog } from './audit/auditLog.js';

export {
  authAccounts,
  authSessions,
  authVerifications,
  users,
} from './auth/index.js';

export { categories, skills } from './taxonomy/index.js';

export {
  clientProfiles,
  freelancerProfiles,
  portfolioItems,
  profileLanguages,
  profileSkills,
} from './profiles/index.js';

export { jobSkills, jobs } from './jobs/index.js';

export { proposals } from './proposals/index.js';

export { contracts } from './contracts/index.js';

export { milestoneDeliveries, milestones } from './milestones/index.js';

export { reviews } from './reviews/index.js';

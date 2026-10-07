/**
 * Seed data for local development and the CI integration database.
 *
 * Split by concern so each file states what it owns: `core.ts` identity and
 * taxonomy, `profiles.ts` the two kinds of profile, `marketplace.ts` jobs
 * through to reviews. `run.ts` is the only file that knows the order.
 */

export { TRUNCATE_ORDER, SEED_TIMESTAMP, seedIds } from './ids.js';
export { seedAuthAndTaxonomy } from './core.js';
export { seedProfiles } from './profiles.js';
export { seedMarketplace } from './marketplace.js';
export { runSeed, type SeedSummary } from './run.js';

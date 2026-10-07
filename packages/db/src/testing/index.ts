/**
 * Test support for `@wervi/db`.
 *
 * Published as `@wervi/db/testing` rather than inlined into each suite, so the
 * rules about which database may be touched are stated once and no test can
 * quietly decide otherwise.
 */

export {
  closeDatabase,
  resetDatabase,
  resolveTestDatabaseUrl,
  setupDatabase,
  type TestDatabaseTarget,
} from './harness.js';

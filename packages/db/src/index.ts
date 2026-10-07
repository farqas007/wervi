/**
 * Public surface of `@wervi/db`.
 *
 * Table definitions are re-exported so `drizzle.config.ts`, the client and the
 * API can all reach the schema through one entry point. Importing this module
 * creates no connection: pools are built on first `getDatabase()` call.
 */

export {
  closeDatabase,
  createDatabase,
  getDatabase,
  loadDatabaseOptions,
} from './client.js';
export type { Database, DatabaseOptions } from './client.js';

export { migrationsFolder } from './paths.js';

export * from './schema/index.js';

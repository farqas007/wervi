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

/**
 * Drizzle operators re-exported so consumers share the exact Drizzle instance
 * this package `Database` was built from. Importing `eq`/`and`/… from a
 * different `drizzle-orm` copy than the database type is a type error, so the
 * single place that owns the pool owns the operator types too.
 */
export { and, asc, count, desc, eq, inArray, or, sql } from 'drizzle-orm';
export type { SQL } from 'drizzle-orm';

export * from './schema/index.js';

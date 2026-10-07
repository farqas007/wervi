import { sql } from 'drizzle-orm';
import { getTableName } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import {
  createDatabase,
  loadDatabaseOptions,
  type Database,
} from '../client.js';
import { migrationsFolder } from '../paths.js';
import { resolveTestDatabaseUrl, type TestDatabaseTarget } from '../safety.js';
import * as schema from '../schema/index.js';

/**
 * Integration test harness.
 *
 * This is the only place in the repository that writes to a database, so it is
 * deliberate about which one:
 *
 *  - `DATABASE_TEST_URL` wins if it is set.
 *  - Otherwise `DATABASE_URL` is accepted only when its database name contains
 *    "test". A developer's development URL must never be truncated by a test run.
 *  - With neither, the suites skip rather than fail: `pnpm test` stays useful on
 *    a machine with no PostgreSQL, and CI is where these tests actually run.
 *
 * The rule itself lives in `../safety.js`, shared with the seed entrypoint.
 *
 * A dedicated test database is required rather than preferred: the generated
 * foreign keys reference `"public"."users"` explicitly, so a schema other than
 * `public` in `search_path` cannot resolve them.
 *
 * Nothing here imports Vitest. Suites skip themselves, so the harness stays
 * usable from any runner.
 */

/** Why the suite is skipping, or which database to use. */
export type { TestDatabaseTarget };

/**
 * Resolves the test database for the suites.
 *
 * Re-exported from `../safety.js` rather than reimplemented, so a test run and a
 * seed run can never disagree about which database is safe to destroy.
 */
export { resolveTestDatabaseUrl };

/**
 * Connects to a test database and applies the migrations.
 *
 * Migrations run once per suite rather than per test: they are the slow part,
 * and `truncate` between tests is both faster and closer to how a running
 * system behaves than dropping and recreating tables.
 */
export async function setupDatabase(url: string): Promise<Database> {
  const database = createDatabase(
    {
      ...loadDatabaseOptions(url),
      // The CI PostgreSQL service has no TLS. Opt in explicitly for a hosted
      // test branch with `DATABASE_SSL=require`.
      ssl: process.env['DATABASE_SSL'] === 'require',
      maxConnections: 5,
    },
    { applicationName: 'wervi-db-test' },
  );

  await migrate(database.db, { migrationsFolder });
  return database;
}

/**
 * Closes a pool. Accepts `undefined` so an `afterAll` can run even when
 * `beforeAll` failed part-way — otherwise the setup error is buried under a
 * second failure about a pool that was never created.
 */
export async function closeDatabase(
  database: Database | undefined,
): Promise<void> {
  await database?.close();
}

/**
 * Empties every table the schema owns.
 *
 * One statement with `cascade`, and the table list derived from the schema
 * itself rather than written out here: a new table is then emptied by default,
 * and no test can pass because it happened to inherit rows from another.
 */
export async function resetDatabase(database: Database): Promise<void> {
  const list = Object.values(schema)
    .map((table) => getTableName(table))
    .map((name) => `"${name}"`)
    .join(', ');

  if (list === '') {
    return;
  }

  await database.db.execute(
    sql.raw(`truncate table ${list} restart identity cascade`),
  );
}

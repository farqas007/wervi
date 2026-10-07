import { createDatabase, loadDatabaseOptions } from './client.js';
import { requireSeedDatabaseUrl } from './safety.js';
import { runSeed } from './seed/index.js';

/**
 * Seed entrypoint: `pnpm --filter @wervi/db seed`.
 *
 * Seed data is for local development and CI only. It is never a migration and
 * never runs automatically, so nothing here is safe to point at production —
 * `TRUNCATE` is the first statement and it is not filtered.
 *
 * That is why the target is resolved before anything else happens:
 * `requireSeedDatabaseUrl` throws unless `DATABASE_TEST_URL` is set *and* names
 * a database whose name contains "test". `DATABASE_URL` is deliberately not
 * consulted. `loadDatabaseOptions()` would default to it, which is precisely the
 * accident this guard exists to prevent — a developer running the seed with only
 * a development URL configured would otherwise truncate their dev database. No
 * connection is opened until the target has been proven safe.
 */
async function main(): Promise<void> {
  const url = requireSeedDatabaseUrl();

  const database = createDatabase(
    {
      ...loadDatabaseOptions(url),
      // Same reasoning as the test harness: the CI PostgreSQL service has no
      // TLS. Opt in explicitly for a hosted test branch with `DATABASE_SSL=require`.
      ssl: process.env['DATABASE_SSL'] === 'require',
      maxConnections: 1,
    },
    { applicationName: 'wervi-db-seed' },
  );

  try {
    const summary = await runSeed(database);

    // Counts rather than ids: enough to tell a working seed from an empty one
    // without printing anything that identifies a person.
    console.log('[db] seed complete');
    console.log(
      `[db] users=${summary.users} jobs=${summary.jobs} proposals=${summary.proposals}`,
    );
    console.log(
      `[db] contracts=${summary.contracts} milestones=${summary.milestones} reviews=${summary.reviews}`,
    );
  } finally {
    await database.close();
  }
}

await main();

/**
 * Which database a destructive command is allowed to touch.
 *
 * Both destructive entry points in this package — the integration test harness
 * and `pnpm db:seed` — start with a bare `truncate`. Neither is safe to point at
 * a database that holds real data, so the rule lives here once and both call it
 * rather than each re-deriving it.
 *
 * The deliberate difference: the harness may *fall back* to `DATABASE_URL` when
 * that URL is already a test database, because a machine set up for local
 * testing often only sets `DATABASE_URL`. The seed has no such luxury. It is
 * run by hand, the operator may not have read this file, and falling back to
 * whatever `DATABASE_URL` happens to point at is exactly how a development
 * database gets truncated. So the seed demands an explicit `DATABASE_TEST_URL`
 * and refuses to infer.
 */

/**
 * Substring a database name must contain to be considered safe to destroy.
 *
 * Deliberately a marker rather than an allowlist of names: teams provision their
 * own (`wervi_test`, `wervi_ci_test`, `postgres_test`), but nobody names a real
 * database with "test" inside it. A hosted development database is named after
 * the project instead — `neondb` here — which is why this check earns its keep.
 */
export const SAFE_DATABASE_NAME_MARKER = 'test';

/** The parsed name of a PostgreSQL URL, or an empty string if it has none. */
export function databaseName(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}

/** Whether a URL points at a database safe to truncate. */
export function isSafeTestDatabaseUrl(url: string): boolean {
  return databaseName(url).toLowerCase().includes(SAFE_DATABASE_NAME_MARKER);
}

/** Whether an environment variable is present and not blank. */
function isSet(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== '';
}

/** Why the suite is skipping, or which database to use. */
export interface TestDatabaseTarget {
  url: string | undefined;
  reason: string;
}

/**
 * Resolves the test database for the integration harness, tolerating a missing
 * `DATABASE_TEST_URL`.
 *
 * Returns `undefined` rather than throwing when there is nothing usable, because
 * the harness reports that as a skipped suite. Never returns a URL unless it has
 * confirmed the database name is safe.
 */
export function resolveTestDatabaseUrl(): TestDatabaseTarget {
  const explicit = process.env['DATABASE_TEST_URL'];
  if (isSet(explicit)) {
    return { url: explicit, reason: 'using DATABASE_TEST_URL' };
  }

  const fallback = process.env['DATABASE_URL'];
  if (!isSet(fallback)) {
    return {
      url: undefined,
      reason: 'DATABASE_TEST_URL and DATABASE_URL are both unset',
    };
  }

  const name = databaseName(fallback);
  if (!name.toLowerCase().includes(SAFE_DATABASE_NAME_MARKER)) {
    return {
      url: undefined,
      reason: `DATABASE_URL points at "${name}", which is not a test database; set DATABASE_TEST_URL instead`,
    };
  }

  return { url: fallback, reason: `using DATABASE_URL (${name})` };
}

/**
 * Resolves the database `pnpm db:seed` is allowed to destroy, or throws.
 *
 * Throwing rather than returning is the point. The seed has no skip path: if it
 * cannot prove it is pointed at a test database, the only correct outcome is to
 * stop before opening a connection.
 *
 * @param env Read from `process.env` by default; injectable for tests.
 */
export function requireSeedDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = env['DATABASE_TEST_URL'];
  if (!isSet(explicit)) {
    throw new Error(
      [
        'db:seed requires DATABASE_TEST_URL to point at a dedicated test database.',
        '',
        'It will not fall back to DATABASE_URL: the seed truncates every table as',
        'its first statement, and DATABASE_URL is usually your development',
        'database rather than a disposable one.',
        '',
        'Set DATABASE_TEST_URL in .env to a database dedicated to seeding, for example:',
        '',
        '  DATABASE_TEST_URL=postgresql://postgres:postgres@localhost:5432/wervi_test',
        '',
        `Currently DATABASE_URL points at "${describeUrl(env['DATABASE_URL'])}".`,
      ].join('\n'),
    );
  }

  const name = databaseName(explicit);
  if (!name.toLowerCase().includes(SAFE_DATABASE_NAME_MARKER)) {
    throw new Error(
      [
        `db:seed refuses to run: DATABASE_TEST_URL points at "${name}", which does not`,
        `contain "${SAFE_DATABASE_NAME_MARKER}".`,
        '',
        'The seed truncates every table it owns as its first statement, so it only',
        'runs against a dedicated test database. Create one and point',
        'DATABASE_TEST_URL at it, for example:',
        '',
        '  createdb wervi_test',
        '  DATABASE_TEST_URL=postgresql://postgres:postgres@localhost:5432/wervi_test',
      ].join('\n'),
    );
  }

  return explicit;
}

/** Database name for a URL, for error messages. Never echoes credentials. */
function describeUrl(url: string | undefined): string {
  if (!isSet(url)) {
    return 'nothing (unset)';
  }
  const name = databaseName(url);
  if (name === '') {
    return 'a URL with no database name';
  }
  return name;
}

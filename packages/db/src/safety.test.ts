import { describe, expect, it } from 'vitest';

import {
  databaseName,
  isSafeTestDatabaseUrl,
  requireSeedDatabaseUrl,
  resolveTestDatabaseUrl,
} from './safety.js';

/**
 * Pure unit tests: no connection is opened, and no value here comes from the
 * developer's real `.env`. These are the tests that protect a destructive
 * command, so they must be runnable on a machine with no PostgreSQL at all.
 *
 * Every case is driven through an injected `env`, which is also why
 * `requireSeedDatabaseUrl` takes one.
 */

const TEST_URL = 'postgresql://postgres:postgres@localhost:5432/wervi_test';

/** The committed development URL's database name, without the real credentials. */
const NEON_DEV_DB = 'neondb';

describe('databaseName', () => {
  it('extracts the database name from a URL', () => {
    expect(databaseName(TEST_URL)).toBe('wervi_test');
  });

  it('is case and trailing-slash tolerant', () => {
    expect(databaseName('postgresql://u:p@host:5432/Wervi_Test/')).toBe(
      'Wervi_Test/',
    );
  });

  it('returns an empty string for an unparseable URL rather than throwing', () => {
    expect(databaseName('not a url')).toBe('');
  });
});

describe('isSafeTestDatabaseUrl', () => {
  it('accepts names containing the marker in any case', () => {
    expect(isSafeTestDatabaseUrl(TEST_URL)).toBe(true);
    expect(isSafeTestDatabaseUrl('postgresql://u:p@host:5432/WERVI_TEST')).toBe(
      true,
    );
  });

  it('rejects the Neon development database name', () => {
    expect(
      isSafeTestDatabaseUrl(
        `postgresql://u:p@ep-x.us-east-2.aws.neon.tech/${NEON_DEV_DB}`,
      ),
    ).toBe(false);
  });

  it('rejects a production-looking name', () => {
    expect(
      isSafeTestDatabaseUrl(
        'postgresql://u:p@db.internal:5432/wervi_production',
      ),
    ).toBe(false);
  });
});

describe('requireSeedDatabaseUrl', () => {
  it('returns DATABASE_TEST_URL when its name is safe', () => {
    expect(requireSeedDatabaseUrl({ DATABASE_TEST_URL: TEST_URL })).toBe(
      TEST_URL,
    );
  });

  it('refuses to run when DATABASE_TEST_URL is unset, even with DATABASE_URL set', () => {
    expect(() =>
      requireSeedDatabaseUrl({
        DATABASE_URL: `postgresql://u:p@host:5432/${NEON_DEV_DB}`,
      }),
    ).toThrow(/requires DATABASE_TEST_URL/);
  });

  it('never leaks credentials into the error message', () => {
    let message = '';
    try {
      requireSeedDatabaseUrl({
        DATABASE_URL: 'postgresql://super:secret@ep-x.neon.tech/neondb',
      });
    } catch (error: unknown) {
      message = errorText(error);
    }

    expect(message).toContain(NEON_DEV_DB);
    expect(message).not.toContain('secret');
    expect(message).not.toContain('super');
  });

  it('treats an empty DATABASE_TEST_URL as unset', () => {
    expect(() => requireSeedDatabaseUrl({ DATABASE_TEST_URL: '   ' })).toThrow(
      /requires DATABASE_TEST_URL/,
    );
  });

  it('refuses the Neon development database name even when set as the test URL', () => {
    // `/\s+/` because the message is hard-wrapped for terminal width.
    expect(() =>
      requireSeedDatabaseUrl({
        DATABASE_TEST_URL: `postgresql://u:p@ep-x.neon.tech/${NEON_DEV_DB}`,
        DATABASE_URL: TEST_URL,
      }),
    ).toThrow(/does not\s+contain "test"/);
  });

  it('explains how to fix it when the name is unsafe', () => {
    expect(() =>
      requireSeedDatabaseUrl({
        DATABASE_TEST_URL: `postgresql://u:p@host/wervi_${NEON_DEV_DB}`,
      }),
    ).toThrow(
      /DATABASE_TEST_URL=postgresql:\/\/postgres:postgres@localhost:5432\/wervi_test/,
    );
  });

  it('ignores DATABASE_URL entirely when a safe DATABASE_TEST_URL is present', () => {
    expect(
      requireSeedDatabaseUrl({
        DATABASE_TEST_URL: TEST_URL,
        DATABASE_URL: `postgresql://u:p@host/${NEON_DEV_DB}`,
      }),
    ).toBe(TEST_URL);
  });
});

describe('resolveTestDatabaseUrl', () => {
  const previous = {
    test: process.env['DATABASE_TEST_URL'],
    main: process.env['DATABASE_URL'],
  };

  function withEnv(env: NodeJS.ProcessEnv): void {
    if (env['DATABASE_TEST_URL'] === undefined) {
      delete process.env['DATABASE_TEST_URL'];
    } else {
      process.env['DATABASE_TEST_URL'] = env['DATABASE_TEST_URL'];
    }
    if (env['DATABASE_URL'] === undefined) {
      delete process.env['DATABASE_URL'];
    } else {
      process.env['DATABASE_URL'] = env['DATABASE_URL'];
    }
  }

  function restore(): void {
    withEnv({
      ...(previous.test === undefined
        ? {}
        : { DATABASE_TEST_URL: previous.test }),
      ...(previous.main === undefined ? {} : { DATABASE_URL: previous.main }),
    });
  }

  it('prefers DATABASE_TEST_URL', () => {
    withEnv({
      DATABASE_TEST_URL: TEST_URL,
      DATABASE_URL: `postgresql://u:p@host/${NEON_DEV_DB}`,
    });
    try {
      expect(resolveTestDatabaseUrl().url).toBe(TEST_URL);
    } finally {
      restore();
    }
  });

  it('falls back to DATABASE_URL when it is already a test database', () => {
    withEnv({ DATABASE_URL: TEST_URL });
    try {
      expect(resolveTestDatabaseUrl().url).toBe(TEST_URL);
    } finally {
      restore();
    }
  });

  it('skips rather than truncating a development database', () => {
    withEnv({ DATABASE_URL: `postgresql://u:p@host/${NEON_DEV_DB}` });
    try {
      const target = resolveTestDatabaseUrl();
      expect(target.url).toBeUndefined();
      expect(target.reason).toContain(NEON_DEV_DB);
    } finally {
      restore();
    }
  });

  it('skips when neither variable is set', () => {
    withEnv({});
    try {
      expect(resolveTestDatabaseUrl().url).toBeUndefined();
    } finally {
      restore();
    }
  });
});

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

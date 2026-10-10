import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// env.ts reads the root `.env` via dotenv (without overriding existing
// process.env), so stubbing these keeps the suite deterministic no matter what
// an engineer has in their local `.env`.
const BASE_ENV = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://localhost:5432/wervi_test',
  DATABASE_SSL: 'disable',
} satisfies Record<string, string>;

describe('environment configuration', () => {
  beforeEach(() => {
    for (const [name, value] of Object.entries(BASE_ENV)) {
      vi.stubEnv(name, value);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    // getEnv() caches the parsed environment per module instance.
    vi.resetModules();
  });

  async function resolveEnv(): Promise<{
    port: number;
    host: string;
    cookieSameSite: 'lax' | 'none';
  }> {
    const { getEnv } = await import('../src/config/env.js');
    const env = getEnv();
    return {
      port: env.API_PORT,
      host: env.API_HOST,
      cookieSameSite: env.BETTER_AUTH_COOKIE_SAME_SITE,
    };
  }

  it('prefers the platform-injected PORT over API_PORT', async () => {
    vi.stubEnv('PORT', '8080');
    vi.stubEnv('API_PORT', '4000');

    await expect(resolveEnv()).resolves.toMatchObject({ port: 8080 });
  });

  it('falls back to API_PORT when PORT is not provided', async () => {
    vi.stubEnv('PORT', undefined);
    vi.stubEnv('API_PORT', '4100');

    await expect(resolveEnv()).resolves.toMatchObject({ port: 4100 });
  });

  it('defaults to 4000 when neither PORT nor API_PORT is provided', async () => {
    vi.stubEnv('PORT', undefined);
    vi.stubEnv('API_PORT', undefined);

    await expect(resolveEnv()).resolves.toMatchObject({ port: 4000 });
  });

  it('binds every interface by default', async () => {
    await expect(resolveEnv()).resolves.toMatchObject({ host: '0.0.0.0' });
  });

  it('defaults session cookies to SameSite=Lax', async () => {
    await expect(resolveEnv()).resolves.toMatchObject({
      cookieSameSite: 'lax',
    });
  });

  it('allows cross-site session cookies via `none`', async () => {
    vi.stubEnv('BETTER_AUTH_COOKIE_SAME_SITE', 'none');
    await expect(resolveEnv()).resolves.toMatchObject({
      cookieSameSite: 'none',
    });
  });
});

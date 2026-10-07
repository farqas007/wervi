import { defineConfig } from 'drizzle-kit';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// drizzle-kit loads this config through a CommonJS require hook that only
// polyfills `import.meta.url`; `import.meta.dirname` stays undefined there.
const configDir = fileURLToPath(new URL('.', import.meta.url));

loadEnv({ path: resolve(configDir, '../../.env'), quiet: true });
loadEnv({
  path: resolve(configDir, '.env'),
  override: true,
  quiet: true,
});

const databaseUrl = process.env['DATABASE_URL'];
const ssl = process.env['DATABASE_SSL'] === 'disable' ? false : 'require';

if (databaseUrl === undefined) {
  console.warn(
    '[drizzle] DATABASE_URL is not set. Using a localhost fallback; run `cp .env.example .env` first.',
  );
}

export default defineConfig({
  schema: resolve(configDir, 'src/schema/index.ts'),
  // Relative on purpose: `drizzle-kit generate --custom` in 0.31.11 joins this
  // value with a prefix, so an absolute path makes it fail with a mangled
  // `.//abs/path` and no custom migration. Config discovery already requires
  // running from this directory, so a relative `out` resolves identically.
  out: './drizzle',
  dialect: 'postgresql',
  // Must match the runtime client. Without it, a column defined as
  // `hourlyRateMinor` is generated as "hourlyRateMinor" while queries built by
  // the client send "hourly_rate_minor", and the drift check in CI sees a
  // database that does not match a migration.
  casing: 'snake_case',
  dbCredentials: {
    url: databaseUrl ?? 'postgresql://localhost:5432/wervi',
    ssl,
  },
  strict: true,
  verbose: true,
});

import { defineConfig } from 'drizzle-kit';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(import.meta.dirname, '../../.env'), quiet: true });
loadEnv({
  path: resolve(import.meta.dirname, '.env'),
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
  schema: resolve(import.meta.dirname, 'src/schema/index.ts'),
  out: resolve(import.meta.dirname, 'drizzle'),
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl ?? 'postgresql://localhost:5432/wervi',
    ssl,
  },
  strict: true,
  verbose: true,
});

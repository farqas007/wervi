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
  out: resolve(configDir, 'drizzle'),
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl ?? 'postgresql://localhost:5432/wervi',
    ssl,
  },
  strict: true,
  verbose: true,
});

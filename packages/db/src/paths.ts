import { fileURLToPath } from 'node:url';

/**
 * Absolute path to the committed migrations.
 *
 * Resolved relative to this module so it is correct from `src/` under tsx and
 * vitest as well as from the compiled `dist/`: both sit one directory below the
 * package root, which is where `drizzle/` lives.
 */
export const migrationsFolder = fileURLToPath(
  new URL('../drizzle', import.meta.url),
);

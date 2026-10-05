import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { loadDatabaseOptions, createDatabase } from './client.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

async function main(): Promise<void> {
  const database = createDatabase(loadDatabaseOptions());

  try {
    await migrate(database.db, { migrationsFolder });
    console.log('[db] migrations applied');
  } finally {
    await database.close();
  }
}

await main();

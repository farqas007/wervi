import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase, loadDatabaseOptions } from './client.js';
import { migrationsFolder } from './paths.js';

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

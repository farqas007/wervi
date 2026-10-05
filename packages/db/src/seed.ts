import { createDatabase, loadDatabaseOptions } from './client.js';

async function main(): Promise<void> {
  const database = createDatabase(loadDatabaseOptions());

  try {
    await database.sql`select 1`;
    console.log('[db] connection ok');
    console.log('[db] no seed data defined yet — arrives with Phase 2 (users)');
  } finally {
    await database.close();
  }
}

await main();

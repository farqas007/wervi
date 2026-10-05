import { config as loadEnv } from 'dotenv';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema/index.js';

loadEnv({ path: new URL('../../../.env', import.meta.url), quiet: true });

export interface DatabaseOptions {
  url: string;
  ssl?: boolean;
  maxConnections?: number;
  statementTimeoutMs?: number;
  applicationName?: string;
}

export interface Database {
  db: PostgresJsDatabase<typeof schema>;
  sql: Sql;
  close: () => Promise<void>;
}

export function createDatabase(options: DatabaseOptions): Database {
  const sql = postgres(options.url, {
    max: options.maxConnections ?? 10,
    ssl: options.ssl === false ? false : 'require',
    idle_timeout: 20,
    connect_timeout: 15,
    connection: {
      application_name: options.applicationName ?? 'wervi',
      statement_timeout: options.statementTimeoutMs ?? 15_000,
    },
  });

  return {
    db: drizzle(sql, { schema, casing: 'snake_case' }),
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}

let instance: Database | undefined;

/** Process-wide connection pool. Created on first use, reused thereafter. */
export function getDatabase(): Database {
  instance ??= createDatabase(loadDatabaseOptions());
  return instance;
}

export async function closeDatabase(): Promise<void> {
  if (instance === undefined) {
    return;
  }
  await instance.close();
  instance = undefined;
}

export function loadDatabaseOptions(): DatabaseOptions {
  const url = process.env['DATABASE_URL'];
  if (url === undefined) {
    throw new Error('DATABASE_URL is not set');
  }
  return {
    url,
    ssl: process.env['DATABASE_SSL'] !== 'disable',
    maxConnections: toPositiveInt(process.env['DATABASE_POOL_MAX']) ?? 10,
    statementTimeoutMs:
      toPositiveInt(process.env['DATABASE_STATEMENT_TIMEOUT_MS']) ?? 15_000,
    applicationName: process.env['SERVICE_NAME'] ?? 'wervi-api',
  };
}

function toPositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

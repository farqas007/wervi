import { type Database, createDatabase, loadDatabaseOptions } from '@wervi/db';
import fp from 'fastify-plugin';
import type { FastifyPluginCallback } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

export interface DbPluginOptions {
  /**
   * Fail fast if the database is unreachable at boot. Enabled everywhere except
   * tests, which construct the app without a live database.
   */
  verifyOnBoot: boolean;
}

/**
 * Owns the single Postgres pool for the process and closes it on shutdown.
 * The pool itself is lazy, so nothing connects until the first query.
 */
export const dbPlugin: FastifyPluginCallback<DbPluginOptions> =
  fp<DbPluginOptions>(async (fastify, options) => {
    const database = createDatabase(loadDatabaseOptions());

    if (options.verifyOnBoot) {
      try {
        await database.sql`select 1`;
      } catch (error) {
        await database.close();
        fastify.log.error({ err: error }, 'database connection failed');
        throw new Error(
          'Could not connect to PostgreSQL — check DATABASE_URL',
          { cause: error },
        );
      }
    }

    fastify.decorate('db', database);
    fastify.addHook('onClose', async () => {
      await database.close();
    });
  });

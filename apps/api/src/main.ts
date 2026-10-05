import { buildApp } from './app.js';
import { getEnv } from './config/env.js';

async function main(): Promise<void> {
  const env = getEnv();
  const fastify = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    fastify.log.info({ signal }, 'shutting down');
    try {
      await fastify.close();
      process.exit(0);
    } catch (error) {
      fastify.log.error({ err: error }, 'graceful shutdown failed');
      process.exit(1);
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  try {
    await fastify.listen({ host: env.API_HOST, port: env.API_PORT });
  } catch (error) {
    fastify.log.error({ err: error }, 'failed to start');
    process.exit(1);
  }
}

await main();

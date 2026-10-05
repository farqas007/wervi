import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';
import { healthRoutes } from './health.js';

export const routes: FastifyPluginCallback = fp(async (fastify) => {
  await fastify.register(healthRoutes);

  // Stable, documented location for the machine-readable contract. The Swagger
  // UI reads the same document from /docs/json. Disabled in production, where
  // the schema is not meant to be public.
  if (fastify.env.API_EXPOSE_DOCS) {
    fastify.get('/openapi.json', async (_request, reply) => {
      return reply.type('application/json').send(fastify.swagger());
    });
  }
});

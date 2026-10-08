import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';
import { authRoutes } from './auth.js';
import { healthRoutes } from './health.js';
import { jobRoutes } from './jobs.js';
import { profileRoutes } from './profiles.js';
import { roleRoutes } from './roles.js';
import { taxonomyRoutes } from './taxonomy.js';

export const routes: FastifyPluginCallback = fp(async (fastify) => {
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);
  await fastify.register(roleRoutes);
  await fastify.register(profileRoutes);
  await fastify.register(taxonomyRoutes);
  await fastify.register(jobRoutes);

  // Stable, documented location for the machine-readable contract. The Swagger
  // UI reads the same document from /docs/json. Disabled in production, where
  // the schema is not meant to be public.
  if (fastify.env.API_EXPOSE_DOCS) {
    fastify.get('/openapi.json', async (_request, reply) => {
      return reply.type('application/json').send(fastify.swagger());
    });
  }
});

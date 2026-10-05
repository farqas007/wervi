import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

const OPENAPI_TAGS = [
  { name: 'system', description: 'Liveness, readiness and diagnostics' },
  { name: 'auth', description: 'Registration, sessions and account recovery' },
  { name: 'users', description: 'Accounts and roles' },
  { name: 'profiles', description: 'Freelancer profiles and portfolios' },
  { name: 'jobs', description: 'Job postings, search and categories' },
  { name: 'proposals', description: 'Freelancer proposals on open jobs' },
  { name: 'contracts', description: 'Hiring and project lifecycle' },
  { name: 'milestones', description: 'Milestone funding and delivery' },
  { name: 'messaging', description: 'Project-scoped conversations' },
  {
    name: 'payments',
    description: 'Escrow, payouts and platform commission',
  },
  { name: 'reviews', description: 'Two-way reviews and reputation' },
  { name: 'disputes', description: 'Dispute filing and resolution' },
  { name: 'notifications', description: 'In-app and email notifications' },
] as const;

/**
 * Publishes the OpenAPI document and, outside production, a Swagger UI.
 *
 * The Zod contracts in @wervi/shared are the single source of truth: the same
 * schemas compile into request validators, response serializers and this
 * document, so the published docs cannot drift from the implementation.
 * Schemas shared by several routes are referenced from a route as
 * `{ $ref: 'Name#' }` and registered automatically by the transform.
 *
 * Wrapped in fastify-plugin so `fastify.swagger()` is decorated on the root
 * instance and the document can be served from /openapi.json.
 */
export const openapiPlugin: FastifyPluginCallback = fp(async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'WERVI API',
        version: fastify.appVersion,
        description:
          'REST API for the WERVI global freelancer marketplace. Monetary ' +
          'amounts are integer minor units paired with an ISO 4217 currency code.',
        license: { name: 'MIT' },
      },
      servers: [{ url: fastify.env.API_BASE_URL }],
      tags: [...OPENAPI_TAGS],
    },
    transform: jsonSchemaTransform,
  });

  if (fastify.env.API_EXPOSE_DOCS) {
    await fastify.register(swaggerUi, { routePrefix: '/docs' });
  }
});

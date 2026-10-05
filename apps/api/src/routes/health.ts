import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

export const healthResponseSchema = z
  .object({
    status: z.literal('ok'),
    service: z.string(),
    version: z.string(),
    environment: z.string(),
    uptimeSeconds: z.number().nonnegative(),
    timestamp: z.iso.datetime(),
  })
  .strict();

export const readinessResponseSchema = z
  .object({
    status: z.enum(['ready', 'degraded']),
    checks: z.record(z.string(), z.union([z.literal('up'), z.literal('down')])),
  })
  .strict();

/**
 * Liveness (`/health`) must never touch a dependency: if it did, a brief
 * database blip would make the orchestrator kill otherwise healthy processes.
 *
 * Readiness (`/health/ready`) does check dependencies, because that is what
 * should remove the instance from the load balancer.
 */
export const healthRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const startedAt = Date.now();

  fastify.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Liveness probe',
        description: 'Process is running. Performs no dependency calls.',
        response: { 200: healthResponseSchema },
      },
    },
    () => ({
      status: 'ok' as const,
      service: fastify.env.SERVICE_NAME,
      version: fastify.appVersion,
      environment: fastify.env.NODE_ENV,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    }),
  );

  fastify.get(
    '/health/ready',
    {
      schema: {
        tags: ['system'],
        summary: 'Readiness probe',
        description:
          'Verifies the API can reach its dependencies. Returns 503 when degraded.',
        response: {
          200: readinessResponseSchema,
          503: readinessResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const checks: Record<string, 'up' | 'down'> = {};

      try {
        await fastify.db.sql`select 1`;
        checks['database'] = 'up';
      } catch (error) {
        fastify.log.error({ err: error }, 'readiness check failed: database');
        checks['database'] = 'down';
      }

      const ready = Object.values(checks).every((state) => state === 'up');

      return reply.status(ready ? 200 : 503).send({
        status: ready ? ('ready' as const) : ('degraded' as const),
        checks,
      });
    },
  );
};

import {
  authUserSchema,
  errorResponseSchema,
  roleSchema,
  type Role,
} from '@wervi/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { assertRole } from '../auth/authorization.js';

export const roleRouteResponseSchema = z
  .object({
    ok: z.literal(true),
    authorizedRole: roleSchema,
    user: authUserSchema,
  })
  .strict();

/**
 * Placeholder role-gated routes that prove the authorization matrix end to end:
 * exact-role gates (`client`, `freelancer`, `admin`) and an any-of gate
 * (`participant`). Real marketplace routes will reuse the same guards
 * (`fastify.requireRoles` / `fastify.requireAdmin`) instead of these handlers.
 *
 * Roles are additive and checked exactly: `admin` must be listed explicitly to
 * unlock a role-scoped route, which is why `admin` is its own demo route here.
 */
export const roleRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const demonstrate = (path: string, roles: readonly Role[]) => {
    fastify.get(
      path,
      {
        schema: {
          tags: ['auth'],
          summary: 'Role-gated example route',
          description:
            `Succeeds only for an active account holding ${
              roles.length === 1
                ? `the \`${roles[0]}\` role`
                : `any of \`${roles.join('`, `')}\``
            }. ` +
            'Demonstrates and tests the `requireRoles`/`requireAdmin` guards.',
          response: {
            200: roleRouteResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
          },
        },
        preHandler: fastify.requireRoles(roles),
      },
      async (request) => {
        return {
          ok: true as const,
          authorizedRole: assertRole(request.authData.user, roles),
          user: request.authData.user,
        };
      },
    );
  };

  demonstrate('/auth/roles/client', ['client']);
  demonstrate('/auth/roles/freelancer', ['freelancer']);
  demonstrate('/auth/roles/admin', ['admin']);
  demonstrate('/auth/roles/participant', ['client', 'freelancer']);
};

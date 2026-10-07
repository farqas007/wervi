import type { AuthSessionResponse } from '@wervi/shared';
import type { FastifyPluginCallback, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { toAuthProxyRequest } from '../auth/dispatch.js';
import { createAuthInstance, type AuthInstance } from '../auth/instance.js';
import { getRequiredSession } from '../auth/session.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** The shared Better Auth instance the `/auth/*` routes proxy through. */
    auth: AuthInstance;
    /**
     * PreHandler that resolves the current signed-in user onto `request.authData`
     * or rejects the request with the standard `unauthorized`/`forbidden`
     * envelopes. Register it on any protected route.
     */
    requireAuth: (request: FastifyRequest) => Promise<AuthSessionResponse>;
  }
  interface FastifyRequest {
    /** Set by `requireAuth`; only read inside protected routes. */
    authData: AuthSessionResponse;
  }
}

export interface AuthPluginOptions {
  /**
   * Absolute origin (no path) Better Auth should anchor to. Defaults to the
   * configured API base URL; use only for deployments where the API is reached
   * through a different public origin.
   */
  origin?: string;
}

/**
 * Boots the Better Auth instance and wires the `requireAuth` guard.
 *
 * Registered after the environment and database plugins, because the auth
 * instance needs both `fastify.env` (secret, origins) and `fastify.db`
 * (the adapter's database).
 */
export const authPlugin: FastifyPluginCallback<AuthPluginOptions> =
  fp<AuthPluginOptions>(async (fastify, options) => {
    const env = fastify.env;
    const origin = (
      options.origin ??
      env.BETTER_AUTH_URL ??
      env.API_BASE_URL
    ).replace(/\/+$/, '');

    const trustedOrigins = [
      ...new Set([
        env.API_BASE_URL,
        ...env.CORS_ORIGINS,
        ...env.BETTER_AUTH_TRUSTED_ORIGINS,
      ]),
    ];

    fastify.decorate(
      'auth',
      createAuthInstance(fastify.db, {
        origin,
        secret: env.BETTER_AUTH_SECRET,
        trustedOrigins,
      }),
    );

    fastify.decorate('requireAuth', async (request: FastifyRequest) => {
      const session = await getRequiredSession(
        fastify.auth,
        toAuthProxyRequest(request),
      );
      request.authData = session;
      return session;
    });
  });

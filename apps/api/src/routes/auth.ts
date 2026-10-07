import {
  authSessionResponseSchema,
  authUserResponseSchema,
  authUserSchema,
  errorResponseSchema,
  normalizeEmail,
} from '@wervi/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  copyAuthResponseHeaders,
  dispatchAuth,
  toAuthProxyRequest,
} from '../auth/dispatch.js';
import { raiseAuthError } from '../auth/errors.js';
import {
  authBodyUser,
  getRequiredSession,
  toAuthUser,
} from '../auth/session.js';

const SIGN_UP_PATH = '/api/auth/sign-up/email';
const SIGN_IN_PATH = '/api/auth/sign-in/email';
const SIGN_OUT_PATH = '/api/auth/sign-out';

/**
 * Password policy is enforced here (validate fast, before hashing work) and in
 * Better Auth (authoritative), so both agree: 8–128 characters.
 */
export const signupRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(320),
    password: z.string().min(8).max(128),
  })
  .strict();

export const loginRequestSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(128),
  })
  .strict();

export const logoutResponseSchema = z
  .object({ success: z.literal(true) })
  .strict();

export const protectedResponseSchema = z
  .object({
    ok: z.literal(true),
    user: authUserSchema,
  })
  .strict();

/** Every non-2xx WERVI response uses the shared error envelope. */
const errorResponses = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  409: errorResponseSchema,
  422: errorResponseSchema,
} as const;

/**
 * `/auth/*` routes are the WERVI contract for authentication. Each forwards a
 * rebuilt request to Better Auth, copies the signed cookies it returns, and
 * re-shapes the result so `token`s never cross the wire and every failure is
 * the shared error envelope.
 */
export const authRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/auth/signup',
    {
      schema: {
        tags: ['auth'],
        summary: 'Create an account',
        description:
          'Registers email and password credentials, signs the new user in, ' +
          'and sets the session cookie. New accounts start with the `client` role.',
        body: signupRequestSchema,
        response: { 200: authUserResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const body = {
        ...request.body,
        email: normalizeEmail(request.body.email),
      };
      const result = await dispatchAuth(
        fastify.auth,
        SIGN_UP_PATH,
        toAuthProxyRequest(request, body),
      );
      if (result.status >= 400) {
        raiseAuthError(result.status, result.body);
      }
      copyAuthResponseHeaders(result.headers, reply);
      return { user: toAuthUser(authBodyUser(result.body)) };
    },
  );

  fastify.post(
    '/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Sign in with email and password',
        description: 'Validates the credentials and sets the session cookie.',
        body: loginRequestSchema,
        response: { 200: authUserResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const body = {
        ...request.body,
        email: normalizeEmail(request.body.email),
      };
      const result = await dispatchAuth(
        fastify.auth,
        SIGN_IN_PATH,
        toAuthProxyRequest(request, body),
      );
      if (result.status >= 400) {
        raiseAuthError(result.status, result.body);
      }
      copyAuthResponseHeaders(result.headers, reply);
      return { user: toAuthUser(authBodyUser(result.body)) };
    },
  );

  fastify.post(
    '/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Sign out',
        description:
          'Revokes the current session and clears the session cookie. ' +
          'Idempotent: signing out without a session still succeeds.',
        response: { 200: logoutResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await dispatchAuth(
        fastify.auth,
        SIGN_OUT_PATH,
        toAuthProxyRequest(request),
      );
      if (result.status >= 400) {
        raiseAuthError(result.status, result.body);
      }
      copyAuthResponseHeaders(result.headers, reply);
      return { success: true as const };
    },
  );

  fastify.get(
    '/auth/session',
    {
      schema: {
        tags: ['auth'],
        summary: 'Current session',
        description:
          'Returns the signed-in session and user, or 401 when not signed in.',
        response: { 200: authSessionResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => {
      return getRequiredSession(fastify.auth, toAuthProxyRequest(request));
    },
  );

  fastify.get(
    '/auth/me',
    {
      schema: {
        tags: ['auth'],
        summary: 'Current user',
        description: 'Returns the signed-in user, or 401 when not signed in.',
        response: { 200: authUserResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => {
      const session = await getRequiredSession(
        fastify.auth,
        toAuthProxyRequest(request),
      );
      return { user: session.user };
    },
  );

  fastify.get(
    '/auth/protected',
    {
      schema: {
        tags: ['auth'],
        summary: 'Protected-route example',
        description:
          'Succeeds only with a valid, active session. Demonstrates and tests ' +
          'the `requireAuth` guard every protected WERVI route uses.',
        response: {
          200: protectedResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
      preHandler: fastify.requireAuth,
    },
    async (request) => {
      return { ok: true as const, user: request.authData.user };
    },
  );
};

import { z } from 'zod';
import { roleSchema } from '../constants/roles.js';
import { userStatusSchema } from '../constants/statuses.js';

/**
 * A signed-in user as WERVI exposes it on the wire.
 *
 * Deliberately smaller than the Better Auth user: `token`s, credential
 * metadata and anything OAuth-specific never leave the API. These shapes are
 * what every `/auth/*` route serializes, so they are the contract the web app
 * and any future client code against.
 */
export const authUserSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    email: z.string().email(),
    emailVerified: z.boolean(),
    roles: z.array(roleSchema),
    status: userStatusSchema.nullable(),
    image: z.string().url().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export type AuthUser = z.infer<typeof authUserSchema>;

/** A session, without the bearer `token` that is Cookie-only. */
export const authSessionSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    expiresAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export type AuthSession = z.infer<typeof authSessionSchema>;

/** `GET /auth/session` and the sign-up/sign-in result. */
export const authSessionResponseSchema = z
  .object({
    session: authSessionSchema,
    user: authUserSchema,
  })
  .strict();

export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

/** `GET /auth/me` and the sign-up/sign-in response body. */
export const authUserResponseSchema = z
  .object({ user: authUserSchema })
  .strict();

export type AuthUserResponse = z.infer<typeof authUserResponseSchema>;

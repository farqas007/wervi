import {
  authSessionSchema,
  authUserSchema,
  type AuthSession,
  type AuthSessionResponse,
  type AuthUser,
} from '@wervi/shared';
import { AppError, ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import { dispatchAuth, type AuthProxyRequest } from './dispatch.js';
import type { AuthInstance } from './instance.js';

const GET_SESSION_PATH = '/api/auth/get-session';

/**
 * The session endpoint reads the signed `session_token` cookie and answers
 * `200 { session, user }` or a `null` body. The token never leaves Better
 * Auth's cookie: it is not part of the WERVI session contract.
 *
 * Lookup is a stateless read keyed on the cookie, so the outer request's own
 * method and body are never forwarded: proxying a PATCH body to `get-session`
 * makes Better Auth reject the read, and leaking route payloads into the
 * session lookup would be wrong regardless. Only the cookie (and the headers
 * that define the request origin) survive.
 *
 * A soft-deleted account has no usable session: `deleted_at` is an additional
 * field on the Better Auth user, present in the raw `get-session` payload
 * before `toAuthUser` prunes it from the wire contract. Such a session is
 * treated exactly like an absent one rather than surfaced to a caller.
 */
export async function getSession(
  auth: AuthInstance,
  request: AuthProxyRequest,
): Promise<AuthSessionResponse | null> {
  const result = await dispatchAuth(auth, GET_SESSION_PATH, {
    ...request,
    method: 'GET',
    body: undefined,
  });
  if (result.status !== 200 || result.body === null) {
    return null;
  }
  if (isSoftDeleted(result.body)) {
    return null;
  }
  return toAuthSessionResponse(result.body);
}

/**
 * The guard every protected WERVI route uses. Unlike raw `getSession`, it
 * refuses when the cookie is missing and unless the account is *active*: the
 * check is an allowlist, so `pending`, `suspended`, `closed` and a missing
 * status are all refused, and a soft-deleted user (already a signed-out
 * session) is refused as unauthorized.
 */
export async function getRequiredSession(
  auth: AuthInstance,
  request: AuthProxyRequest,
): Promise<AuthSessionResponse> {
  const session = await getSession(auth, request);
  if (session === null) {
    throw new UnauthorizedError('Not signed in');
  }
  if (session.user.status !== 'active') {
    throw new ForbiddenError('Your account is not active');
  }
  return session;
}

/**
 * Whether the raw `get-session` payload carries a soft-deleted user.
 *
 * Defensive about shape: anything that is not an object with a non-null
 * `user.deletedAt` is treated as not deleted, and the normal mapping path then
 * reports a contract fault if the payload is malformed.
 */
function isSoftDeleted(body: unknown): boolean {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return false;
  }
  const user = (body as Record<string, unknown>)['user'];
  if (typeof user !== 'object' || user === null || Array.isArray(user)) {
    return false;
  }
  const deletedAt = (user as Record<string, unknown>)['deletedAt'];
  return deletedAt !== null && deletedAt !== undefined;
}

/**
 * Maps the user object Better Auth returns onto the WERVI wire contract.
 * Unknown or extra fields (e.g. `token`, `deletedAt`) are pruned rather than
 * forwarded, and a shape that no longer matches the contract is a server fault
 * rather than a raw passthrough.
 */
export function toAuthUser(value: unknown): AuthUser {
  const record = asRecord(value);
  const parsed = authUserSchema.safeParse({
    id: record['id'],
    name: record['name'],
    email: record['email'],
    emailVerified: record['emailVerified'],
    roles: record['roles'] ?? [],
    status: record['status'] ?? null,
    image: record['image'] ?? null,
    createdAt: record['createdAt'],
    updatedAt: record['updatedAt'],
  });
  if (!parsed.success) {
    shapeError();
  }
  return parsed.data;
}

/**
 * The `user` field of a Better Auth sign-up/sign-in body. `undefined` when the
 * response does not carry one, which `toAuthUser` treats as a shape fault.
 */
export function authBodyUser(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return undefined;
  }
  return (body as Record<string, unknown>)['user'];
}

function toAuthSession(value: unknown): AuthSession {
  const record = asRecord(value);
  const parsed = authSessionSchema.safeParse({
    id: record['id'],
    userId: record['userId'],
    expiresAt: record['expiresAt'],
    createdAt: record['createdAt'],
    updatedAt: record['updatedAt'],
  });
  if (!parsed.success) {
    shapeError();
  }
  return parsed.data;
}

function toAuthSessionResponse(body: unknown): AuthSessionResponse {
  const record = asRecord(body);
  return {
    session: toAuthSession(record['session']),
    user: toAuthUser(record['user']),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    shapeError();
  }
  return value as Record<string, unknown>;
}

/** Contract drift is a server bug, surfaced as an opaque 500. */
function shapeError(): never {
  throw new AppError('internal_error', 'An unexpected error occurred');
}

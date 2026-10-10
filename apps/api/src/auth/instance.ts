import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import {
  authAccounts,
  authSessions,
  authVerifications,
  users,
  type Database,
} from '@wervi/db';
import { normalizeEmail, type Role } from '@wervi/shared';
import { betterAuth } from 'better-auth';

/** Roles granted to every new account until the profile flow changes them. */
const DEFAULT_ROLES: Role[] = ['client'];

/** The lifecycle status every new account starts in. */
const DEFAULT_STATUS = 'active';

export interface AuthInstanceOptions {
  /**
   * Absolute origin of the API, e.g. `http://localhost:4000`. Better Auth
   * routes live under `/api/auth` on this origin, so the value also drives the
   * `baseURL` option and cookie scope.
   */
  origin: string;
  /**
   * Cookie-signing secret. `undefined` in development lets Better Auth derive
   * an ephemeral secret; production requires a stable value (validated in the
   * environment schema).
   */
  secret: string | undefined;
  /** Hosts allowed to make cookie-bearing requests (web apps and the API). */
  trustedOrigins: string[];
  /**
   * SameSite policy for session cookies. `'lax'` (default) is correct when web
   * and API share a registrable domain. `'none'` is required when they are
   * different sites (e.g. sibling `*.onrender.com` services), because the
   * browser would otherwise drop Lax cookies on the frontend's cross-site
   * credentialed fetches. Better Auth still sets the Secure flag (derived from
   * the https base URL) and origin checks stay enabled, so CSRF protection is
   * unaffected.
   */
  cookieSameSite: 'lax' | 'none';
}

/**
 * The single Better Auth instance shared by every auth route.
 *
 * WERVI is a thin, explicit wrapper around Better Auth rather than an
 * unmodified proxy: the framework (Fastify) owns routing and OpenAPI, and each
 * `/auth/*` route forwards a carefully constructed request to `auth.handler`,
 * copies the signed cookies back, and re-shapes the response into the WERVI
 * envelope. The database tables were designed for the Drizzle adapter, so the
 * adapter is pointed at them by name and WERVI-only columns are declared as
 * `additionalFields`.
 */
export function createAuthInstance(
  database: Database,
  options: AuthInstanceOptions,
) {
  const auth = betterAuth({
    appName: 'WERVI',
    secret: options.secret,
    baseURL: `${options.origin}/api/auth`,
    trustedOrigins: options.trustedOrigins,
    database: drizzleAdapter(database.db, {
      provider: 'pg',
      schema: {
        user: users,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    advanced: {
      database: {
        // `id` columns are database-defaulted UUIDs (see `primaryId()` in
        // @wervi/db), so Better Auth must not generate its own string ids.
        generateId: false,
      },
      // Flip the default SameSite=Lax only when the frontend and API are
      // different sites (public-suffix hosts such as *.onrender.com).
      // `defaultCookieAttributes` merges over the built-in defaults (secure,
      // httpOnly, path), so this only touches sameSite.
      defaultCookieAttributes: {
        sameSite: options.cookieSameSite,
      },
    },
    user: {
      additionalFields: {
        roles: {
          type: 'string[]',
          required: false,
          input: false,
        },
        status: {
          type: 'string',
          required: false,
          input: false,
        },
        deletedAt: {
          type: 'date',
          required: false,
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    databaseHooks: {
      user: {
        create: {
          // Normalization happens here as well as at the route boundary, so a
          // future endpoint that signs a user up behind the API's back cannot
          // bypass the lowercase + trim invariant. Defaults apply so no insert
          // depends on a caller remembering WERVI's role/status conventions.
          before: (user) =>
            Promise.resolve({
              data: {
                ...user,
                email: normalizeEmail(user.email),
                roles: [...DEFAULT_ROLES],
                status: DEFAULT_STATUS,
              },
            }),
        },
      },
    },
  });

  return auth;
}

export type AuthInstance = ReturnType<typeof createAuthInstance>;

import {
  closeDatabase,
  resetDatabase,
  resolveTestDatabaseUrl,
  setupDatabase,
  type TestDatabaseTarget,
} from '@wervi/db/testing';
import { users } from '@wervi/db';
import { type AuthUser, type Role } from '@wervi/shared';
import { eq } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { DrizzleUsersRepository } from '../src/repositories/index.js';

const target: TestDatabaseTarget = resolveTestDatabaseUrl();
const skip = target.url === undefined;

/**
 * `user` is not serialized with `null` for roles/status: WERVI defaults are
 * applied by the create hook, so a live user always carries them.
 */
const USER_KEYS = [
  'id',
  'name',
  'email',
  'emailVerified',
  'roles',
  'status',
  'image',
  'createdAt',
  'updatedAt',
] as const;

describe.skipIf(skip)('auth endpoints', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let database: Awaited<ReturnType<typeof setupDatabase>>;

  beforeAll(async () => {
    database = await setupDatabase(target.url as string);
    Object.assign(process.env, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: target.url as string,
      DATABASE_SSL: 'disable',
      API_RATE_LIMIT_MAX: '10000',
      BETTER_AUTH_SECRET: 'test-secret-that-is-long-enough',
    });
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await closeDatabase(database);
  });

  beforeEach(async () => {
    await resetDatabase(database);
  });

  const signupPayload = () => ({
    name: 'Ada Lovelace',
    email: `${Date.now()}-ada@example.com`,
    password: 'Sup3r-secret!',
  });

  const signup = async (
    payload: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: {
        'content-type': 'application/json',
        cookie: headers.cookie ?? '',
      },
      payload,
    });

  const login = async (
    email: string,
    password: string,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: {
        'content-type': 'application/json',
        cookie: headers.cookie ?? '',
      },
      payload: { email, password },
    });

  const cookieHeader = (response: LightMyRequestResponse): string =>
    response.cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');

  const expectCleanUser = (user: unknown): void => {
    const record = user as Record<string, unknown>;
    expect(Object.keys(record).sort()).toEqual([...USER_KEYS].sort());
    for (const key of Object.keys(record)) {
      expect(key.toLowerCase()).not.toMatch(
        /token|password|secret|credential/i,
      );
    }
  };

  const expectNoSensitiveLeaks = (body: unknown): void => {
    const serialized = JSON.stringify(body).toLowerCase();
    for (const needle of [
      'token',
      'secret',
      'accesstoken',
      'refreshtoken',
      'idtoken',
    ]) {
      expect(serialized).not.toContain(needle);
    }
  };

  it('signs up a new user, normalizing the email and applying defaults', async () => {
    const payload = signupPayload();
    payload.email = '  Ada@Example.COM ';
    const response = await signup(payload);

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.email).toBe('ada@example.com');
    expect(body.user.name).toBe('Ada Lovelace');
    expect(body.user.roles).toEqual(['client']);
    expect(body.user.status).toBe('active');
    expect(body.user.emailVerified).toBe(false);
    expectCleanUser(body.user);
    expectNoSensitiveLeaks(body);

    expect(response.cookies.length).toBeGreaterThan(0);
    expect(cookieHeader(response)).toContain('session_token');
  });

  it('stores the email normalized in the database', async () => {
    const payload = signupPayload();
    payload.email = 'MixedCase@Example.COM';
    const response = await signup(payload);
    expect(response.statusCode).toBe(200);

    const row = await database.db.query.users.findFirst({
      where: eq(users.email, 'mixedcase@example.com'),
    });
    expect(row?.email).toBe('mixedcase@example.com');
  });

  it('rejects a duplicate email', async () => {
    const payload = signupPayload();
    expect((await signup(payload)).statusCode).toBe(200);

    const duplicate = await signup(payload);
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('conflict');
    expectNoSensitiveLeaks(duplicate.json());
  });

  it('rejects a duplicate email that differs only by case and whitespace', async () => {
    const payload = signupPayload();
    payload.email = 'Casey@Example.com';
    expect((await signup(payload)).statusCode).toBe(200);

    const duplicate = await signup({
      ...payload,
      email: '  cAsEy@example.COM ',
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('conflict');
  });

  it('returns the shared error envelope for invalid signup payloads', async () => {
    const cases: Record<string, unknown>[] = [
      { ...signupPayload(), email: 'not-an-email' },
      { ...signupPayload(), password: 'short' },
      { ...signupPayload(), name: '' },
      { ...signupPayload(), roles: ['admin'] },
      { ...signupPayload(), roles: ['root'] },
      { ...signupPayload(), surprise: 'field' },
    ];

    for (const [index, payload] of cases.entries()) {
      const response = await signup(payload);
      expect(response.statusCode, `case ${index}`).toBe(422);
      const body = response.json();
      expect(body.error.code).toBe('validation_failed');
      expect(typeof body.error.requestId).toBe('string');
    }
  });

  it('signs in with valid credentials and sets a session cookie', async () => {
    const payload = signupPayload();
    await signup(payload);

    const response = await login(payload.email, payload.password);
    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe(payload.email);
    expectCleanUser(response.json().user);
    expect(cookieHeader(response)).toContain('session_token');
  });

  it('signs in with a case- and whitespace-variant email', async () => {
    const payload = signupPayload();
    await signup(payload);

    const response = await login(
      `  ${payload.email.toUpperCase()}  `,
      payload.password,
    );
    expect(response.statusCode).toBe(200);
  });

  it('rejects a wrong password as unauthorized', async () => {
    const payload = signupPayload();
    await signup(payload);

    const response = await login(payload.email, 'wrong-password');
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('unauthorized');
  });

  it('rejects an unknown email as unauthorized', async () => {
    const response = await login('nobody@example.com', 'whatever-pass');
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('unauthorized');
  });

  it('reports when no session exists', async () => {
    const me = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(me.statusCode).toBe(401);
    expect(me.json().error.code).toBe('unauthorized');

    const session = await app.inject({ method: 'GET', url: '/auth/session' });
    expect(session.statusCode).toBe(401);
    expect(session.json().error.code).toBe('unauthorized');
  });

  it('returns the current session for a signed-in user', async () => {
    const payload = signupPayload();
    const signedUp = await signup(payload);
    const cookie = cookieHeader(signedUp);

    const session = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { cookie },
    });
    expect(session.statusCode).toBe(200);
    const body = session.json();
    expect(body.user.id).toBe(signedUp.json().user.id);
    expect(body.session.userId).toBe(body.user.id);
    expect(
      new Date(body.session.expiresAt as string).getTime(),
    ).toBeGreaterThan(Date.now());
    expect(Object.keys(body.session as Record<string, unknown>).sort()).toEqual(
      ['id', 'userId', 'expiresAt', 'createdAt', 'updatedAt'].sort(),
    );
    expectCleanUser(body.user);
    expectNoSensitiveLeaks(body);
  });

  it('protects routes behind the requireAuth guard', async () => {
    const anonymous = await app.inject({
      method: 'GET',
      url: '/auth/protected',
    });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json().error.code).toBe('unauthorized');

    const payload = signupPayload();
    const signedUp = await signup(payload);
    const guarded = await app.inject({
      method: 'GET',
      url: '/auth/protected',
      headers: { cookie: cookieHeader(signedUp) },
    });
    expect(guarded.statusCode).toBe(200);
    expect(guarded.json().ok).toBe(true);
    expect(guarded.json().user.email).toBe(payload.email);
    expectCleanUser(guarded.json().user);
  });

  it('logs out, revokes the session, and is idempotent', async () => {
    const payload = signupPayload();
    const signedUp = await signup(payload);
    const cookie = cookieHeader(signedUp);

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {},
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json().success).toBe(true);

    const after = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie },
    });
    expect(after.statusCode).toBe(401);

    const again = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().success).toBe(true);
  });

  it('blocks a suspended account from using its session', async () => {
    const payload = signupPayload();
    const signedUp = await signup(payload);
    const cookie = cookieHeader(signedUp);
    const userId = signedUp.json().user.id as string;

    await database.db
      .update(users)
      .set({ status: 'suspended' })
      .where(eq(users.id, userId));

    const session = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { cookie },
    });
    expect(session.statusCode).toBe(403);
    expect(session.json().error.code).toBe('forbidden');

    const guarded = await app.inject({
      method: 'GET',
      url: '/auth/protected',
      headers: { cookie },
    });
    expect(guarded.statusCode).toBe(403);
  });

  it('blocks a pending account from using its session', async () => {
    const payload = signupPayload();
    const signedUp = await signup(payload);
    const cookie = cookieHeader(signedUp);
    const userId = signedUp.json().user.id as string;

    await database.db
      .update(users)
      .set({ status: 'pending' })
      .where(eq(users.id, userId));

    const session = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { cookie },
    });
    expect(session.statusCode).toBe(403);
    expect(session.json().error.code).toBe('forbidden');

    const guarded = await app.inject({
      method: 'GET',
      url: '/auth/protected',
      headers: { cookie },
    });
    expect(guarded.statusCode).toBe(403);
  });

  it('treats a soft-deleted account as signed out', async () => {
    const payload = signupPayload();
    const signedUp = await signup(payload);
    const cookie = cookieHeader(signedUp);
    const userId = signedUp.json().user.id as string;

    await database.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, userId));

    const session = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { cookie },
    });
    expect(session.statusCode).toBe(401);
    expect(session.json().error.code).toBe('unauthorized');

    const guarded = await app.inject({
      method: 'GET',
      url: '/auth/protected',
      headers: { cookie },
    });
    expect(guarded.statusCode).toBe(401);
  });

  it('never lets a client assign roles or status through the API', async () => {
    const payload = signupPayload();
    payload.email = 'Sneaky@Example.com';
    const response = await signup({
      ...payload,
      roles: ['admin'],
      status: 'suspended',
    });
    expect(response.statusCode).toBe(422);

    const clean = await signup(payload);
    expect(clean.statusCode).toBe(200);
    expect(clean.json().user.roles).toEqual(['client']);
    expect(clean.json().user.status).toBe('active');
  });

  it('echoes its contract in the OpenAPI document', async () => {
    const docs = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(docs.statusCode).toBe(200);
    const spec = docs.json();
    const paths = Object.keys(spec.paths as Record<string, unknown>);
    for (const expected of [
      '/auth/signup',
      '/auth/login',
      '/auth/logout',
      '/auth/session',
      '/auth/me',
      '/auth/protected',
      '/auth/roles/client',
      '/auth/roles/freelancer',
      '/auth/roles/admin',
      '/auth/roles/participant',
    ]) {
      expect(paths).toContain(expected);
    }
  });

  describe('authorization and roles', () => {
    const accountWithRoles = async (roles: Role[]) => {
      const payload = signupPayload();
      const signedUp = await signup(payload);
      expect(signedUp.statusCode).toBe(200);
      const userId = signedUp.json().user.id as string;
      if (roles.length > 0) {
        await database.db
          .update(users)
          .set({ roles })
          .where(eq(users.id, userId));
      }
      return {
        cookie: cookieHeader(signedUp),
        user: signedUp.json().user as AuthUser,
      };
    };

    const get = async (path: string, cookie?: string) =>
      app.inject({
        method: 'GET',
        url: path,
        headers: cookie === undefined ? {} : { cookie },
      });

    const roleRoutes = [
      '/auth/roles/client',
      '/auth/roles/freelancer',
      '/auth/roles/admin',
      '/auth/roles/participant',
    ] as const;

    const genericForbidden = (response: LightMyRequestResponse) => {
      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error.code).toBe('forbidden');
      for (const needle of ['client', 'freelancer', 'admin']) {
        expect(JSON.stringify(body).toLowerCase()).not.toContain(needle);
      }
      expectNoSensitiveLeaks(body);
    };

    it('has no role-gated route reachable without a session', async () => {
      for (const path of roleRoutes) {
        const response = await get(path);
        expect(response.statusCode, path).toBe(401);
        expect(response.json().error.code).toBe('unauthorized');
      }
    });

    it('admits the matching role to each exact-role route', async () => {
      const client = await accountWithRoles(['client']);
      const clientOk = await get('/auth/roles/client', client.cookie);
      expect(clientOk.statusCode).toBe(200);
      expect(clientOk.json().authorizedRole).toBe('client');

      const freelancer = await accountWithRoles(['freelancer']);
      const freelancerOk = await get(
        '/auth/roles/freelancer',
        freelancer.cookie,
      );
      expect(freelancerOk.statusCode).toBe(200);
      expect(freelancerOk.json().authorizedRole).toBe('freelancer');

      const admin = await accountWithRoles(['admin']);
      const adminOk = await get('/auth/roles/admin', admin.cookie);
      expect(adminOk.statusCode).toBe(200);
      expect(adminOk.json().authorizedRole).toBe('admin');
      expectCleanUser(adminOk.json().user);
      expectNoSensitiveLeaks(adminOk.json());
    });

    it('forbids role routes the account does not hold', async () => {
      const expectations: {
        roles: Role[];
        allowed: string[];
        denied: string[];
      }[] = [
        {
          roles: ['client'],
          allowed: ['/auth/roles/client', '/auth/roles/participant'],
          denied: ['/auth/roles/freelancer', '/auth/roles/admin'],
        },
        {
          roles: ['freelancer'],
          allowed: ['/auth/roles/freelancer', '/auth/roles/participant'],
          denied: ['/auth/roles/client', '/auth/roles/admin'],
        },
        {
          roles: ['admin'],
          allowed: ['/auth/roles/admin'],
          denied: [
            '/auth/roles/client',
            '/auth/roles/freelancer',
            '/auth/roles/participant',
          ],
        },
      ];

      for (const { roles, allowed, denied } of expectations) {
        const account = await accountWithRoles(roles);
        for (const path of allowed) {
          expect((await get(path, account.cookie)).statusCode, path).toBe(200);
        }
        for (const path of denied) {
          genericForbidden(await get(path, account.cookie));
        }
      }
    });

    it('admits any listed role to the any-of route, echoing the granted one', async () => {
      const client = await accountWithRoles(['client']);
      const asClient = await get('/auth/roles/participant', client.cookie);
      expect(asClient.statusCode).toBe(200);
      expect(asClient.json().authorizedRole).toBe('client');

      const freelancer = await accountWithRoles(['freelancer']);
      const asFreelancer = await get(
        '/auth/roles/participant',
        freelancer.cookie,
      );
      expect(asFreelancer.statusCode).toBe(200);
      expect(asFreelancer.json().authorizedRole).toBe('freelancer');
    });

    it('treats additive roles independently', async () => {
      const dual = await accountWithRoles(['client', 'freelancer']);

      expect((await get('/auth/roles/client', dual.cookie)).statusCode).toBe(
        200,
      );
      expect(
        (await get('/auth/roles/freelancer', dual.cookie)).statusCode,
      ).toBe(200);
      genericForbidden(await get('/auth/roles/admin', dual.cookie));
    });

    it('forbids suspended or closed accounts from role-gated routes', async () => {
      for (const status of ['suspended', 'closed'] as const) {
        const account = await accountWithRoles(['admin']);
        await database.db
          .update(users)
          .set({ status })
          .where(eq(users.id, account.user.id));
        genericForbidden(await get('/auth/roles/admin', account.cookie));
      }
    });

    it('gives no role-mutation surface to clients or admins', async () => {
      const admin = await accountWithRoles(['admin']);
      const client = await accountWithRoles(['client']);

      const attempts: {
        method: 'PATCH' | 'POST' | 'PUT';
        url: string;
        cookie: string;
        payload: Record<string, unknown>;
      }[] = [
        {
          method: 'PATCH',
          url: '/auth/me',
          cookie: client.cookie,
          payload: { name: 'Sneaky', roles: ['admin'] },
        },
        {
          method: 'POST',
          url: '/auth/roles',
          cookie: client.cookie,
          payload: { role: 'admin' },
        },
        {
          method: 'PUT',
          url: '/auth/session',
          cookie: client.cookie,
          payload: { roles: ['admin'] },
        },
        {
          method: 'PATCH',
          url: '/auth/me',
          cookie: admin.cookie,
          payload: { roles: ['admin', 'freelancer'] },
        },
      ];

      for (const attempt of attempts) {
        const response = await app.inject({
          method: attempt.method,
          url: attempt.url,
          headers: {
            cookie: attempt.cookie,
            'content-type': 'application/json',
          },
          payload: attempt.payload,
        });
        expect(response.statusCode, attempt.method).toBe(404);
        expect(response.json().error.code).toBe('not_found');
      }

      const unchanged = await database.db.query.users.findFirst({
        where: eq(users.id, admin.user.id),
      });
      expect(unchanged?.roles).toEqual(['admin']);
    });

    it('refuses to persist an unknown role at the database level', async () => {
      const account = await accountWithRoles(['client']);
      await expect(
        database.db
          .update(users)
          .set({ roles: ['root'] as unknown as Role[] })
          .where(eq(users.id, account.user.id)),
      ).rejects.toThrow();
    });
  });

  describe('users repository soft-delete', () => {
    it('resolves an active user by id and email, then stops once deleted', async () => {
      const payload = signupPayload();
      const signedUp = await signup(payload);
      const userId = signedUp.json().user.id as string;
      const repository = new DrizzleUsersRepository(database);

      const active = await repository.findById(userId);
      expect(active).not.toBeNull();
      expect(active?.deletedAt).toBeNull();
      expect((await repository.findByEmail(payload.email))?.id).toBe(userId);

      await database.db
        .update(users)
        .set({ deletedAt: new Date() })
        .where(eq(users.id, userId));

      expect(await repository.findById(userId)).toBeNull();
      expect(await repository.findByEmail(payload.email)).toBeNull();
    });
  });
});

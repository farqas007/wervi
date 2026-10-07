import {
  closeDatabase,
  resetDatabase,
  resolveTestDatabaseUrl,
  setupDatabase,
  type TestDatabaseTarget,
} from '@wervi/db/testing';
import { users } from '@wervi/db';
import { eq } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

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
    ]) {
      expect(paths).toContain(expected);
    }
  });
});

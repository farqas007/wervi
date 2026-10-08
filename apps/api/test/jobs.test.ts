import {
  closeDatabase,
  resetDatabase,
  resolveTestDatabaseUrl,
  setupDatabase,
  type TestDatabaseTarget,
} from '@wervi/db/testing';
import { categories, jobSkills, jobs, skills, users } from '@wervi/db';
import { jobSchema, type Role } from '@wervi/shared';
import { eq } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { DrizzleJobsRepository } from '../src/repositories/index.js';

const target: TestDatabaseTarget = resolveTestDatabaseUrl();
const skip = target.url === undefined;

type App = Awaited<ReturnType<typeof buildApp>>;

/** The exact wire shape of a job: an extra key is a contract regression. */
const JOB_KEYS = [
  'id',
  'clientId',
  'slug',
  'title',
  'description',
  'status',
  'visibility',
  'categoryId',
  'category',
  'skills',
  'budgetModel',
  'budgetMinMinor',
  'budgetMaxMinor',
  'currency',
  'experienceLevel',
  'duration',
  'workMode',
  'countryCode',
  'proposalCount',
  'publishedAt',
  'closedAt',
  'createdAt',
  'updatedAt',
] as const;

/** Two published rows sort by `published_at`; give the clock room to move. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

describe.skipIf(skip)('jobs', () => {
  let app: App;
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

  const signup = async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: `Test User ${Date.now()}`,
        email: `${Date.now()}-jobs-${Math.random()}@example.com`,
        password: 'Sup3r-secret!',
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    return {
      userId: body.user.id as string,
      cookie: cookieHeader(response),
    };
  };

  const inject = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT',
    url: string,
    options: { cookie?: string; payload?: Record<string, unknown> } = {},
  ) =>
    app.inject({
      method,
      url,
      headers: {
        'content-type': 'application/json',
        ...(options.cookie === undefined ? {} : { cookie: options.cookie }),
      },
      ...(options.payload === undefined ? {} : { payload: options.payload }),
    });

  /** The test database truncates every reset, so each test seeds its own. */
  const seedTaxonomy = async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const categoryRows = await database.db
      .insert(categories)
      .values([
        {
          slug: `engineering-${stamp}`,
          name: 'Software Engineering',
          description: 'Building software',
          position: 1,
        },
        {
          slug: `design-${stamp}`,
          name: 'Design',
          description: 'Visual design',
          position: 2,
        },
      ])
      .returning();
    const engineering = categoryRows[0];
    const design = categoryRows[1];

    const skillRows = await database.db
      .insert(skills)
      .values([
        {
          slug: `typescript-${stamp}`,
          name: 'TypeScript',
          categoryId: engineering?.id ?? null,
          position: 1,
        },
        {
          slug: `nodejs-${stamp}`,
          name: 'Node.js',
          categoryId: engineering?.id ?? null,
          position: 2,
        },
        {
          slug: `figma-${stamp}`,
          name: 'Figma',
          categoryId: design?.id ?? null,
          position: 1,
        },
      ])
      .returning();

    return {
      engineeringId: engineering?.id as string,
      designId: design?.id as string,
      typescriptId: skillRows[0]?.id as string,
      nodejsId: skillRows[1]?.id as string,
      figmaId: skillRows[2]?.id as string,
    };
  };

  const jobPayload = (
    categoryId: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    title: 'Build a payments dashboard',
    description:
      'We need a dashboard that visualises payment flows end to end.',
    categoryId,
    budgetModel: 'fixed',
    budgetMinMinor: 100_000,
    budgetMaxMinor: 500_000,
    currency: 'USD',
    experienceLevel: 'senior',
    duration: 'one_to_three_months',
    workMode: 'remote',
    countryCode: 'pt',
    ...overrides,
  });

  const createJob = async (
    cookie: string,
    categoryId: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const response = await inject('POST', '/jobs', {
      cookie,
      payload: jobPayload(categoryId, overrides),
    });
    expect(response.statusCode, JSON.stringify(response.json())).toBe(201);
    return response.json().job as Record<string, unknown> & {
      id: string;
      slug: string;
    };
  };

  const setStatus = async (cookie: string, jobId: string, status: string) => {
    const response = await inject('PUT', `/jobs/${jobId}/status`, {
      cookie,
      payload: { status },
    });
    expect(response.statusCode, JSON.stringify(response.json())).toBe(200);
    return response.json().job as Record<string, unknown>;
  };

  const browse = async (query = '') => {
    const response = await app.inject({ method: 'GET', url: `/jobs${query}` });
    expect(response.statusCode, JSON.stringify(response.json())).toBe(200);
    return response.json<{
      items: { id: string; slug: string; title: string; status: string }[];
      meta: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
      };
    }>();
  };

  const grantRoles = async (userId: string, roles: Role[]) => {
    await database.db.update(users).set({ roles }).where(eq(users.id, userId));
  };

  describe('creating jobs', () => {
    it('creates a draft with the full contract shape', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();

      const job = await createJob(account.cookie, fixture.engineeringId, {
        skills: [
          { skillId: fixture.typescriptId, isRequired: true },
          { skillId: fixture.nodejsId },
        ],
      });

      expect(job.status).toBe('draft');
      expect(job.visibility).toBe('public');
      expect(job.clientId).toBe(account.userId);
      expect(job.categoryId).toBe(fixture.engineeringId);
      expect(job.category).toMatchObject({
        id: fixture.engineeringId,
        name: 'Software Engineering',
      });
      expect(job.slug).toBe('build-a-payments-dashboard');
      expect(job.publishedAt).toBeNull();
      expect(job.closedAt).toBeNull();
      expect(job.proposalCount).toBe(0);
      expect(job.countryCode).toBe('PT');
      expect(job.duration).toBe('one_to_three_months');
      expect(
        (job.skills as { skill: { name: string }; isRequired: boolean }[]).map(
          (entry) => [entry.skill.name, entry.isRequired],
        ),
      ).toEqual([
        ['TypeScript', true],
        ['Node.js', false],
      ]);
      expect(Object.keys(job).sort()).toEqual([...JOB_KEYS].sort());
      expect(jobSchema.safeParse(job).success).toBe(true);

      const stored = await database.db.query.jobSkills.findMany({
        where: eq(jobSkills.jobId, job.id),
      });
      expect(stored).toHaveLength(2);
    });

    it('keeps the defaults a client did not ask for', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();

      const response = await inject('POST', '/jobs', {
        cookie: account.cookie,
        payload: {
          title: 'Minimal listing',
          description: 'A description that is long enough to be accepted.',
          categoryId: fixture.engineeringId,
          budgetModel: 'hourly',
          currency: 'EUR',
          experienceLevel: 'entry',
          workMode: 'onsite',
        },
      });
      expect(response.statusCode).toBe(201);
      const job = response.json().job;
      expect(job.status).toBe('draft');
      expect(job.visibility).toBe('public');
      expect(job.skills).toEqual([]);
      expect(job.budgetMinMinor).toBeNull();
      expect(job.budgetMaxMinor).toBeNull();
      expect(job.duration).toBeNull();
      expect(job.countryCode).toBeNull();
      expect(job.category.name).toBe('Software Engineering');
    });

    it('gives repeated titles distinct slugs', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();

      const first = await createJob(account.cookie, fixture.engineeringId);
      const second = await createJob(account.cookie, fixture.engineeringId);

      expect(first.slug).toBe('build-a-payments-dashboard');
      expect(second.slug).not.toBe(first.slug);
      expect(second.slug.startsWith(first.slug)).toBe(true);
    });

    it('rejects unknown categories, unknown skills and deactivated rows', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      const inactive = await database.db
        .insert(categories)
        .values({
          slug: `retired-${Date.now()}`,
          name: 'Retired',
          position: 99,
          isActive: false,
        })
        .returning();

      const unknownCategory = await inject('POST', '/jobs', {
        cookie: account.cookie,
        payload: jobPayload('00000000-0000-4000-8000-000000000000'),
      });
      expect(unknownCategory.statusCode).toBe(422);
      expect(unknownCategory.json().error.details).toBeDefined();

      const inactiveCategory = await inject('POST', '/jobs', {
        cookie: account.cookie,
        payload: jobPayload(inactive[0]?.id as string),
      });
      expect(inactiveCategory.statusCode).toBe(422);

      const unknownSkill = await inject('POST', '/jobs', {
        cookie: account.cookie,
        payload: jobPayload(fixture.engineeringId, {
          skills: [{ skillId: '00000000-0000-4000-8000-000000000000' }],
        }),
      });
      expect(unknownSkill.statusCode).toBe(422);

      const inactiveSkill = await database.db
        .insert(skills)
        .values({
          slug: `legacy-${Date.now()}`,
          name: 'Legacy',
          categoryId: fixture.engineeringId,
          position: 99,
          isActive: false,
        })
        .returning();
      const deactivatedSkill = await inject('POST', '/jobs', {
        cookie: account.cookie,
        payload: jobPayload(fixture.engineeringId, {
          skills: [{ skillId: inactiveSkill[0]?.id }],
        }),
      });
      expect(deactivatedSkill.statusCode).toBe(422);

      const stored = await database.db.query.jobs.findMany();
      expect(stored).toEqual([]);
    });

    it('rejects malformed and out-of-vocabulary bodies', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      const cases: Record<string, unknown>[] = [
        jobPayload(fixture.engineeringId, { title: 'ab' }),
        jobPayload(fixture.engineeringId, { description: 'short' }),
        jobPayload(fixture.engineeringId, { budgetModel: 'per_task' }),
        jobPayload(fixture.engineeringId, { currency: 'XXX' }),
        jobPayload(fixture.engineeringId, { experienceLevel: 'grandmaster' }),
        jobPayload(fixture.engineeringId, { workMode: 'orbital' }),
        jobPayload(fixture.engineeringId, { visibility: 'hidden' }),
        jobPayload(fixture.engineeringId, { status: 'closed' }),
        jobPayload(fixture.engineeringId, { status: 'paused' }),
        jobPayload(fixture.engineeringId, {
          budgetMinMinor: 500_000,
          budgetMaxMinor: 100_000,
        }),
        jobPayload(fixture.engineeringId, { budgetMinMinor: -1 }),
        jobPayload(fixture.engineeringId, { countryCode: 'zzz' }),
        jobPayload(fixture.engineeringId, {
          skills: [
            { skillId: fixture.typescriptId },
            { skillId: fixture.typescriptId },
          ],
        }),
      ];

      for (const [index, payload] of cases.entries()) {
        const response = await inject('POST', '/jobs', {
          cookie: account.cookie,
          payload,
        });
        expect(response.statusCode, `case ${index}`).toBe(422);
        expect(response.json().error.code).toBe('validation_failed');
      }
    });

    it('refuses mass assignment of ids, counters and status', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();

      const response = await inject('POST', '/jobs', {
        cookie: account.cookie,
        payload: jobPayload(fixture.engineeringId, {
          id: '00000000-0000-4000-8000-000000000000',
          clientId: '00000000-0000-4000-8000-000000000001',
          slug: 'hijacked',
          status: 'published',
          proposalCount: 99,
          publishedAt: '2000-01-01T00:00:00.000Z',
        }),
      });
      expect(response.statusCode).toBe(422);

      const stored = await database.db.query.jobs.findMany();
      expect(stored).toEqual([]);
    });
  });

  describe('my jobs', () => {
    it('lists only my listings, newest first, including drafts', async () => {
      const fixture = await seedTaxonomy();
      const alice = await signup();
      const bob = await signup();

      const empty = await inject('GET', '/jobs/me', { cookie: alice.cookie });
      expect(empty.statusCode).toBe(200);
      expect(empty.json().items).toEqual([]);
      expect(empty.json().meta.total).toBe(0);

      const first = await createJob(alice.cookie, fixture.engineeringId, {
        title: 'First listing',
      });
      await tick();
      const second = await createJob(alice.cookie, fixture.designId, {
        title: 'Second listing',
      });
      await createJob(bob.cookie, fixture.engineeringId, {
        title: 'Someone else listing',
      });

      const mine = await inject('GET', '/jobs/me', { cookie: alice.cookie });
      expect(mine.statusCode).toBe(200);
      const body = mine.json();
      expect(
        (body.items as { title: string }[]).map((item) => item.title),
      ).toEqual(['Second listing', 'First listing']);
      expect(body.meta).toMatchObject({
        page: 1,
        pageSize: 20,
        total: 2,
        hasNextPage: false,
        hasPreviousPage: false,
      });
      expect((body.items as { id: string }[]).map((i) => i.id)).toContain(
        first.id,
      );
      expect((body.items as { id: string }[]).map((i) => i.id)).toContain(
        second.id,
      );
    });

    it('filters my jobs by status', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      const draft = await createJob(account.cookie, fixture.engineeringId);
      const live = await createJob(account.cookie, fixture.engineeringId);
      await setStatus(account.cookie, live.id, 'published');

      const published = await inject('GET', '/jobs/me?status=published', {
        cookie: account.cookie,
      });
      expect(published.statusCode).toBe(200);
      expect(
        (published.json().items as { id: string }[]).map((i) => i.id),
      ).toEqual([live.id]);

      const drafts = await inject('GET', '/jobs/me?status=draft', {
        cookie: account.cookie,
      });
      expect(
        (drafts.json().items as { id: string }[]).map((i) => i.id),
      ).toEqual([draft.id]);

      const nonsense = await inject('GET', '/jobs/me?status=archived', {
        cookie: account.cookie,
      });
      expect(nonsense.statusCode).toBe(422);
    });

    it('pages my jobs with the standard meta', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      for (let index = 0; index < 3; index++) {
        await createJob(account.cookie, fixture.engineeringId, {
          title: `Listing number ${index}`,
        });
      }

      const page = await inject('GET', '/jobs/me?page=2&pageSize=2', {
        cookie: account.cookie,
      });
      expect(page.statusCode).toBe(200);
      expect(page.json().meta).toEqual({
        page: 2,
        pageSize: 2,
        total: 3,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      });
      expect(page.json().items).toHaveLength(1);
    });
  });

  describe('public browse', () => {
    it('shows only published, public listings', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();

      const draft = await createJob(account.cookie, fixture.engineeringId, {
        title: 'Draft job',
      });
      const live = await createJob(account.cookie, fixture.engineeringId, {
        title: 'Live job',
      });
      await setStatus(account.cookie, live.id, 'published');

      const paused = await createJob(account.cookie, fixture.engineeringId, {
        title: 'Paused job',
      });
      await setStatus(account.cookie, paused.id, 'published');
      await setStatus(account.cookie, paused.id, 'paused');

      const closed = await createJob(account.cookie, fixture.engineeringId, {
        title: 'Closed job',
      });
      await setStatus(account.cookie, closed.id, 'published');
      await setStatus(account.cookie, closed.id, 'closed');

      const inviteOnly = await createJob(
        account.cookie,
        fixture.engineeringId,
        { title: 'Invite-only job' },
      );
      await setStatus(account.cookie, inviteOnly.id, 'published');
      await inject('PATCH', `/jobs/${inviteOnly.id}`, {
        cookie: account.cookie,
        payload: { visibility: 'invite_only' },
      });

      const hidden = await createJob(account.cookie, fixture.engineeringId, {
        title: 'Private job',
      });
      await setStatus(account.cookie, hidden.id, 'published');
      await inject('PATCH', `/jobs/${hidden.id}`, {
        cookie: account.cookie,
        payload: { visibility: 'private' },
      });

      const page = await browse();
      expect(page.items.map((item) => item.title)).toEqual(['Live job']);
      expect(page.items.every((item) => item.status === 'published')).toBe(
        true,
      );
      expect(page.meta.total).toBe(1);
      expect(draft.id).not.toBe(live.id);
    });

    it('orders by most recently published', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();

      const older = await createJob(account.cookie, fixture.engineeringId, {
        title: 'Older listing',
      });
      await setStatus(account.cookie, older.id, 'published');
      await tick();
      const newer = await createJob(account.cookie, fixture.engineeringId, {
        title: 'Newer listing',
      });
      await setStatus(account.cookie, newer.id, 'published');

      const page = await browse();
      expect(page.items.map((item) => item.title)).toEqual([
        'Newer listing',
        'Older listing',
      ]);
    });

    it('filters by text, category, skills, attributes and budget', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();

      const alpha = await createJob(account.cookie, fixture.engineeringId, {
        title: 'Alpha TypeScript parser',
        description: 'Rewrite the legacy parser in a modern language.',
        skills: [{ skillId: fixture.typescriptId }],
        experienceLevel: 'senior',
        budgetModel: 'fixed',
        currency: 'USD',
        budgetMinMinor: 100_000,
        budgetMaxMinor: 500_000,
        workMode: 'remote',
      });
      await setStatus(account.cookie, alpha.id, 'published');
      await tick();
      const beta = await createJob(account.cookie, fixture.designId, {
        title: 'Beta design system',
        description: 'Extend the component library with new tokens.',
        skills: [{ skillId: fixture.figmaId }],
        experienceLevel: 'intermediate',
        budgetModel: 'hourly',
        currency: 'EUR',
        budgetMinMinor: 60_000,
        budgetMaxMinor: 90_000,
        workMode: 'hybrid',
      });
      await setStatus(account.cookie, beta.id, 'published');
      await tick();
      const gamma = await createJob(account.cookie, fixture.engineeringId, {
        title: 'Gamma scripting tool',
        description: 'Automate the release pipeline end to end.',
        skills: [
          { skillId: fixture.typescriptId },
          { skillId: fixture.nodejsId },
        ],
        experienceLevel: 'entry',
        budgetModel: 'fixed',
        currency: 'USD',
        budgetMinMinor: 50_000,
        budgetMaxMinor: null,
        workMode: 'onsite',
      });
      await setStatus(account.cookie, gamma.id, 'published');

      const titles = async (query: string) =>
        (await browse(query)).items.map((item) => item.title);

      expect(await titles('?q=alpha')).toEqual(['Alpha TypeScript parser']);
      expect(await titles('?q=PARSER')).toEqual(['Alpha TypeScript parser']);
      expect(await titles('?q=component')).toEqual(['Beta design system']);
      expect(await titles('?q=nothing-matches')).toEqual([]);
      // LIKE wildcards and quotes in `q` stay literal text.
      expect(await titles('?q=%25')).toEqual([]);
      expect(await titles("?q=alpha'%20OR%20'1'%3D'1")).toEqual([]);

      expect(await titles(`?categoryId=${fixture.designId}`)).toEqual([
        'Beta design system',
      ]);
      expect(await titles(`?skills=${fixture.typescriptId}`)).toEqual([
        'Gamma scripting tool',
        'Alpha TypeScript parser',
      ]);
      expect(
        await titles(`?skills=${fixture.typescriptId},${fixture.figmaId}`),
      ).toEqual([
        'Gamma scripting tool',
        'Beta design system',
        'Alpha TypeScript parser',
      ]);
      expect(await titles('?experienceLevel=entry')).toEqual([
        'Gamma scripting tool',
      ]);
      expect(await titles('?budgetModel=hourly')).toEqual([
        'Beta design system',
      ]);
      expect(await titles('?currency=EUR')).toEqual(['Beta design system']);
      expect(await titles('?workMode=hybrid')).toEqual(['Beta design system']);
      expect(await titles('?minBudget=60000&currency=USD')).toEqual([
        'Alpha TypeScript parser',
      ]);
      expect(await titles('?maxBudget=60000&currency=USD')).toEqual([
        'Gamma scripting tool',
      ]);
    });

    it('rejects filters that cannot be answered honestly', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      const job = await createJob(account.cookie, fixture.engineeringId);
      await setStatus(account.cookie, job.id, 'published');

      const cases = [
        '/jobs?minBudget=100',
        '/jobs?maxBudget=100',
        '/jobs?minBudget=500&maxBudget=100&currency=USD',
        '/jobs?skills=not-a-uuid',
        '/jobs?categoryId=not-a-uuid',
        '/jobs?status=published',
        '/jobs?page=0',
        '/jobs?pageSize=1000',
        '/jobs?anything=1',
      ];
      for (const url of cases) {
        const response = await app.inject({ method: 'GET', url });
        expect(response.statusCode, url).toBe(422);
        expect(response.json().error.code, url).toBe('validation_failed');
      }
    });

    it('pages the browse listing with the standard meta', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      for (let index = 0; index < 3; index++) {
        const job = await createJob(account.cookie, fixture.engineeringId, {
          title: `Browse listing ${index}`,
        });
        await setStatus(account.cookie, job.id, 'published');
      }

      const first = await browse('?page=1&pageSize=2');
      expect(first.items).toHaveLength(2);
      expect(first.meta).toEqual({
        page: 1,
        pageSize: 2,
        total: 3,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      });

      const last = await browse('?page=2&pageSize=2');
      expect(last.items).toHaveLength(1);
      expect(last.meta.hasNextPage).toBe(false);
      expect(last.meta.hasPreviousPage).toBe(true);
    });
  });

  describe('job detail', () => {
    it('serves a published listing to anonymous visitors', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      const job = await createJob(account.cookie, fixture.engineeringId, {
        skills: [{ skillId: fixture.typescriptId, isRequired: true }],
      });
      await setStatus(account.cookie, job.id, 'published');

      const response = await app.inject({
        method: 'GET',
        url: `/jobs/${job.id}`,
      });
      expect(response.statusCode).toBe(200);
      const view = response.json().job;
      expect(view.title).toBe('Build a payments dashboard');
      expect(view.category.name).toBe('Software Engineering');
      expect(view.skills).toHaveLength(1);
      expect(jobSchema.safeParse(view).success).toBe(true);
    });

    it('hides every non-public state from strangers behind a 404', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      const stranger = await signup();

      const states: {
        label: string;
        prepare: (id: string) => Promise<void>;
      }[] = [
        { label: 'draft', prepare: async () => {} },
        {
          label: 'paused',
          prepare: async (id) => {
            await setStatus(account.cookie, id, 'published');
            await setStatus(account.cookie, id, 'paused');
          },
        },
        {
          label: 'closed',
          prepare: async (id) => {
            await setStatus(account.cookie, id, 'published');
            await setStatus(account.cookie, id, 'closed');
          },
        },
        {
          label: 'invite_only',
          prepare: async (id) => {
            await setStatus(account.cookie, id, 'published');
            await inject('PATCH', `/jobs/${id}`, {
              cookie: account.cookie,
              payload: { visibility: 'invite_only' },
            });
          },
        },
        {
          label: 'private',
          prepare: async (id) => {
            await setStatus(account.cookie, id, 'published');
            await inject('PATCH', `/jobs/${id}`, {
              cookie: account.cookie,
              payload: { visibility: 'private' },
            });
          },
        },
      ];

      for (const state of states) {
        const job = await createJob(account.cookie, fixture.engineeringId, {
          title: `Hidden while ${state.label}`,
        });
        await state.prepare(job.id);

        const anonymous = await app.inject({
          method: 'GET',
          url: `/jobs/${job.id}`,
        });
        expect(anonymous.statusCode, state.label).toBe(404);
        expect(anonymous.json().error.code).toBe('not_found');

        const asStranger = await inject('GET', `/jobs/${job.id}`, {
          cookie: stranger.cookie,
        });
        expect(asStranger.statusCode, state.label).toBe(404);

        const asOwner = await inject('GET', `/jobs/${job.id}`, {
          cookie: account.cookie,
        });
        expect(asOwner.statusCode, state.label).toBe(200);
        expect(asOwner.json().job.status).toBe(
          state.label === 'invite_only' || state.label === 'private'
            ? 'published'
            : state.label,
        );
      }
    });

    it('answers unknown and malformed ids with 404 and 422', async () => {
      const anonymous = await app.inject({
        method: 'GET',
        url: '/jobs/00000000-0000-4000-8000-000000000000',
      });
      expect(anonymous.statusCode).toBe(404);

      const malformed = await app.inject({
        method: 'GET',
        url: '/jobs/not-a-uuid',
      });
      expect(malformed.statusCode).toBe(422);
    });
  });

  describe('updating jobs', () => {
    it('overwrites present fields, clears with null and keeps the rest', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      const job = await createJob(account.cookie, fixture.engineeringId, {
        budgetMinMinor: 100_000,
        budgetMaxMinor: 500_000,
        countryCode: 'pt',
        duration: 'one_to_three_months',
        visibility: 'public',
      });

      const response = await inject('PATCH', `/jobs/${job.id}`, {
        cookie: account.cookie,
        payload: {
          title: 'Renamed listing',
          budgetMaxMinor: null,
          countryCode: null,
          visibility: 'invite_only',
          workMode: 'hybrid',
        },
      });
      expect(response.statusCode).toBe(200);
      const updated = response.json().job;
      expect(updated.title).toBe('Renamed listing');
      expect(updated.workMode).toBe('hybrid');
      expect(updated.budgetMaxMinor).toBeNull();
      expect(updated.countryCode).toBeNull();
      expect(updated.visibility).toBe('invite_only');
      // Untouched fields survive the merge.
      expect(updated.description).toBe(job.description);
      expect(updated.budgetMinMinor).toBe(100_000);
      expect(updated.currency).toBe('USD');
      expect(updated.duration).toBe('one_to_three_months');
      expect(updated.categoryId).toBe(fixture.engineeringId);
    });

    it('replaces skills only when they are part of the patch', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      const job = await createJob(account.cookie, fixture.engineeringId, {
        skills: [{ skillId: fixture.typescriptId }],
      });

      const untouched = await inject('PATCH', `/jobs/${job.id}`, {
        cookie: account.cookie,
        payload: { title: 'Same skills, new title' },
      });
      expect(untouched.statusCode).toBe(200);
      expect(
        (untouched.json().job.skills as { skill: { id: string } }[]).map(
          (entry) => entry.skill.id,
        ),
      ).toEqual([fixture.typescriptId]);

      const replaced = await inject('PATCH', `/jobs/${job.id}`, {
        cookie: account.cookie,
        payload: {
          skills: [
            { skillId: fixture.figmaId, isRequired: true },
            { skillId: fixture.nodejsId },
          ],
        },
      });
      expect(replaced.statusCode).toBe(200);
      expect(
        (replaced.json().job.skills as { skill: { name: string } }[]).map(
          (entry) => entry.skill.name,
        ),
      ).toEqual(['Figma', 'Node.js']);

      const stored = await database.db.query.jobSkills.findMany({
        where: eq(jobSkills.jobId, job.id),
      });
      expect(stored.map((row) => row.skillId).sort()).toEqual(
        [fixture.figmaId, fixture.nodejsId].sort(),
      );
    });

    it('refuses mass assignment and lifecycle fields through PATCH', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      const job = await createJob(account.cookie, fixture.engineeringId);

      const response = await inject('PATCH', `/jobs/${job.id}`, {
        cookie: account.cookie,
        payload: {
          status: 'closed',
          proposalCount: 42,
          clientId: '00000000-0000-4000-8000-000000000000',
          slug: 'hijacked',
        },
      });
      expect(response.statusCode).toBe(422);

      const empty = await inject('PATCH', `/jobs/${job.id}`, {
        cookie: account.cookie,
        payload: {},
      });
      expect(empty.statusCode).toBe(422);

      const stored = await database.db.query.jobs.findFirst({
        where: eq(jobs.id, job.id),
      });
      expect(stored?.status).toBe('draft');
      expect(stored?.proposalCount).toBe(0);
      expect(stored?.slug).toBe('build-a-payments-dashboard');
    });

    it('rejects a merged budget range, bad taxonomy and bad vocabulary', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      const job = await createJob(account.cookie, fixture.engineeringId, {
        budgetMinMinor: 400_000,
        budgetMaxMinor: 500_000,
      });

      const crossingMax = await inject('PATCH', `/jobs/${job.id}`, {
        cookie: account.cookie,
        payload: { budgetMinMinor: 600_000 },
      });
      expect(crossingMax.statusCode).toBe(422);

      const crossingMin = await inject('PATCH', `/jobs/${job.id}`, {
        cookie: account.cookie,
        payload: { budgetMaxMinor: 100_000 },
      });
      expect(crossingMin.statusCode).toBe(422);

      const unknownCategory = await inject('PATCH', `/jobs/${job.id}`, {
        cookie: account.cookie,
        payload: { categoryId: '00000000-0000-4000-8000-000000000000' },
      });
      expect(unknownCategory.statusCode).toBe(422);

      const unknownSkill = await inject('PATCH', `/jobs/${job.id}`, {
        cookie: account.cookie,
        payload: {
          skills: [{ skillId: '00000000-0000-4000-8000-000000000000' }],
        },
      });
      expect(unknownSkill.statusCode).toBe(422);

      const badVisibility = await inject('PATCH', `/jobs/${job.id}`, {
        cookie: account.cookie,
        payload: { visibility: 'secret' },
      });
      expect(badVisibility.statusCode).toBe(422);

      // None of the rejections wrote anything.
      const stored = await database.db.query.jobs.findFirst({
        where: eq(jobs.id, job.id),
      });
      expect(stored?.budgetMinMinor).toBe(400_000);
      expect(stored?.budgetMaxMinor).toBe(500_000);
      expect(stored?.categoryId).toBe(fixture.engineeringId);
    });

    it('scopes writes to the owner and freezes closed jobs', async () => {
      const fixture = await seedTaxonomy();
      const owner = await signup();
      const stranger = await signup();

      const draft = await createJob(owner.cookie, fixture.engineeringId, {
        title: 'Private draft',
      });
      const live = await createJob(owner.cookie, fixture.engineeringId, {
        title: 'Public listing',
      });
      await setStatus(owner.cookie, live.id, 'published');

      const strangerSeesDraft = await inject('PATCH', `/jobs/${draft.id}`, {
        cookie: stranger.cookie,
        payload: { title: 'Stolen' },
      });
      expect(strangerSeesDraft.statusCode).toBe(404);

      const strangerSeesPublic = await inject('PATCH', `/jobs/${live.id}`, {
        cookie: stranger.cookie,
        payload: { title: 'Stolen' },
      });
      expect(strangerSeesPublic.statusCode).toBe(403);
      expect(strangerSeesPublic.json().error.code).toBe('forbidden');

      const unknown = await inject(
        'PATCH',
        '/jobs/00000000-0000-4000-8000-000000000000',
        { cookie: owner.cookie, payload: { title: 'Nowhere' } },
      );
      expect(unknown.statusCode).toBe(404);

      await setStatus(owner.cookie, live.id, 'closed');
      const onClosed = await inject('PATCH', `/jobs/${live.id}`, {
        cookie: owner.cookie,
        payload: { title: 'Too late' },
      });
      expect(onClosed.statusCode).toBe(409);
      expect(onClosed.json().error.code).toBe('conflict');

      const unchanged = await database.db.query.jobs.findFirst({
        where: eq(jobs.id, live.id),
      });
      expect(unchanged?.title).toBe('Public listing');
    });
  });

  describe('job lifecycle', () => {
    it('walks draft, published, paused, published and closed', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      const job = await createJob(account.cookie, fixture.engineeringId);

      expect((await browse()).items).toEqual([]);

      const published = await setStatus(account.cookie, job.id, 'published');
      expect(published.status).toBe('published');
      expect(published.publishedAt).not.toBeNull();
      expect((await browse()).items.map((item) => item.slug)).toEqual([
        'build-a-payments-dashboard',
      ]);

      const paused = await setStatus(account.cookie, job.id, 'paused');
      expect(paused.status).toBe('paused');
      expect(paused.publishedAt).not.toBeNull();
      expect((await browse()).items).toEqual([]);

      const again = await setStatus(account.cookie, job.id, 'published');
      expect(again.status).toBe('published');
      expect((await browse()).items).toHaveLength(1);

      const closed = await setStatus(account.cookie, job.id, 'closed');
      expect(closed.status).toBe('closed');
      expect(closed.closedAt).not.toBeNull();
      expect((await browse()).items).toEqual([]);

      const stored = await database.db.query.jobs.findFirst({
        where: eq(jobs.id, job.id),
      });
      expect(stored?.status).toBe('closed');
      expect(stored?.publishedAt).not.toBeNull();
      expect(stored?.closedAt).not.toBeNull();
    });

    it('rejects transitions the map does not allow', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      const draft = await createJob(account.cookie, fixture.engineeringId, {
        title: 'Fresh draft',
      });
      const live = await createJob(account.cookie, fixture.engineeringId, {
        title: 'Live listing',
      });
      await setStatus(account.cookie, live.id, 'published');
      await setStatus(account.cookie, live.id, 'closed');

      const cases: [string, string][] = [
        [draft.id, 'paused'],
        [live.id, 'published'],
        [live.id, 'paused'],
        [live.id, 'draft'],
      ];
      for (const [jobId, status] of cases) {
        const response = await inject('PUT', `/jobs/${jobId}/status`, {
          cookie: account.cookie,
          payload: { status },
        });
        expect(response.statusCode, `${jobId} -> ${status}`).toBe(409);
        expect(response.json().error.code).toBe('conflict');
      }
    });

    it('treats re-setting the current status as an idempotent no-op', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      const job = await createJob(account.cookie, fixture.engineeringId);
      await setStatus(account.cookie, job.id, 'published');
      const before = await database.db.query.jobs.findFirst({
        where: eq(jobs.id, job.id),
      });

      const again = await inject('PUT', `/jobs/${job.id}/status`, {
        cookie: account.cookie,
        payload: { status: 'published' },
      });
      expect(again.statusCode).toBe(200);
      expect(again.json().job.publishedAt).toBe(
        before?.publishedAt?.toISOString(),
      );
    });

    it('validates the status body strictly', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      const job = await createJob(account.cookie, fixture.engineeringId);

      const missing = await inject('PUT', `/jobs/${job.id}/status`, {
        cookie: account.cookie,
        payload: {},
      });
      expect(missing.statusCode).toBe(422);

      const unknownStatus = await inject('PUT', `/jobs/${job.id}/status`, {
        cookie: account.cookie,
        payload: { status: 'archived' },
      });
      expect(unknownStatus.statusCode).toBe(422);

      const extraField = await inject('PUT', `/jobs/${job.id}/status`, {
        cookie: account.cookie,
        payload: { status: 'published', note: 'because' },
      });
      expect(extraField.statusCode).toBe(422);
    });

    it('scopes status changes to the owner', async () => {
      const fixture = await seedTaxonomy();
      const owner = await signup();
      const stranger = await signup();
      const draft = await createJob(owner.cookie, fixture.engineeringId);
      const live = await createJob(owner.cookie, fixture.engineeringId);
      await setStatus(owner.cookie, live.id, 'published');

      const draftTheft = await inject('PUT', `/jobs/${draft.id}/status`, {
        cookie: stranger.cookie,
        payload: { status: 'published' },
      });
      expect(draftTheft.statusCode).toBe(404);

      const publicTheft = await inject('PUT', `/jobs/${live.id}/status`, {
        cookie: stranger.cookie,
        payload: { status: 'paused' },
      });
      expect(publicTheft.statusCode).toBe(403);

      const stored = await database.db.query.jobs.findFirst({
        where: eq(jobs.id, live.id),
      });
      expect(stored?.status).toBe('published');
    });

    it('refuses a status write that no longer matches what it read', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      const job = await createJob(account.cookie, fixture.engineeringId);
      await setStatus(account.cookie, job.id, 'published');

      const repository = new DrizzleJobsRepository(database);
      const applied = await repository.setStatus(
        job.id,
        'published',
        'paused',
        {},
      );
      expect(applied?.status).toBe('paused');

      // The same stale expectation loses the compare-and-set.
      const stale = await repository.setStatus(job.id, 'published', 'closed', {
        closedAt: new Date(),
      });
      expect(stale).toBeNull();

      const stored = await database.db.query.jobs.findFirst({
        where: eq(jobs.id, job.id),
      });
      expect(stored?.status).toBe('paused');
      expect(stored?.closedAt).toBeNull();
    });
  });

  describe('authorization', () => {
    it('requires a session on every write and on my listings', async () => {
      const fixture = await seedTaxonomy();
      const account = await signup();
      const job = await createJob(account.cookie, fixture.engineeringId);

      for (const [method, url, payload] of [
        ['POST', '/jobs', jobPayload(fixture.engineeringId)],
        ['GET', '/jobs/me', undefined],
        ['PATCH', `/jobs/${job.id}`, { title: 'Nope' }],
        ['PUT', `/jobs/${job.id}/status`, { status: 'published' }],
      ] as const) {
        const response = await inject(method, url, { payload });
        expect(response.statusCode, `${method} ${url}`).toBe(401);
        expect(response.json().error.code).toBe('unauthorized');
      }

      // The browse surface itself is public.
      const open = await app.inject({ method: 'GET', url: '/jobs' });
      expect(open.statusCode).toBe(200);
    });

    it('keeps freelancer-only and inactive accounts off the client routes', async () => {
      const fixture = await seedTaxonomy();
      const freelancer = await signup();
      await grantRoles(freelancer.userId, ['freelancer']);

      const denied = await inject('POST', '/jobs', {
        cookie: freelancer.cookie,
        payload: jobPayload(fixture.engineeringId),
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json().error.code).toBe('forbidden');

      const listed = await inject('GET', '/jobs/me', {
        cookie: freelancer.cookie,
      });
      expect(listed.statusCode).toBe(403);

      const suspended = await signup();
      await database.db
        .update(users)
        .set({ status: 'suspended' })
        .where(eq(users.id, suspended.userId));
      const blocked = await inject('POST', '/jobs', {
        cookie: suspended.cookie,
        payload: jobPayload(fixture.engineeringId),
      });
      expect(blocked.statusCode).toBe(403);

      const stored = await database.db.query.jobs.findMany();
      expect(stored).toEqual([]);
    });
  });

  it('exposes the jobs contract in the OpenAPI document', async () => {
    const docs = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(docs.statusCode).toBe(200);
    const paths = Object.keys(docs.json().paths as Record<string, unknown>);
    for (const expected of [
      '/jobs',
      '/jobs/me',
      '/jobs/{id}',
      '/jobs/{id}/status',
    ]) {
      expect(paths).toContain(expected);
    }
  });
});

function cookieHeader(response: LightMyRequestResponse): string {
  return response.cookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

import {
  closeDatabase,
  resetDatabase,
  resolveTestDatabaseUrl,
  setupDatabase,
  type TestDatabaseTarget,
} from '@wervi/db/testing';
import {
  categories,
  profileLanguages,
  profileSkills,
  skills,
  users,
} from '@wervi/db';
import { categorySchema } from '@wervi/shared';
import { eq } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const target: TestDatabaseTarget = resolveTestDatabaseUrl();
const skip = target.url === undefined;

type App = Awaited<ReturnType<typeof buildApp>>;

const FREELANCER_KEYS = [
  'userId',
  'headline',
  'bio',
  'hourlyRateMinor',
  'currency',
  'availability',
  'timezone',
  'countryCode',
  'experienceLevel',
  'visibility',
  'completedAt',
  'createdAt',
  'updatedAt',
  'skills',
  'languages',
] as const;

describe.skipIf(skip)('profiles and taxonomy', () => {
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
        email: `${Date.now()}-profile-${Math.random()}@example.com`,
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
    method: 'GET' | 'PATCH' | 'PUT',
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

  interface TaxonomyFixture {
    categoryIds: string[];
    skillIds: string[];
  }

  /** The taxonomy is seeded by `seedAuthAndTaxonomy` for production but the
   *  test database is truncated on every reset, so each test seeds its own. */
  const seedTaxonomy = async (): Promise<TaxonomyFixture> => {
    const rows = await database.db
      .insert(categories)
      .values([
        {
          slug: `engineering-${Date.now()}`,
          name: 'Software Engineering',
          description: 'Building software',
          position: 1,
        },
        {
          slug: `design-${Date.now()}`,
          name: 'Design',
          description: 'Visual design',
          position: 2,
        },
      ])
      .returning();
    const [engineering, design] = rows;

    const skillRows = await database.db
      .insert(skills)
      .values([
        {
          slug: `typescript-${Date.now()}`,
          name: 'TypeScript',
          categoryId: engineering?.id ?? null,
          position: 1,
        },
        {
          slug: `nodejs-${Date.now()}`,
          name: 'Node.js',
          categoryId: engineering?.id ?? null,
          position: 2,
        },
        {
          slug: `figma-${Date.now()}`,
          name: 'Figma',
          categoryId: design?.id ?? null,
          position: 1,
        },
      ])
      .returning();

    return {
      categoryIds: rows.map((row) => row.id),
      skillIds: skillRows.map((row) => row.id),
    };
  };

  const freelancerCreatePayload = (headline = 'Senior engineer') => ({
    headline,
    timezone: 'Europe/Lisbon',
  });

  describe('taxonomy', () => {
    it('serves only active categories and skills, in display order', async () => {
      await seedTaxonomy();
      const inactive = await database.db
        .insert(categories)
        .values({
          slug: `hidden-cat-${Date.now()}`,
          name: 'Hidden category',
          position: 99,
          isActive: false,
        })
        .returning();
      await database.db.insert(skills).values({
        slug: `hidden-skill-${Date.now()}`,
        name: 'Hidden skill',
        categoryId: inactive[0]?.id ?? null,
        position: 99,
        isActive: false,
      });

      const categoriesResponse = await inject('GET', '/categories');
      expect(categoriesResponse.statusCode).toBe(200);
      const categoriesBody = categoriesResponse.json().items;
      for (const item of categoriesBody as unknown[]) {
        expect(
          categorySchema.safeParse(item).success,
          'every category is a valid contract row',
        ).toBe(true);
        expect((item as { isActive: boolean }).isActive).toBe(true);
        expect((item as { name: string }).name).not.toBe('Hidden category');
      }
      expect((categoriesBody as { name: string }[]).map((c) => c.name)).toEqual(
        ['Software Engineering', 'Design'],
      );

      const skillsResponse = await inject('GET', '/skills');
      expect(skillsResponse.statusCode).toBe(200);
      const skillsBody = skillsResponse.json().items as { name: string }[];
      expect(skillsBody.map((s) => s.name)).toEqual([
        'Figma',
        'TypeScript',
        'Node.js',
      ]);
      expect(skillsBody.some((s) => s.name === 'Hidden skill')).toBe(false);
    });

    it('filters skills by category', async () => {
      const fixture = await seedTaxonomy();
      const response = await inject(
        'GET',
        `/skills?categoryId=${fixture.categoryIds[0]}`,
      );
      expect(response.statusCode).toBe(200);
      const names = (response.json().items as { name: string }[]).map(
        (skill) => skill.name,
      );
      expect(names).toEqual(['TypeScript', 'Node.js']);
      expect(names).not.toContain('Figma');
    });

    it('answers unknown or deactivated categories with 404', async () => {
      const fixture = await seedTaxonomy();
      const unknown = await inject(
        'GET',
        '/categories/00000000-0000-4000-8000-000000000000',
      );
      expect(unknown.statusCode).toBe(404);
      expect(unknown.json().error.code).toBe('not_found');

      const deactivated = await database.db
        .insert(categories)
        .values({
          slug: `retired-${Date.now()}`,
          name: 'Retired',
          position: 99,
          isActive: false,
        })
        .returning();
      const retired = await inject('GET', `/categories/${deactivated[0]?.id}`);
      expect(retired.statusCode).toBe(404);

      const unusedCategory = fixture.categoryIds[1];
      const empty = await inject('GET', `/categories/${unusedCategory}`);
      expect(empty.statusCode).toBe(200);
    });

    it('rejects malformed taxonomy identifiers', async () => {
      const category = await inject('GET', '/categories/not-a-uuid');
      expect(category.statusCode).toBe(422);
      expect(category.json().error.code).toBe('validation_failed');

      const skillsResponse = await inject(
        'GET',
        '/skills?categoryId=not-a-uuid',
      );
      expect(skillsResponse.statusCode).toBe(422);
    });
  });

  describe('own profile', () => {
    it('requires authentication for every /profiles/me route', async () => {
      for (const [method, url] of [
        ['GET', '/profiles/me'],
        ['PATCH', '/profiles/me'],
        ['GET', '/profiles/me/skills'],
        ['PUT', '/profiles/me/skills'],
        ['GET', '/profiles/me/languages'],
        ['PUT', '/profiles/me/languages'],
      ] as const) {
        const response = await inject(method, url, {
          payload: { freelancer: freelancerCreatePayload() },
        });
        expect(response.statusCode, `${method} ${url}`).toBe(401);
        expect(response.json().error.code).toBe('unauthorized');
      }
    });

    it('starts with no halves and creates both in one PATCH', async () => {
      const account = await signup();
      const empty = await inject('GET', '/profiles/me', {
        cookie: account.cookie,
      });
      expect(empty.statusCode).toBe(200);
      const emptyBody = empty.json();
      expect(emptyBody.user.id).toBe(account.userId);
      expect(emptyBody.freelancer).toBeNull();
      expect(emptyBody.client).toBeNull();

      const created = await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: {
          freelancer: freelancerCreatePayload(),
          client: { companyName: 'Acme Corp' },
        },
      });
      expect(created.statusCode).toBe(200);
      const body = created.json();

      expect(body.freelancer.headline).toBe('Senior engineer');
      expect(body.freelancer.timezone).toBe('Europe/Lisbon');
      expect(body.freelancer.availability).toBe('available');
      expect(body.freelancer.visibility).toBe('public');
      expect(body.freelancer.countryCode).toBeNull();
      expect(body.freelancer.hourlyRateMinor).toBeNull();
      expect(body.freelancer.currency).toBeNull();
      expect(body.freelancer.completedAt).toBeNull();
      expect(body.freelancer.skills).toEqual([]);
      expect(body.freelancer.languages).toEqual([]);
      expect(
        Object.keys(body.freelancer as Record<string, unknown>).sort(),
      ).toEqual([...FREELANCER_KEYS].sort());
      expect(
        new Date(body.freelancer.createdAt as string).getTime(),
      ).toBeLessThanOrEqual(Date.now());

      expect(body.client.companyName).toBe('Acme Corp');
      expect(body.client.about).toBeNull();
      expect(body.client.countryCode).toBeNull();
    });

    it('updates the freelance half without wiping untouched fields', async () => {
      const account = await signup();
      await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: {
          freelancer: {
            ...freelancerCreatePayload('First headline'),
            bio: 'Before',
            hourlyRateMinor: 5000,
            currency: 'USD',
            countryCode: 'pt',
            experienceLevel: 'senior',
          },
        },
      });

      const updated = await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: {
          freelancer: {
            headline: 'Updated headline',
            timezone: 'UTC',
            availability: 'limited',
          },
        },
      });
      expect(updated.statusCode).toBe(200);
      const freelancer = updated.json().freelancer;
      expect(freelancer.headline).toBe('Updated headline');
      expect(freelancer.timezone).toBe('UTC');
      expect(freelancer.availability).toBe('limited');
      expect(freelancer.bio).toBe('Before');
      expect(freelancer.hourlyRateMinor).toBe(5000);
      expect(freelancer.currency).toBe('USD');
      expect(freelancer.countryCode).toBe('PT');
      expect(freelancer.experienceLevel).toBe('senior');
      expect(freelancer.visibility).toBe('public');
    });

    it('clears nullable fields with an explicit null', async () => {
      const account = await signup();
      await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: {
          freelancer: {
            ...freelancerCreatePayload(),
            bio: 'Has a bio',
            hourlyRateMinor: 5000,
            currency: 'USD',
            countryCode: 'PT',
            experienceLevel: 'expert',
          },
        },
      });

      const cleared = await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: {
          freelancer: {
            ...freelancerCreatePayload(),
            bio: null,
            hourlyRateMinor: null,
            currency: null,
            countryCode: null,
            experienceLevel: null,
          },
        },
      });
      expect(cleared.statusCode).toBe(200);
      const freelancer = cleared.json().freelancer;
      expect(freelancer.bio).toBeNull();
      expect(freelancer.hourlyRateMinor).toBeNull();
      expect(freelancer.currency).toBeNull();
      expect(freelancer.countryCode).toBeNull();
      expect(freelancer.experienceLevel).toBeNull();
    });

    it('updates the client half independently', async () => {
      const account = await signup();
      await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: {
          freelancer: freelancerCreatePayload(),
          client: { companyName: 'Acme', websiteUrl: 'https://acme.example' },
        },
      });

      const updated = await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: { client: { companyName: 'Acme Renamed', countryCode: 'us' } },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().client.companyName).toBe('Acme Renamed');
      expect(updated.json().client.countryCode).toBe('US');
      expect(updated.json().client.about).toBeNull();
      expect(updated.json().client.websiteUrl).toBe('https://acme.example');
      expect(updated.json().freelancer.headline).toBe('Senior engineer');
    });

    it('rejects a rate or currency without its pair', async () => {
      const account = await signup();
      const bareRate = await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: {
          freelancer: { ...freelancerCreatePayload(), hourlyRateMinor: 5000 },
        },
      });
      expect(bareRate.statusCode).toBe(422);

      const bareCurrency = await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: {
          freelancer: { ...freelancerCreatePayload(), currency: 'USD' },
        },
      });
      expect(bareCurrency.statusCode).toBe(422);
    });

    it('rejects known-mass-assignment and account fields', async () => {
      const account = await signup();
      const sensitive = await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: {
          freelancer: freelancerCreatePayload(),
          userId: '00000000-0000-4000-8000-000000000000',
          roles: ['admin'],
          status: 'suspended',
          email: 'pwned@example.com',
        },
      });
      expect(sensitive.statusCode).toBe(422);
      expect(sensitive.json().error.code).toBe('validation_failed');

      const inSection = await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: {
          freelancer: {
            ...freelancerCreatePayload(),
            userId: '00000000-0000-4000-8000-000000000000',
            completedAt: '2030-01-01T00:00:00.000Z',
          },
        },
      });
      expect(inSection.statusCode).toBe(422);

      const unchanged = await inject('GET', '/profiles/me', {
        cookie: account.cookie,
      });
      expect(unchanged.json().freelancer).toBeNull();
    });

    it('rejects invalid locale and vocabulary values', async () => {
      const account = await signup();
      const freelancerSection = (overrides: Record<string, unknown>) => ({
        ...freelancerCreatePayload(),
        ...overrides,
      });
      const cases: Record<string, unknown>[] = [
        freelancerSection({ countryCode: 'zz' }),
        freelancerSection({ countryCode: 'USA' }),
        freelancerSection({ countryCode: 'UK' }),
        freelancerSection({ timezone: 'Not/AZone' }),
        freelancerSection({ currency: 'XXX' }),
        freelancerSection({ availability: 'busy' }),
        freelancerSection({ experienceLevel: 'grandmaster' }),
        freelancerSection({ visibility: 'hidden' }),
        freelancerSection({ hourlyRateMinor: -1 }),
      ];

      for (const [index, section] of cases.entries()) {
        const response = await inject('PATCH', '/profiles/me', {
          cookie: account.cookie,
          payload: { freelancer: section },
        });
        expect(response.statusCode, `case ${index}`).toBe(422);
        expect(response.json().error.code).toBe('validation_failed');
      }
    });

    it('accepts UTC and two-letter country codes (normalised)', async () => {
      const account = await signup();
      const response = await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: {
          freelancer: {
            ...freelancerCreatePayload(),
            timezone: 'UTC',
            countryCode: 'pt',
          },
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().freelancer.timezone).toBe('UTC');
      expect(response.json().freelancer.countryCode).toBe('PT');
    });

    it('leaves foreign user payloads unreachable and scoped to the owner', async () => {
      const alice = await signup();
      await inject('PATCH', '/profiles/me', {
        cookie: alice.cookie,
        payload: { freelancer: freelancerCreatePayload('Alice profile') },
      });

      const bob = await signup();
      const bobView = await inject('GET', '/profiles/me', {
        cookie: bob.cookie,
      });
      expect(bobView.json().freelancer).toBeNull();

      await inject('PATCH', '/profiles/me', {
        cookie: bob.cookie,
        payload: { freelancer: freelancerCreatePayload('Bob profile') },
      });

      const aliceStays = await inject('GET', '/profiles/me', {
        cookie: alice.cookie,
      });
      expect(aliceStays.json().freelancer.headline).toBe('Alice profile');
    });

    it('forbids suspended and closed accounts from own-profile routes', async () => {
      for (const status of ['suspended', 'closed'] as const) {
        const account = await signup();
        await database.db
          .update(users)
          .set({ status })
          .where(eq(users.id, account.userId));

        const me = await inject('GET', '/profiles/me', {
          cookie: account.cookie,
        });
        expect(me.statusCode, status).toBe(403);
        expect(me.json().error.code).toBe('forbidden');
      }
    });
  });

  describe('skills', () => {
    it('returns an empty list before a freelancer profile exists', async () => {
      const account = await signup();
      const response = await inject('GET', '/profiles/me/skills', {
        cookie: account.cookie,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().items).toEqual([]);
    });

    it('replaces the whole skill set atomically', async () => {
      const account = await signup();
      await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: { freelancer: freelancerCreatePayload() },
      });
      const fixture = await seedTaxonomy();

      const first = await inject('PUT', '/profiles/me/skills', {
        cookie: account.cookie,
        payload: {
          skills: [
            {
              skillId: fixture.skillIds[0] as string,
              proficiency: 'advanced',
              yearsExperience: 6,
              isFeatured: true,
            },
          ],
        },
      });
      expect(first.statusCode).toBe(200);
      const firstItems = first.json().items as {
        skill: { name: string };
        proficiency: string;
        yearsExperience: number;
        isFeatured: boolean;
      }[];
      expect(firstItems).toHaveLength(1);
      expect(firstItems[0]?.skill.name).toBe('TypeScript');
      expect(firstItems[0]?.proficiency).toBe('advanced');
      expect(firstItems[0]?.yearsExperience).toBe(6);
      expect(firstItems[0]?.isFeatured).toBe(true);

      const replaced = await inject('PUT', '/profiles/me/skills', {
        cookie: account.cookie,
        payload: {
          skills: [
            {
              skillId: fixture.skillIds[1] as string,
              proficiency: 'expert',
              yearsExperience: null,
              isFeatured: false,
            },
            {
              skillId: fixture.skillIds[2] as string,
              proficiency: 'beginner',
              yearsExperience: 1,
              isFeatured: false,
            },
          ],
        },
      });
      expect(replaced.statusCode).toBe(200);
      expect(
        (replaced.json().items as { skill: { name: string } }[]).map(
          (item) => item.skill.name,
        ),
      ).toEqual(['Figma', 'Node.js']);

      const stored = await database.db.query.profileSkills.findMany({
        where: eq(profileSkills.freelancerId, account.userId),
      });
      expect(stored.map((row) => row.skillId).sort()).toEqual(
        [fixture.skillIds[1], fixture.skillIds[2]].sort(),
      );
    });

    it('clears every skill with an empty replacement', async () => {
      const account = await signup();
      await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: { freelancer: freelancerCreatePayload() },
      });
      const fixture = await seedTaxonomy();
      await inject('PUT', '/profiles/me/skills', {
        cookie: account.cookie,
        payload: {
          skills: [
            {
              skillId: fixture.skillIds[0] as string,
              proficiency: 'advanced',
              yearsExperience: null,
              isFeatured: false,
            },
          ],
        },
      });

      const cleared = await inject('PUT', '/profiles/me/skills', {
        cookie: account.cookie,
        payload: { skills: [] },
      });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().items).toEqual([]);

      const stored = await database.db.query.profileSkills.findMany({
        where: eq(profileSkills.freelancerId, account.userId),
      });
      expect(stored).toEqual([]);
    });

    it('rejects duplicate skill ids before writing', async () => {
      const account = await signup();
      await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: { freelancer: freelancerCreatePayload() },
      });
      const fixture = await seedTaxonomy();

      const response = await inject('PUT', '/profiles/me/skills', {
        cookie: account.cookie,
        payload: {
          skills: [
            {
              skillId: fixture.skillIds[0] as string,
              proficiency: 'advanced',
              yearsExperience: null,
              isFeatured: false,
            },
            {
              skillId: fixture.skillIds[0] as string,
              proficiency: 'beginner',
              yearsExperience: null,
              isFeatured: false,
            },
          ],
        },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('validation_failed');
    });

    it('rejects unknown or deactivated skill ids and invalid levels', async () => {
      const account = await signup();
      await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: { freelancer: freelancerCreatePayload() },
      });
      const fixture = await seedTaxonomy();
      const deactivated = await database.db
        .insert(skills)
        .values({
          slug: `legacy-${Date.now()}`,
          name: 'Legacy skill',
          categoryId: fixture.categoryIds[0] ?? null,
          position: 99,
          isActive: false,
        })
        .returning();

      const unknown = await inject('PUT', '/profiles/me/skills', {
        cookie: account.cookie,
        payload: {
          skills: [
            {
              skillId: '00000000-0000-4000-8000-000000000000',
              proficiency: 'advanced',
              yearsExperience: null,
              isFeatured: false,
            },
          ],
        },
      });
      expect(unknown.statusCode).toBe(422);
      expect(unknown.json().error.details).toBeDefined();

      const inactive = await inject('PUT', '/profiles/me/skills', {
        cookie: account.cookie,
        payload: {
          skills: [
            {
              skillId: deactivated[0]?.id as string,
              proficiency: 'advanced',
              yearsExperience: null,
              isFeatured: false,
            },
          ],
        },
      });
      expect(inactive.statusCode).toBe(422);

      const badLevel = await inject('PUT', '/profiles/me/skills', {
        cookie: account.cookie,
        payload: {
          skills: [
            {
              skillId: fixture.skillIds[0] as string,
              proficiency: 'legendary',
              yearsExperience: null,
              isFeatured: false,
            },
          ],
        },
      });
      expect(badLevel.statusCode).toBe(422);

      const badYears = await inject('PUT', '/profiles/me/skills', {
        cookie: account.cookie,
        payload: {
          skills: [
            {
              skillId: fixture.skillIds[0] as string,
              proficiency: 'advanced',
              yearsExperience: 61,
              isFeatured: false,
            },
          ],
        },
      });
      expect(badYears.statusCode).toBe(422);
    });

    it('requires a freelancer profile before replacing skills', async () => {
      const account = await signup();
      const fixture = await seedTaxonomy();
      const response = await inject('PUT', '/profiles/me/skills', {
        cookie: account.cookie,
        payload: {
          skills: [
            {
              skillId: fixture.skillIds[0] as string,
              proficiency: 'advanced',
              yearsExperience: null,
              isFeatured: false,
            },
          ],
        },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('not_found');
    });
  });

  describe('languages', () => {
    it('replaces the language set and normalises codes', async () => {
      const account = await signup();
      await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: { freelancer: freelancerCreatePayload() },
      });

      const response = await inject('PUT', '/profiles/me/languages', {
        cookie: account.cookie,
        payload: {
          languages: [
            { languageCode: 'EN', proficiency: 'native' },
            { languageCode: 'pt', proficiency: 'fluent' },
            { languageCode: 'es', proficiency: 'basic' },
          ],
        },
      });
      expect(response.statusCode).toBe(200);
      const items = response.json().items as {
        languageCode: string;
        proficiency: string;
      }[];
      expect(items).toEqual([
        { languageCode: 'en', proficiency: 'native' },
        { languageCode: 'es', proficiency: 'basic' },
        { languageCode: 'pt', proficiency: 'fluent' },
      ]);

      const stored = await database.db.query.profileLanguages.findMany({
        where: eq(profileLanguages.freelancerId, account.userId),
      });
      expect(stored.map((row) => row.languageCode).sort()).toEqual([
        'en',
        'es',
        'pt',
      ]);
    });

    it('clears every language with an empty replacement', async () => {
      const account = await signup();
      await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: { freelancer: freelancerCreatePayload() },
      });
      await inject('PUT', '/profiles/me/languages', {
        cookie: account.cookie,
        payload: {
          languages: [{ languageCode: 'en', proficiency: 'native' }],
        },
      });

      const cleared = await inject('PUT', '/profiles/me/languages', {
        cookie: account.cookie,
        payload: { languages: [] },
      });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().items).toEqual([]);

      const stored = await database.db.query.profileLanguages.findMany({
        where: eq(profileLanguages.freelancerId, account.userId),
      });
      expect(stored).toEqual([]);
    });

    it('rejects duplicates after normalisation', async () => {
      const account = await signup();
      await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: { freelancer: freelancerCreatePayload() },
      });

      const response = await inject('PUT', '/profiles/me/languages', {
        cookie: account.cookie,
        payload: {
          languages: [
            { languageCode: 'en', proficiency: 'native' },
            { languageCode: 'EN', proficiency: 'fluent' },
          ],
        },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('validation_failed');
    });

    it('rejects codes that are not ISO 639-1 and bad proficiencies', async () => {
      const account = await signup();
      await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: { freelancer: freelancerCreatePayload() },
      });

      const fake = await inject('PUT', '/profiles/me/languages', {
        cookie: account.cookie,
        payload: { languages: [{ languageCode: 'zz', proficiency: 'native' }] },
      });
      expect(fake.statusCode).toBe(422);

      const english = await inject('PUT', '/profiles/me/languages', {
        cookie: account.cookie,
        payload: {
          languages: [{ languageCode: 'en', proficiency: 'superstar' }],
        },
      });
      expect(english.statusCode).toBe(422);
    });
  });

  describe('public freelancer lookup', () => {
    it('returns a public, active profile with skills and languages', async () => {
      const account = await signup();
      await inject('PATCH', '/profiles/me', {
        cookie: account.cookie,
        payload: { freelancer: freelancerCreatePayload('Looking for work') },
      });
      const fixture = await seedTaxonomy();
      await inject('PUT', '/profiles/me/skills', {
        cookie: account.cookie,
        payload: {
          skills: [
            {
              skillId: fixture.skillIds[0] as string,
              proficiency: 'expert',
              yearsExperience: 8,
              isFeatured: true,
            },
          ],
        },
      });
      await inject('PUT', '/profiles/me/languages', {
        cookie: account.cookie,
        payload: { languages: [{ languageCode: 'en', proficiency: 'native' }] },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/profiles/${account.userId}`,
      });
      expect(response.statusCode).toBe(200);
      const { profile } = response.json();
      expect(profile.headline).toBe('Looking for work');
      expect(profile.skills).toHaveLength(1);
      expect(profile.skills[0].skill.name).toBe('TypeScript');
      expect(profile.languages).toEqual([
        { languageCode: 'en', proficiency: 'native' },
      ]);

      const serialized = JSON.stringify(profile).toLowerCase();
      expect(serialized).not.toContain('ada@example.com');
      expect(serialized).not.toContain('@example.com');
      for (const needle of ['token', 'secret', 'emailverified', 'deletedat']) {
        expect(serialized).not.toContain(needle);
      }
    });

    it('hides every non-public or non-active state behind a 404', async () => {
      const scenario = async (userId: string) => {
        const response = await app.inject({
          method: 'GET',
          url: `/profiles/${userId}`,
        });
        expect(response.statusCode).toBe(404);
        expect(response.json().error.code).toBe('not_found');
      };

      const privateProfile = await signup();
      await inject('PATCH', '/profiles/me', {
        cookie: privateProfile.cookie,
        payload: {
          freelancer: { ...freelancerCreatePayload(), visibility: 'private' },
        },
      });
      await scenario(privateProfile.userId);

      const suspended = await signup();
      await inject('PATCH', '/profiles/me', {
        cookie: suspended.cookie,
        payload: { freelancer: freelancerCreatePayload() },
      });
      await database.db
        .update(users)
        .set({ status: 'suspended' })
        .where(eq(users.id, suspended.userId));
      await scenario(suspended.userId);

      const closed = await signup();
      await inject('PATCH', '/profiles/me', {
        cookie: closed.cookie,
        payload: { freelancer: freelancerCreatePayload() },
      });
      await database.db
        .update(users)
        .set({ status: 'closed' })
        .where(eq(users.id, closed.userId));
      await scenario(closed.userId);

      await scenario('00000000-0000-4000-8000-000000000000');

      const malformed = await app.inject({
        method: 'GET',
        url: '/profiles/not-a-uuid',
      });
      expect(malformed.statusCode).toBe(422);
    });
  });

  it('exposes the profile and taxonomy contract in the OpenAPI document', async () => {
    const docs = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(docs.statusCode).toBe(200);
    const spec = docs.json();
    const paths = Object.keys(spec.paths as Record<string, unknown>);
    for (const expected of [
      '/profiles/me',
      '/profiles/me/skills',
      '/profiles/me/languages',
      '/profiles/{userId}',
      '/categories',
      '/categories/{id}',
      '/skills',
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

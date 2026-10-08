import {
  JOB_STATUS_TRANSITIONS,
  buildMeta,
  canTransition,
  createJobRequestSchema,
  errorResponseSchema,
  jobListResponseSchema,
  jobResponseSchema,
  listJobsQuerySchema,
  myJobsQuerySchema,
  updateJobRequestSchema,
  updateJobStatusRequestSchema,
  type AuthSessionResponse,
  type Job,
  type JobSkillView,
  type UpdateJobRequest,
} from '@wervi/shared';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors.js';
import {
  DrizzleJobsRepository,
  DrizzleProfilesRepository,
  type JobRecord,
  type JobUpdate,
  type JobsRepository,
  type ProfilesRepository,
} from '../repositories/index.js';

const errorResponses = {
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
  422: errorResponseSchema,
} as const;

/**
 * Job listings: creation, editing, the lifecycle and the public browse.
 *
 * Ownership always comes from the session — no contract here carries a
 * `clientId` — and a strict body means ids, `proposalCount` and `status`
 * (outside the dedicated status endpoint) can never be mass-assigned. Reads
 * split the world in two: an owner sees their own listings including drafts,
 * everyone else only ever sees `published` + `public` rows, and any other job
 * answers 404 so invite-only work cannot be probed.
 */
export const jobRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const repository = new DrizzleJobsRepository(fastify.db);
  // Active-only category/skill lookups live on the profiles repository, the
  // same place taxonomy routes read their vocabulary from.
  const taxonomy = new DrizzleProfilesRepository(fastify.db);

  /**
   * The current session when the visitor has one, `null` otherwise. Used only
   * by the public detail read, where an owner may still open their own draft
   * while an anonymous visitor sees the same rules as any stranger. Only "not
   * signed in" degrades to anonymous; a suspended account still gets 403.
   */
  const optionalAuth = async (
    request: FastifyRequest,
  ): Promise<AuthSessionResponse | null> => {
    try {
      return await fastify.requireAuth(request);
    } catch (error) {
      if (error instanceof AppError && error.code === 'unauthorized') {
        return null;
      }
      throw error;
    }
  };

  fastify.post(
    '/jobs',
    {
      schema: {
        tags: ['jobs'],
        summary: 'Create a job',
        description:
          'Creates a job owned by the signed-in client. `status` defaults to ' +
          '`draft`, so a new listing stays private until an explicit status ' +
          'change publishes it. The category and every skill must be active; ' +
          'unknown or deactivated ids are rejected before anything is written.',
        body: createJobRequestSchema,
        response: { 201: jobResponseSchema, ...errorResponses },
      },
      preValidation: fastify.requireRoles(['client']),
    },
    async (request, reply) => {
      const body = request.body;
      await assertActiveCategory(taxonomy, body.categoryId);
      await assertActiveSkills(
        taxonomy,
        body.skills.map((skill) => skill.skillId),
      );

      const job = await repository.create(request.authData.user.id, {
        title: body.title,
        description: body.description,
        categoryId: body.categoryId,
        budgetModel: body.budgetModel,
        budgetMinMinor: body.budgetMinMinor ?? null,
        budgetMaxMinor: body.budgetMaxMinor ?? null,
        currency: body.currency,
        experienceLevel: body.experienceLevel,
        duration: body.duration ?? null,
        workMode: body.workMode,
        countryCode: body.countryCode ?? null,
        visibility: body.visibility,
        status: body.status,
      });
      await repository.replaceSkills(
        job.id,
        body.skills.map((skill) => ({
          skillId: skill.skillId,
          isRequired: skill.isRequired,
        })),
      );

      reply.code(201);
      return { job: await toJobView(repository, job) };
    },
  );

  fastify.get(
    '/jobs/me',
    {
      schema: {
        tags: ['jobs'],
        summary: 'List my jobs',
        description:
          'Returns the signed-in client’s own listings, newest first, ' +
          'including drafts. Filter by `status` to page through one state.',
        querystring: myJobsQuerySchema,
        response: { 200: jobListResponseSchema, ...errorResponses },
      },
      preValidation: fastify.requireRoles(['client']),
    },
    async (request) => {
      const query = request.query;
      const page = { page: query.page, pageSize: query.pageSize };
      const { items, total } = await repository.listForClient(
        request.authData.user.id,
        query.status,
        page,
      );
      return {
        items: await toJobViews(repository, items),
        meta: buildMeta(page, total),
      };
    },
  );

  fastify.get(
    '/jobs',
    {
      schema: {
        tags: ['jobs'],
        summary: 'Browse jobs',
        description:
          'The public listing: only `published` + `public` jobs, newest ' +
          'first. Free-text `q` matches title or description; `skills` is a ' +
          'comma-separated list and matches any of them. Budget filters are ' +
          'minor units and require `currency`.',
        querystring: listJobsQuerySchema,
        response: { 200: jobListResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const query = request.query;
      const page = { page: query.page, pageSize: query.pageSize };
      const { items, total } = await repository.listPublished(
        {
          q: query.q,
          categoryId: query.categoryId,
          skillIds: query.skills,
          experienceLevel: query.experienceLevel,
          budgetModel: query.budgetModel,
          currency: query.currency,
          workMode: query.workMode,
          minBudget: query.minBudget,
          maxBudget: query.maxBudget,
        },
        page,
      );
      return {
        items: await toJobViews(repository, items),
        meta: buildMeta(page, total),
      };
    },
  );

  fastify.get(
    '/jobs/:id',
    {
      schema: {
        tags: ['jobs'],
        summary: 'Get a job',
        description:
          'Returns one job with its category and skills. Owners can read ' +
          'their own listings in any state; everyone else only sees ' +
          '`published` + `public` jobs, and anything else is a 404 so ' +
          'private work cannot be probed.',
        params: z.object({ id: z.string().uuid() }),
        response: { 200: jobResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const record = await repository.findById(request.params.id);
      if (record === null) {
        throw new NotFoundError('Job');
      }

      const session = await optionalAuth(request);
      if (session === null || session.user.id !== record.clientId) {
        if (record.status !== 'published' || record.visibility !== 'public') {
          throw new NotFoundError('Job');
        }
      }

      return { job: await toJobView(repository, record) };
    },
  );

  fastify.patch(
    '/jobs/:id',
    {
      schema: {
        tags: ['jobs'],
        summary: 'Update a job',
        description:
          'Partial update of an editable job: present fields overwrite, ' +
          '`null` clears a nullable field, absent fields keep their value. ' +
          'Status is not accepted here — use the status endpoint. A ' +
          'closed job is final.',
        params: z.object({ id: z.string().uuid() }),
        body: updateJobRequestSchema,
        response: { 200: jobResponseSchema, ...errorResponses },
      },
      preValidation: fastify.requireRoles(['client']),
    },
    async (request) => {
      const record = await findOwnedJob(
        repository,
        request.params.id,
        request.authData.user.id,
      );
      if (record.status === 'closed') {
        throw new ConflictError('A closed job can no longer be changed');
      }

      const body = request.body;
      if (body.categoryId !== undefined) {
        await assertActiveCategory(taxonomy, body.categoryId);
      }
      if (body.skills !== undefined) {
        await assertActiveSkills(
          taxonomy,
          body.skills.map((skill) => skill.skillId),
        );
      }

      const updated = await repository.update(
        record.id,
        mergeJobSection(body, record),
      );
      if (body.skills !== undefined) {
        await repository.replaceSkills(
          record.id,
          body.skills.map((skill) => ({
            skillId: skill.skillId,
            isRequired: skill.isRequired,
          })),
        );
      }

      return { job: await toJobView(repository, updated) };
    },
  );

  fastify.put(
    '/jobs/:id/status',
    {
      schema: {
        tags: ['jobs'],
        summary: 'Change job status',
        description:
          'Moves a job through the lifecycle: `draft → published → paused → ' +
          'published`, and `→ closed` from any state. Closed is terminal. ' +
          'Setting the status a job already has is a no-op, and the write ' +
          'compares against the status it read so two concurrent requests ' +
          'cannot both win.',
        params: z.object({ id: z.string().uuid() }),
        body: updateJobStatusRequestSchema,
        response: { 200: jobResponseSchema, ...errorResponses },
      },
      preValidation: fastify.requireRoles(['client']),
    },
    async (request) => {
      const record = await findOwnedJob(
        repository,
        request.params.id,
        request.authData.user.id,
      );

      const next = request.body.status;
      if (next === record.status) {
        return { job: await toJobView(repository, record) };
      }
      if (!canTransition(JOB_STATUS_TRANSITIONS, record.status, next)) {
        throw new ConflictError(
          `A job cannot move from "${record.status}" to "${next}"`,
        );
      }

      const updated = await repository.setStatus(
        record.id,
        record.status,
        next,
        {
          ...(next === 'published' ? { publishedAt: new Date() } : {}),
          ...(next === 'closed' ? { closedAt: new Date() } : {}),
        },
      );
      if (updated === null) {
        throw new ConflictError(
          'The job status changed while this request was in flight',
        );
      }

      return { job: await toJobView(repository, updated) };
    },
  );
};

/**
 * Load a job for a write: 404 when it does not exist, and for someone else's
 * job 403 only when it is publicly visible (they can already see it) and 404
 * otherwise, so private listings stay unprobeable.
 */
async function findOwnedJob(
  repository: JobsRepository,
  id: string,
  userId: string,
): Promise<JobRecord> {
  const record = await repository.findById(id);
  if (record === null) {
    throw new NotFoundError('Job');
  }
  if (record.clientId !== userId) {
    if (record.status === 'published' && record.visibility === 'public') {
      throw new ForbiddenError(
        'Only the client who posted this job can change it',
      );
    }
    throw new NotFoundError('Job');
  }
  return record;
}

/** Reject an unknown or deactivated category before anything is written. */
async function assertActiveCategory(
  taxonomy: ProfilesRepository,
  categoryId: string,
): Promise<void> {
  const category = await taxonomy.getActiveCategoryById(categoryId);
  if (category === null) {
    throw new ValidationError('Unrecognised or deactivated category', [
      { path: 'categoryId', message: `Category ${categoryId} is not active` },
    ]);
  }
}

/** Reject unknown or deactivated skill ids before anything is written. */
async function assertActiveSkills(
  taxonomy: ProfilesRepository,
  skillIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(skillIds)];
  const found = await taxonomy.getActiveSkillsByIds(uniqueIds);
  if (found.length === uniqueIds.length) {
    return;
  }
  const activeIds = new Set(found.map((skill) => skill.id));
  throw new ValidationError(
    'Unrecognised or deactivated skill',
    uniqueIds
      .filter((id) => !activeIds.has(id))
      .map((id) => ({ path: 'skills', message: `Skill ${id} is not active` })),
  );
}

/**
 * A PATCH is an expressed replace of the editable state: present fields
 * overwrite, `null` clears a nullable column, absent fields keep the stored
 * value. Key presence (not `??`) decides the three cases, because `null` is a
 * legitimate "clear" value and must not fall through to the stored value —
 * the same rule the profile PATCH uses.
 */
function mergeJobSection(
  section: UpdateJobRequest,
  current: JobRecord,
): JobUpdate {
  const categoryId =
    section.categoryId === undefined ? current.categoryId : section.categoryId;
  if (categoryId === null) {
    throw new ValidationError('A job must be filed under a category');
  }

  const budgetMinMinor =
    'budgetMinMinor' in section
      ? (section.budgetMinMinor ?? null)
      : current.budgetMinMinor;
  const budgetMaxMinor =
    'budgetMaxMinor' in section
      ? (section.budgetMaxMinor ?? null)
      : current.budgetMaxMinor;
  if (
    budgetMinMinor !== null &&
    budgetMaxMinor !== null &&
    budgetMinMinor > budgetMaxMinor
  ) {
    throw new ValidationError('The minimum budget cannot exceed the maximum', [
      {
        path: 'budgetMinMinor',
        message: 'The minimum budget cannot exceed the maximum',
      },
    ]);
  }

  return {
    title: section.title ?? current.title,
    description: section.description ?? current.description,
    categoryId,
    budgetModel: section.budgetModel ?? current.budgetModel,
    budgetMinMinor,
    budgetMaxMinor,
    currency: section.currency ?? current.currency,
    experienceLevel: section.experienceLevel ?? current.experienceLevel,
    duration:
      'duration' in section ? (section.duration ?? null) : current.duration,
    workMode: section.workMode ?? current.workMode,
    countryCode:
      'countryCode' in section
        ? (section.countryCode ?? null)
        : current.countryCode,
    visibility: section.visibility ?? current.visibility,
  };
}

/** One job with its category and skill rows, ready for the response schema. */
async function toJobView(
  repository: JobsRepository,
  record: JobRecord,
): Promise<Job> {
  const [categoryRows, skillRows] = await Promise.all([
    record.categoryId === null
      ? Promise.resolve([])
      : repository.getCategoriesByIds([record.categoryId]),
    repository.getSkills([record.id]),
  ]);

  return {
    ...record,
    category: categoryRows[0] ?? null,
    skills: skillRows.map(({ skill, isRequired }) => ({ skill, isRequired })),
  };
}

/** Batched `toJobView`: one taxonomy read and one skill read per page. */
async function toJobViews(
  repository: JobsRepository,
  records: JobRecord[],
): Promise<Job[]> {
  const categoryIds = records
    .map((record) => record.categoryId)
    .filter((id): id is string => id !== null);
  const [categoryRows, skillRows] = await Promise.all([
    repository.getCategoriesByIds(categoryIds),
    repository.getSkills(records.map((record) => record.id)),
  ]);

  const categoriesById = new Map(
    categoryRows.map((category) => [category.id, category]),
  );
  const skillsByJob = new Map<string, JobSkillView[]>();
  for (const row of skillRows) {
    const list = skillsByJob.get(row.jobId) ?? [];
    list.push({ skill: row.skill, isRequired: row.isRequired });
    skillsByJob.set(row.jobId, list);
  }

  return records.map((record) => ({
    ...record,
    category:
      record.categoryId === null
        ? null
        : (categoriesById.get(record.categoryId) ?? null),
    skills: skillsByJob.get(record.id) ?? [],
  }));
}

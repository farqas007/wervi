import { z } from 'zod';
import {
  budgetModelSchema,
  contractDurationSchema,
  experienceLevelSchema,
  jobVisibilitySchema,
  workModeSchema,
} from '../constants/attributes.js';
import { jobStatusSchema } from '../constants/statuses.js';
import { isValidCountryCode } from '../utils/locale.js';
import { paginatedSchema, paginationQuerySchema } from './pagination.js';
import { currencySchema } from './money.js';
import { categorySchema, skillSchema } from './taxonomy.js';

/**
 * Job contracts on the wire.
 *
 * A job is a client-owned listing: every write here is keyed on the session,
 * which is why no schema in this file carries a `clientId`/`userId`/`ownerId`.
 * Statuses, visibilities, budget models, experience levels and currencies are
 * the shared vocabularies, so the database CHECK constraint, the request
 * validator and the TypeScript type always agree.
 *
 * Timestamps are ISO-8601 strings, matching what the API serialises, and
 * monetary bounds are integer minor units paired with `currency`.
 */

export const MAX_JOB_TITLE_LENGTH = 160;
export const MAX_JOB_DESCRIPTION_LENGTH = 20_000;
export const MAX_JOB_SKILLS = 30;
export const MAX_JOB_SEARCH_LENGTH = 200;
/** How many skill ids a single browse request may filter on. */
export const MAX_JOB_FILTER_SKILLS = 10;

/**
 * The statuses a job may be *created* with. `paused` and `closed` are only
 * reachable from an existing job, which is what makes the lifecycle a state
 * machine rather than a free choice.
 */
export const INITIAL_JOB_STATUSES = ['draft', 'published'] as const;
export const initialJobStatusSchema = z.enum(INITIAL_JOB_STATUSES);
export type InitialJobStatus = z.infer<typeof initialJobStatusSchema>;

/** Where the raw two-letter code is a display origin, it is upper-cased first. */
const normalizedCountryCode = z
  .string()
  .regex(/^[A-Za-z]{2}$/)
  .transform((value) => value.toUpperCase())
  .refine(isValidCountryCode);

/** One skill a job asks for, and whether the client treats it as essential. */
export const jobSkillInputSchema = z
  .object({
    skillId: z.string().uuid(),
    isRequired: z.boolean().default(false),
  })
  .strict();

export type JobSkillInput = z.infer<typeof jobSkillInputSchema>;

/** A skill attached to a job, with the taxonomy row it points at. */
export const jobSkillViewSchema = z
  .object({
    skill: skillSchema,
    isRequired: z.boolean(),
  })
  .strict();

export type JobSkillView = z.infer<typeof jobSkillViewSchema>;

/**
 * `POST /jobs` body.
 *
 * Strict, so `clientId`, `id`, `proposalCount`, `slug` and friends cannot be
 * mass-assigned; the owner always comes from the session. `skills` defaults to
 * an empty list, `visibility` to `public` and `status` to `draft` — a job only
 * becomes discoverable when someone asks for it to be published.
 */
export const createJobRequestSchema = z
  .object({
    title: z.string().trim().min(3).max(MAX_JOB_TITLE_LENGTH),
    description: z.string().trim().min(10).max(MAX_JOB_DESCRIPTION_LENGTH),
    categoryId: z.string().uuid(),
    skills: z.array(jobSkillInputSchema).max(MAX_JOB_SKILLS).default([]),
    budgetModel: budgetModelSchema,
    budgetMinMinor: z.number().int().min(0).nullable().optional(),
    budgetMaxMinor: z.number().int().min(0).nullable().optional(),
    currency: currencySchema,
    experienceLevel: experienceLevelSchema,
    duration: contractDurationSchema.nullable().optional(),
    workMode: workModeSchema,
    countryCode: normalizedCountryCode.nullable().optional(),
    visibility: jobVisibilitySchema.default('public'),
    status: initialJobStatusSchema.default('draft'),
  })
  .strict()
  .superRefine((value, ctx) => {
    budgetRangeIssues(value.budgetMinMinor, value.budgetMaxMinor, ctx);
    duplicateSkillIssues(value.skills, ctx);
  });

export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;

/**
 * `PATCH /jobs/:id` body. A partial replace: present fields overwrite, absent
 * fields keep their stored value, and an explicit `null` clears a nullable
 * column. Status is not here on purpose — a lifecycle move goes through
 * `PUT /jobs/:id/status` where the transition rules apply.
 */
export const updateJobRequestSchema = z
  .object({
    title: z.string().trim().min(3).max(MAX_JOB_TITLE_LENGTH).optional(),
    description: z
      .string()
      .trim()
      .min(10)
      .max(MAX_JOB_DESCRIPTION_LENGTH)
      .optional(),
    categoryId: z.string().uuid().optional(),
    skills: z.array(jobSkillInputSchema).max(MAX_JOB_SKILLS).optional(),
    budgetModel: budgetModelSchema.optional(),
    budgetMinMinor: z.number().int().min(0).nullable().optional(),
    budgetMaxMinor: z.number().int().min(0).nullable().optional(),
    currency: currencySchema.optional(),
    experienceLevel: experienceLevelSchema.optional(),
    duration: contractDurationSchema.nullable().optional(),
    workMode: workModeSchema.optional(),
    countryCode: normalizedCountryCode.nullable().optional(),
    visibility: jobVisibilitySchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Nothing to update' });
      return;
    }
    budgetRangeIssues(value.budgetMinMinor, value.budgetMaxMinor, ctx);
    if (value.skills !== undefined) {
      duplicateSkillIssues(value.skills, ctx);
    }
  });

export type UpdateJobRequest = z.infer<typeof updateJobRequestSchema>;

/**
 * `PUT /jobs/:id/status` body — the lifecycle action. Every job status is
 * accepted here so an illegal *move* (`draft` → `paused`) answers `409
 * conflict` from the transition map rather than a validation error that would
 * imply the value itself is malformed.
 */
export const updateJobStatusRequestSchema = z
  .object({ status: jobStatusSchema })
  .strict();

export type UpdateJobStatusRequest = z.infer<
  typeof updateJobStatusRequestSchema
>;

/** A job as served by every job read: the listing plus its taxonomy rows. */
export const jobSchema = z
  .object({
    id: z.string().uuid(),
    clientId: z.string().uuid(),
    slug: z.string().min(1),
    title: z.string(),
    description: z.string(),
    status: jobStatusSchema,
    visibility: jobVisibilitySchema,
    categoryId: z.string().uuid().nullable(),
    category: categorySchema.nullable(),
    skills: z.array(jobSkillViewSchema),
    budgetModel: budgetModelSchema,
    budgetMinMinor: z.number().int().min(0).nullable(),
    budgetMaxMinor: z.number().int().min(0).nullable(),
    currency: currencySchema,
    experienceLevel: experienceLevelSchema.nullable(),
    duration: contractDurationSchema.nullable(),
    workMode: workModeSchema,
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    proposalCount: z.number().int().min(0),
    publishedAt: z.iso.datetime().nullable(),
    closedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export type Job = z.infer<typeof jobSchema>;

/** `POST /jobs`, `GET /jobs/:id`, `PATCH /jobs/:id`, `PUT /jobs/:id/status`. */
export const jobResponseSchema = z.object({ job: jobSchema }).strict();

export type JobResponse = z.infer<typeof jobResponseSchema>;

/** `GET /jobs` and `GET /jobs/me`. */
export const jobListResponseSchema = paginatedSchema(jobSchema);

export type JobListResponse = z.infer<typeof jobListResponseSchema>;

/**
 * A comma-separated list of UUIDs, as a query string arrives it.
 *
 * Repeated keys would be ambiguous (a single value arrives as a string, not a
 * one-element array), so the contract is one `skills=id,id` parameter, split
 * and de-duplicated at the boundary.
 */
const csvUuidList = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .transform((value, ctx) => {
      const parts = [...new Set(value.split(',').map((part) => part.trim()))];
      const uuid = z.string().uuid();
      if (
        parts.length > max ||
        parts.some((part) => !uuid.safeParse(part).success)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `Expected 1 to ${max} comma-separated UUIDs`,
        });
        return z.NEVER;
      }
      return parts;
    });

/**
 * `GET /jobs` — the public browse contract.
 *
 * Only `published` + `public` rows are ever returned, so `status` and
 * `visibility` are deliberately absent: a caller cannot widen the listing.
 * Budget filters are minor units and require `currency`, because comparing
 * minor units across currencies would silently compare different amounts.
 */
export const listJobsQuerySchema = paginationQuerySchema
  .extend({
    q: z.string().trim().min(1).max(MAX_JOB_SEARCH_LENGTH).optional(),
    categoryId: z.string().uuid().optional(),
    skills: csvUuidList(MAX_JOB_FILTER_SKILLS).optional(),
    experienceLevel: experienceLevelSchema.optional(),
    budgetModel: budgetModelSchema.optional(),
    currency: currencySchema.optional(),
    workMode: workModeSchema.optional(),
    minBudget: z.coerce.number().int().min(0).optional(),
    maxBudget: z.coerce.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (value.minBudget !== undefined || value.maxBudget !== undefined) &&
      value.currency === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['minBudget'],
        message:
          'Budget filters require `currency` so minor units compare in one currency',
      });
    }
    if (
      value.minBudget !== undefined &&
      value.maxBudget !== undefined &&
      value.minBudget > value.maxBudget
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['minBudget'],
        message: 'minBudget cannot exceed maxBudget',
      });
    }
  });

export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;

/** `GET /jobs/me` — an owner's own listings, optionally by status. */
export const myJobsQuerySchema = paginationQuerySchema
  .extend({ status: jobStatusSchema.optional() })
  .strict();

export type MyJobsQuery = z.infer<typeof myJobsQuerySchema>;

/** A budget range, checked once for both create and merged updates. */
function budgetRangeIssues(
  min: number | null | undefined,
  max: number | null | undefined,
  ctx: z.RefinementCtx,
): void {
  if (
    min !== undefined &&
    min !== null &&
    max !== undefined &&
    max !== null &&
    min > max
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['budgetMinMinor'],
      message: 'The minimum budget cannot exceed the maximum',
    });
  }
}

function duplicateSkillIssues(
  skills: readonly { skillId: string }[],
  ctx: z.RefinementCtx,
): void {
  const ids = skills.map((skill) => skill.skillId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['skills'],
      message: 'A skill may appear only once on a job',
    });
  }
}

import { randomBytes } from 'node:crypto';
import {
  type Database,
  type SQL,
  and,
  count,
  desc,
  eq,
  inArray,
  sql,
} from '@wervi/db';
import { type categories, type skills, jobSkills, jobs } from '@wervi/db';
import { type JobStatus, type PaginationQuery, toOffset } from '@wervi/shared';
import type { Category, Skill } from '@wervi/shared';
import type {
  JobListFilters,
  JobListPage,
  JobRecord,
  JobSkillRecord,
  JobSkillWrite,
  JobsRepository,
  JobUpdate,
  JobWrite,
} from './jobs.repository.js';

type JobRow = typeof jobs.$inferSelect;

/** How many random suffixes a colliding slug tries before giving up. */
const SLUG_ATTEMPTS = 5;
/** Characters kept from a title before the random suffix takes over. */
const SLUG_MAX_LENGTH = 80;

/**
 * Drizzle implementation of `JobsRepository`.
 *
 * Operators (`and`, `eq`, `count`, …) are imported from `@wervi/db`, the one
 * module that owns the pool, so every expression shares the Drizzle instance
 * the `Database` type was built from.
 *
 * The `updated_at` column is maintained by the database trigger and never by
 * this module. `setStatus` writes through a compare-and-set on the status
 * column, so a concurrent lifecycle request sees a `null` result instead of
 * silently overwriting the status it did not read.
 */
export class DrizzleJobsRepository implements JobsRepository {
  readonly #db: Database;

  constructor(database: Database) {
    this.#db = database;
  }

  async create(clientId: string, input: JobWrite): Promise<JobRecord> {
    const base = slugify(input.title);
    let lastConflict: unknown;

    // The slug is the public URL, so a title reused across clients must not
    // collide: retry with a random suffix only on a unique violation.
    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${randomSuffix()}`;
      try {
        const row = (
          await this.#db.db
            .insert(jobs)
            .values({
              clientId,
              slug,
              title: input.title,
              description: input.description,
              categoryId: input.categoryId,
              budgetModel: input.budgetModel,
              budgetMinMinor: input.budgetMinMinor,
              budgetMaxMinor: input.budgetMaxMinor,
              currency: input.currency,
              experienceLevel: input.experienceLevel,
              duration: input.duration,
              workMode: input.workMode,
              countryCode: input.countryCode,
              visibility: input.visibility,
              status: input.status,
              publishedAt: input.status === 'published' ? new Date() : null,
              closedAt: null,
            })
            .returning()
        )[0];

        if (row === undefined) {
          throw new Error('Failed to insert job');
        }
        return toJobRecord(row);
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
        lastConflict = error;
      }
    }

    throw new Error('Could not allocate a unique job slug', {
      cause: lastConflict,
    });
  }

  async findById(id: string): Promise<JobRecord | null> {
    const row = await this.#db.db.query.jobs.findFirst({
      where: (table, operators) => operators.eq(table.id, id),
    });
    return row === undefined ? null : toJobRecord(row);
  }

  async update(id: string, input: JobUpdate): Promise<JobRecord> {
    const row = (
      await this.#db.db
        .update(jobs)
        .set({ ...input })
        .where(eq(jobs.id, id))
        .returning()
    )[0];

    if (row === undefined) {
      throw new Error('Failed to update job');
    }
    return toJobRecord(row);
  }

  async setStatus(
    id: string,
    expected: JobStatus,
    next: JobStatus,
    timestamps: { publishedAt?: Date; closedAt?: Date },
  ): Promise<JobRecord | null> {
    const row = (
      await this.#db.db
        .update(jobs)
        .set({
          status: next,
          ...(timestamps.publishedAt === undefined
            ? {}
            : { publishedAt: timestamps.publishedAt }),
          ...(timestamps.closedAt === undefined
            ? {}
            : { closedAt: timestamps.closedAt }),
        })
        .where(and(eq(jobs.id, id), eq(jobs.status, expected)))
        .returning()
    )[0];

    return row === undefined ? null : toJobRecord(row);
  }

  async getSkills(jobIds: readonly string[]): Promise<JobSkillRecord[]> {
    const ids = [...new Set(jobIds)];
    if (ids.length === 0) {
      return [];
    }

    const links = await this.#db.db.query.jobSkills.findMany({
      where: (table, operators) => operators.inArray(table.jobId, ids),
    });
    if (links.length === 0) {
      return [];
    }

    const skillRows = await this.#db.db.query.skills.findMany({
      where: (table, operators) =>
        operators.inArray(
          table.id,
          links.map((link) => link.skillId),
        ),
    });
    const skillsById = new Map(skillRows.map((row) => [row.id, row]));

    const records: JobSkillRecord[] = [];
    for (const link of links) {
      const skill = skillsById.get(link.skillId);
      if (skill === undefined) {
        continue;
      }
      records.push({
        jobId: link.jobId,
        skill: toSkillRecord(skill),
        isRequired: link.isRequired,
      });
    }

    return records.sort(compareSkills);
  }

  async replaceSkills(jobId: string, items: JobSkillWrite[]): Promise<void> {
    await this.#db.db.transaction(async (tx) => {
      await tx.delete(jobSkills).where(sql`job_id = ${jobId}`);
      if (items.length > 0) {
        await tx.insert(jobSkills).values(
          items.map((item) => ({
            jobId,
            skillId: item.skillId,
            isRequired: item.isRequired,
          })),
        );
      }
    });
  }

  async getCategoriesByIds(ids: readonly string[]): Promise<Category[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return [];
    }
    const rows = await this.#db.db.query.categories.findMany({
      where: (table, operators) => operators.inArray(table.id, uniqueIds),
    });
    return rows.map(toCategoryRecord);
  }

  async listForClient(
    clientId: string,
    status: JobStatus | undefined,
    page: PaginationQuery,
  ): Promise<JobListPage> {
    const where = and(
      eq(jobs.clientId, clientId),
      status === undefined ? undefined : eq(jobs.status, status),
    );

    return this.runList(where, desc(jobs.createdAt), page);
  }

  async listPublished(
    filters: JobListFilters,
    page: PaginationQuery,
  ): Promise<JobListPage> {
    // The browse listing only ever surfaces public, live listings; every other
    // filter narrows that fixed base rather than widening it.
    const conditions = [
      eq(jobs.status, 'published'),
      eq(jobs.visibility, 'public'),
    ];

    if (filters.q !== undefined) {
      const pattern = `%${escapeLike(filters.q)}%`;
      conditions.push(
        sql`(${jobs.title} ilike ${pattern} or ${jobs.description} ilike ${pattern})`,
      );
    }
    if (filters.categoryId !== undefined) {
      conditions.push(eq(jobs.categoryId, filters.categoryId));
    }
    if (filters.experienceLevel !== undefined) {
      conditions.push(eq(jobs.experienceLevel, filters.experienceLevel));
    }
    if (filters.budgetModel !== undefined) {
      conditions.push(eq(jobs.budgetModel, filters.budgetModel));
    }
    if (filters.currency !== undefined) {
      conditions.push(eq(jobs.currency, filters.currency));
    }
    if (filters.workMode !== undefined) {
      conditions.push(eq(jobs.workMode, filters.workMode));
    }
    if (filters.minBudget !== undefined) {
      // A range matches if *either* bound clears the threshold: an open-ended
      // budget ($50–) is comparable at the same end it has a number for.
      conditions.push(
        sql`coalesce(${jobs.budgetMaxMinor}, ${jobs.budgetMinMinor}) >= ${filters.minBudget}`,
      );
    }
    if (filters.maxBudget !== undefined) {
      conditions.push(
        sql`coalesce(${jobs.budgetMinMinor}, ${jobs.budgetMaxMinor}) <= ${filters.maxBudget}`,
      );
    }
    if (filters.skillIds !== undefined && filters.skillIds.length > 0) {
      const matches = this.#db.db
        .select({ jobId: jobSkills.jobId })
        .from(jobSkills)
        .where(inArray(jobSkills.skillId, [...filters.skillIds]));
      conditions.push(inArray(jobs.id, matches));
    }

    return this.runList(and(...conditions), desc(jobs.publishedAt), page);
  }

  /** Shared listing body: one page of rows plus the total for the meta. */
  private async runList(
    where: SQL | undefined,
    order: SQL,
    page: PaginationQuery,
  ): Promise<JobListPage> {
    const [rows, totals] = await Promise.all([
      this.#db.db
        .select()
        .from(jobs)
        .where(where)
        .orderBy(order, desc(jobs.id))
        .limit(page.pageSize)
        .offset(toOffset(page)),
      this.#db.db.select({ value: count() }).from(jobs).where(where),
    ]);

    return {
      items: rows.map(toJobRecord),
      total: totals[0]?.value ?? 0,
    };
  }
}

/** Case-insensitive text search, with LIKE wildcards in `q` kept literal. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Title → URL path segment; short/empty titles fall back to a bare `job`. */
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');

  return base.length >= 3 ? base : 'job';
}

function randomSuffix(): string {
  return randomBytes(3).toString('hex');
}

/**
 * Drizzle wraps a driver failure in its own error, so the SQLSTATE only
 * appears on the original `PostgresError` somewhere down the `cause` chain.
 * Walking it keeps the slug retry keyed on the real constraint violation.
 */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current !== undefined && depth < 5; depth++) {
    if (
      typeof current === 'object' &&
      current !== null &&
      'code' in current &&
      (current as { code?: unknown }).code === '23505'
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function compareSkills(a: JobSkillRecord, b: JobSkillRecord): number {
  const position = a.skill.position - b.skill.position;
  if (position !== 0) {
    return position;
  }
  return a.skill.name.localeCompare(b.skill.name);
}

function toJobRecord(row: JobRow): JobRecord {
  return {
    id: row.id,
    clientId: row.clientId,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status: row.status,
    visibility: row.visibility,
    categoryId: row.categoryId,
    budgetModel: row.budgetModel,
    budgetMinMinor: row.budgetMinMinor,
    budgetMaxMinor: row.budgetMaxMinor,
    currency: row.currency as JobRecord['currency'],
    experienceLevel: row.experienceLevel,
    duration: row.duration,
    workMode: row.workMode,
    countryCode: row.countryCode,
    proposalCount: row.proposalCount,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toCategoryRecord(row: typeof categories.$inferSelect): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    parentId: row.parentId,
    position: row.position,
    isActive: row.isActive,
  };
}

function toSkillRecord(row: typeof skills.$inferSelect): Skill {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    categoryId: row.categoryId,
    position: row.position,
    isActive: row.isActive,
  };
}

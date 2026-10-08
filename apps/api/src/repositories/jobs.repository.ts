import type {
  BudgetModel,
  Category,
  ContractDuration,
  Currency,
  ExperienceLevel,
  InitialJobStatus,
  JobStatus,
  JobVisibility,
  PaginationQuery,
  Skill,
  WorkMode,
} from '@wervi/shared';

/**
 * Job storage records.
 *
 * Timestamps are ISO-8601 strings, not `Date`s: the routes return them straight
 * to a strict Zod response schema, which only accepts strings. Taxonomy rows
 * ride along with the job rather than being re-read by the route, because a
 * listing is served with its category and skills or not at all.
 */

export interface JobRecord {
  id: string;
  clientId: string;
  slug: string;
  title: string;
  description: string;
  status: JobStatus;
  visibility: JobVisibility;
  categoryId: string | null;
  budgetModel: BudgetModel;
  budgetMinMinor: number | null;
  budgetMaxMinor: number | null;
  currency: Currency;
  experienceLevel: ExperienceLevel | null;
  duration: ContractDuration | null;
  workMode: WorkMode;
  countryCode: string | null;
  proposalCount: number;
  publishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One skill attached to one job, with the taxonomy row it points at. */
export interface JobSkillRecord {
  jobId: string;
  skill: Skill;
  isRequired: boolean;
}

/**
 * The full job state a write stores. `categoryId` is a plain id here — the
 * route has already proved the row exists and is active, and the database
 * foreign key is the backstop.
 */
export interface JobWrite {
  title: string;
  description: string;
  categoryId: string;
  budgetModel: BudgetModel;
  budgetMinMinor: number | null;
  budgetMaxMinor: number | null;
  currency: Currency;
  experienceLevel: ExperienceLevel | null;
  duration: ContractDuration | null;
  workMode: WorkMode;
  countryCode: string | null;
  visibility: JobVisibility;
  status: InitialJobStatus;
}

/** Everything but the lifecycle fields: what `PATCH /jobs/:id` may change. */
export type JobUpdate = Omit<JobWrite, 'status'>;

/** One skill row offered when atomically replacing a job's skill list. */
export interface JobSkillWrite {
  skillId: string;
  isRequired: boolean;
}

/** Browse filters accepted by the public listing. All are optional. */
export interface JobListFilters {
  q?: string;
  categoryId?: string;
  skillIds?: readonly string[];
  experienceLevel?: ExperienceLevel;
  budgetModel?: BudgetModel;
  currency?: Currency;
  workMode?: WorkMode;
  minBudget?: number;
  maxBudget?: number;
}

export interface JobListPage {
  items: JobRecord[];
  total: number;
}

/**
 * The only way the service layer reaches job storage.
 *
 * Ownership is a parameter, never a column the caller supplies implicitly:
 * `create` takes the session's user id, and every other write is preceded by a
 * read the route has already checked for ownership.
 */
export interface JobsRepository {
  create(clientId: string, input: JobWrite): Promise<JobRecord>;
  findById(id: string): Promise<JobRecord | null>;
  update(id: string, input: JobUpdate): Promise<JobRecord>;
  /**
   * Compare-and-set on the status column: the row is only rewritten when it is
   * still in `expected`, so two concurrent lifecycle requests cannot both win.
   * Returns `null` when the status moved underneath the caller.
   */
  setStatus(
    id: string,
    expected: JobStatus,
    next: JobStatus,
    timestamps: { publishedAt?: Date; closedAt?: Date },
  ): Promise<JobRecord | null>;
  getSkills(jobIds: readonly string[]): Promise<JobSkillRecord[]>;
  replaceSkills(jobId: string, items: JobSkillWrite[]): Promise<void>;
  getCategoriesByIds(ids: readonly string[]): Promise<Category[]>;
  listForClient(
    clientId: string,
    status: JobStatus | undefined,
    page: PaginationQuery,
  ): Promise<JobListPage>;
  listPublished(
    filters: JobListFilters,
    page: PaginationQuery,
  ): Promise<JobListPage>;
}

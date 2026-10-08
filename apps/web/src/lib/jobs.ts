import {
  jobListResponseSchema,
  jobResponseSchema,
  type ContractDuration,
  type CreateJobRequest,
  type Currency,
  type ExperienceLevel,
  type Job,
  type JobListResponse,
  type JobResponse,
  type JobStatus,
  type JobVisibility,
  type WorkMode,
} from '@wervi/shared';
import { apiRequest } from './api';

/**
 * Job API wrappers.
 *
 * Server components must forward this request's cookies explicitly — Next's
 * patched fetch does not — while client components rely on
 * `credentials: 'include'`. Every call decodes the shared job contract, so a
 * shape drift between API and web fails loudly instead of rendering holes.
 */
export interface JobsApiOptions {
  headers?: Record<string, string>;
}

export async function fetchJobs(
  query: Record<string, string | number | undefined> = {},
  options: JobsApiOptions = {},
): Promise<JobListResponse> {
  return apiRequest('/jobs', jobListResponseSchema, {
    query,
    headers: options.headers,
  });
}

export async function fetchJob(
  id: string,
  options: JobsApiOptions = {},
): Promise<JobResponse> {
  return apiRequest(`/jobs/${encodeURIComponent(id)}`, jobResponseSchema, {
    headers: options.headers,
  });
}

export async function createJob(body: CreateJobRequest): Promise<JobResponse> {
  return apiRequest('/jobs', jobResponseSchema, {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

export async function changeJobStatus(
  id: string,
  status: JobStatus,
): Promise<JobResponse> {
  return apiRequest(
    `/jobs/${encodeURIComponent(id)}/status`,
    jobResponseSchema,
    {
      method: 'PUT',
      body: { status },
      credentials: 'include',
    },
  );
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  paused: 'Paused',
  closed: 'Closed',
};

export const JOB_VISIBILITY_LABELS: Record<JobVisibility, string> = {
  public: 'Public',
  invite_only: 'Invite only',
  private: 'Private',
};

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  entry: 'Entry',
  intermediate: 'Intermediate',
  expert: 'Expert',
  senior: 'Senior',
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
};

export const CONTRACT_DURATION_LABELS: Record<ContractDuration, string> = {
  less_than_30_days: 'Less than 30 days',
  one_to_three_months: '1–3 months',
  three_to_six_months: '3–6 months',
  six_to_nine_months: '6–9 months',
  over_nine_months: 'Over 9 months',
};

/** Money is stored in integer minor units and paired with `currency`. */
export function formatBudgetMinor(minor: number, currency: Currency): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(minor / 100);
}

/** A job's budget range, e.g. `$1,000 – $5,000/hr` or `from $50`. */
export function formatJobBudget(
  job: Pick<
    Job,
    'budgetModel' | 'budgetMinMinor' | 'budgetMaxMinor' | 'currency'
  >,
): string {
  const suffix = job.budgetModel === 'hourly' ? '/hr' : '';
  const min =
    job.budgetMinMinor === null
      ? null
      : formatBudgetMinor(job.budgetMinMinor, job.currency);
  const max =
    job.budgetMaxMinor === null
      ? null
      : formatBudgetMinor(job.budgetMaxMinor, job.currency);

  if (min !== null && max !== null) {
    const range = min === max ? min : `${min} – ${max}`;
    return `${range}${suffix}`;
  }
  if (min !== null) {
    return `from ${min}${suffix}`;
  }
  if (max !== null) {
    return `up to ${max}${suffix}`;
  }
  return job.budgetModel === 'hourly'
    ? 'Hourly, rate open'
    : 'Fixed price, rate open';
}

export function formatPostedAt(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

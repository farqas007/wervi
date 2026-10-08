import Link from 'next/link';
import type { Metadata } from 'next';
import {
  EXPERIENCE_LEVELS,
  WORK_MODES,
  type JobListResponse,
} from '@wervi/shared';
import JobCard from '@/components/jobs/job-card';
import { ApiError } from '@/lib/api';
import {
  EXPERIENCE_LEVEL_LABELS,
  WORK_MODE_LABELS,
  fetchJobs,
} from '@/lib/jobs';
import { fetchCategories } from '@/lib/profiles';
import { getServerSession } from '@/lib/server-auth';

export const metadata: Metadata = {
  title: 'Browse jobs',
  description: 'Published briefs from clients around the world.',
};

interface JobsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface BrowseFilters {
  q?: string;
  categoryId?: string;
  experienceLevel?: string;
  workMode?: string;
}

/**
 * Only whitelisted keys ever reach the API: the browse contract is strict, so
 * stray parameters (sorting, marketing tags) must not turn into a 422, and an
 * empty value means "no filter" rather than a failed coercion.
 */
function readFilters(
  params: Record<string, string | string[] | undefined>,
): BrowseFilters {
  const single = (key: string): string | undefined => {
    const value = params[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };
  return {
    q: single('q'),
    categoryId: single('categoryId'),
    experienceLevel: single('experienceLevel'),
    workMode: single('workMode'),
  };
}

function pageHref(target: number, filters: BrowseFilters): string {
  const search = new URLSearchParams();
  if (filters.q !== undefined) search.set('q', filters.q);
  if (filters.categoryId !== undefined)
    search.set('categoryId', filters.categoryId);
  if (filters.experienceLevel !== undefined) {
    search.set('experienceLevel', filters.experienceLevel);
  }
  if (filters.workMode !== undefined) search.set('workMode', filters.workMode);
  search.set('page', String(target));
  return `/jobs?${search.toString()}`;
}

const hasActiveFilters = (filters: BrowseFilters): boolean =>
  Object.values(filters).some((value) => value !== undefined);

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const params = await searchParams;
  const filters = readFilters(params);
  const pageParam = params['page'];
  const page =
    typeof pageParam === 'string' && pageParam.length > 0
      ? pageParam
      : undefined;

  const session = await getServerSession();
  const canPost = session?.user.roles.includes('client') ?? false;

  const [categories, [jobsResult, jobsFailure]] = await Promise.all([
    fetchCategories()
      .then((result) => result.items)
      // A failed taxonomy lookup only removes the category filter options.
      .catch(() => null),
    fetchJobs({
      ...filters,
      page,
      pageSize: 10,
    }).then(
      (result): [JobListResponse | null, string | null] => [result, null],
      (cause): [JobListResponse | null, string | null] => [
        null,
        cause instanceof ApiError
          ? cause.message
          : 'Jobs are unavailable right now.',
      ],
    ),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Browse jobs</h1>
          <p className="text-sm text-slate-600">
            Published briefs from clients worldwide.
          </p>
        </div>
        {canPost && (
          <Link
            href="/jobs/new"
            className="rounded-lg bg-brand-600 px-5 py-3 font-medium text-white transition hover:bg-brand-700"
          >
            Post a job
          </Link>
        )}
      </div>

      <form
        method="get"
        className="grid gap-4 rounded-lg border border-slate-200 p-4 md:grid-cols-4"
      >
        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="text-slate-600">Search</span>
          <input
            name="q"
            defaultValue={filters.q ?? ''}
            maxLength={200}
            placeholder="Title or description"
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Category</span>
          <select
            name="categoryId"
            defaultValue={filters.categoryId ?? ''}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="">All categories</option>
            {(categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Experience level</span>
          <select
            name="experienceLevel"
            defaultValue={filters.experienceLevel ?? ''}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="">Any level</option>
            {EXPERIENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {EXPERIENCE_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Work mode</span>
          <select
            name="workMode"
            defaultValue={filters.workMode ?? ''}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="">Any mode</option>
            {WORK_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {WORK_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-3 md:col-span-3">
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-4 py-2 font-medium text-white transition hover:bg-brand-700"
          >
            Apply filters
          </button>
          {hasActiveFilters(filters) && (
            <Link
              href="/jobs"
              className="text-sm text-slate-600 hover:text-brand-700"
            >
              Clear filters
            </Link>
          )}
        </div>
      </form>

      {jobsFailure !== null && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {jobsFailure}{' '}
          <Link href="/jobs" className="font-medium underline">
            Clear filters
          </Link>
        </div>
      )}

      {jobsResult !== null && jobsResult.items.length === 0 && (
        <p className="text-sm text-slate-600">
          No published jobs match these filters.
        </p>
      )}

      {jobsResult !== null && jobsResult.items.length > 0 && (
        <>
          <ul className="grid gap-4">
            {jobsResult.items.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </ul>
          {jobsResult.meta.totalPages > 1 && (
            <nav className="flex items-center justify-between text-sm">
              {jobsResult.meta.hasPreviousPage ? (
                <Link
                  href={pageHref(jobsResult.meta.page - 1, filters)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 transition hover:bg-slate-50"
                >
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-slate-500">
                Page {jobsResult.meta.page} of {jobsResult.meta.totalPages} ·{' '}
                {jobsResult.meta.total} job
                {jobsResult.meta.total === 1 ? '' : 's'}
              </span>
              {jobsResult.meta.hasNextPage ? (
                <Link
                  href={pageHref(jobsResult.meta.page + 1, filters)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 transition hover:bg-slate-50"
                >
                  Next →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}

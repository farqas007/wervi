import Link from 'next/link';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import type { Job } from '@wervi/shared';
import JobOwnerActions from '@/components/jobs/job-owner-actions';
import { ApiError } from '@/lib/api';
import {
  CONTRACT_DURATION_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  JOB_STATUS_LABELS,
  JOB_VISIBILITY_LABELS,
  WORK_MODE_LABELS,
  fetchJob,
  formatJobBudget,
  formatPostedAt,
} from '@/lib/jobs';
import { getServerSession } from '@/lib/server-auth';

interface JobDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * One lookup per request: `generateMetadata` and the page share the result,
 * and the cookie decides whether an owner resolves their own non-public job.
 */
const loadJob = cache(
  async (id: string, cookieHeader: string): Promise<Job> => {
    const { job } = await fetchJob(id, {
      headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
    });
    return job;
  },
);

/**
 * Detail is server-rendered with this request's cookies forwarded, so the
 * owner sees their own draft/paused listings while everyone else only ever
 * resolves published public jobs — the same rule the API enforces.
 */
export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { id } = await params;
  const cookieHeader = (await cookies()).toString();

  let job: Job;
  try {
    job = await loadJob(id, cookieHeader);
  } catch (cause) {
    // Malformed ids (422) and anything invisible to this viewer (404) are the
    // same experience for a visitor: no job.
    if (
      cause instanceof ApiError &&
      (cause.status === 404 || cause.status === 422)
    ) {
      notFound();
    }
    throw cause;
  }

  const session = await getServerSession();
  const isOwner = session?.user.id === job.clientId;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Link
        href="/jobs"
        className="text-sm text-slate-600 hover:text-brand-700"
      >
        ← All jobs
      </Link>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
          {JOB_STATUS_LABELS[job.status]}
        </span>
        {isOwner && (
          <span className="rounded bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
            {JOB_VISIBILITY_LABELS[job.visibility]}
          </span>
        )}
        <span className="text-slate-500">
          Posted {formatPostedAt(job.createdAt)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{job.title}</h1>
        <p className="text-sm text-slate-600">
          {job.category?.name ?? 'Uncategorized'}
          {' · '}
          {job.experienceLevel === null
            ? 'any level'
            : `${EXPERIENCE_LEVEL_LABELS[job.experienceLevel].toLowerCase()} level`}
          {' · '}
          {WORK_MODE_LABELS[job.workMode].toLowerCase()}
          {job.countryCode !== null && ` · ${job.countryCode}`}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 p-4 text-sm md:grid-cols-4">
        <div>
          <dt className="text-slate-500">Budget</dt>
          <dd className="font-medium">{formatJobBudget(job)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Duration</dt>
          <dd className="font-medium">
            {job.duration === null
              ? 'Not specified'
              : CONTRACT_DURATION_LABELS[job.duration]}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Proposals</dt>
          <dd className="font-medium">{job.proposalCount}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Reference</dt>
          <dd className="font-medium">{job.slug}</dd>
        </div>
      </dl>

      {job.skills.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Skills</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {job.skills.map(({ skill, isRequired }) => (
              <span
                key={skill.id}
                className="rounded bg-slate-100 px-2 py-1 text-slate-700"
              >
                {skill.name}
                {isRequired && (
                  <span className="text-brand-700"> · required</span>
                )}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">About this job</h2>
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {job.description}
        </p>
      </section>

      {isOwner && <JobOwnerActions jobId={job.id} status={job.status} />}
    </div>
  );
}

export async function generateMetadata({
  params,
}: JobDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const cookieHeader = (await cookies()).toString();
  try {
    const job = await loadJob(id, cookieHeader);
    return { title: job.title };
  } catch {
    return { title: 'Job' };
  }
}

import Link from 'next/link';
import type { Job } from '@wervi/shared';
import {
  EXPERIENCE_LEVEL_LABELS,
  WORK_MODE_LABELS,
  formatJobBudget,
} from '@/lib/jobs';

/**
 * One row in the public browse list. Everything a scanner needs — money,
 * level, mode, and the first skills — without opening the detail page.
 */
export default function JobCard({ job }: { job: Job }) {
  return (
    <li className="rounded-xl border border-slate-200 p-5 transition hover:border-brand-300">
      <Link href={`/jobs/${job.id}`} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="font-semibold">{job.title}</h2>
          <span className="whitespace-nowrap text-sm font-medium">
            {formatJobBudget(job)}
          </span>
        </div>
        <p className="line-clamp-2 text-sm text-slate-600">{job.description}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {job.category !== null && (
            <span className="rounded bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
              {job.category.name}
            </span>
          )}
          {job.skills.slice(0, 4).map(({ skill, isRequired }) => (
            <span
              key={skill.id}
              className="rounded bg-slate-100 px-2 py-0.5 text-slate-700"
            >
              {skill.name}
              {isRequired ? ' *' : ''}
            </span>
          ))}
          {job.skills.length > 4 && (
            <span className="text-slate-500">
              +{job.skills.length - 4} more
            </span>
          )}
          {job.experienceLevel !== null && (
            <span className="text-slate-500">
              {EXPERIENCE_LEVEL_LABELS[job.experienceLevel]}
            </span>
          )}
          <span className="text-slate-400">·</span>
          <span className="text-slate-500">
            {WORK_MODE_LABELS[job.workMode]}
          </span>
        </div>
      </Link>
    </li>
  );
}

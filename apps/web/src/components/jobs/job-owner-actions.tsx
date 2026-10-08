'use client';

import { JOB_STATUS_TRANSITIONS, type JobStatus } from '@wervi/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { changeJobStatus } from '@/lib/jobs';

/** Buttons label the *target* of a transition: published means "Publish". */
const TARGET_LABELS: Partial<Record<JobStatus, string>> = {
  published: 'Publish',
  paused: 'Pause',
  closed: 'Close job',
};

function actionClass(target: JobStatus): string {
  if (target === 'published') {
    return 'rounded-md bg-brand-600 px-4 py-2 font-medium text-white transition hover:bg-brand-700';
  }
  if (target === 'closed') {
    return 'rounded-md border border-red-300 px-4 py-2 font-medium text-red-700 transition hover:bg-red-50';
  }
  return 'rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50';
}

/**
 * The owner's lifecycle controls. The transition list comes from the shared
 * state machine, so the buttons can never offer a move the API would reject.
 */
export default function JobOwnerActions({
  jobId,
  status,
}: {
  jobId: string;
  status: JobStatus;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<JobStatus | null>(null);

  const nextStatuses = JOB_STATUS_TRANSITIONS[status];

  if (nextStatuses.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-600">
        This job is closed and can no longer be changed.
      </div>
    );
  }

  async function move(target: JobStatus): Promise<void> {
    setError(null);
    setPending(target);
    try {
      await changeJobStatus(jobId, target);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not update the job status.',
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
      <h2 className="text-sm font-semibold">Manage job</h2>
      <div className="flex flex-wrap gap-2">
        {nextStatuses.map((target) => (
          <button
            key={target}
            type="button"
            disabled={pending !== null}
            className={actionClass(target)}
            onClick={() => {
              void move(target);
            }}
          >
            {pending === target
              ? 'Working…'
              : (TARGET_LABELS[target] ?? target)}
          </button>
        ))}
      </div>
      {error !== null && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

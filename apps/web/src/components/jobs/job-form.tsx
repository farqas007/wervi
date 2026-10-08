'use client';

import {
  BUDGET_MODELS,
  CONTRACT_DURATIONS,
  COUNTRY_CODES,
  CURRENCIES,
  EXPERIENCE_LEVELS,
  JOB_VISIBILITIES,
  WORK_MODES,
  type BudgetModel,
  type Category,
  type ContractDuration,
  type CreateJobRequest,
  type Currency,
  type ExperienceLevel,
  type JobVisibility,
  type Skill,
  type WorkMode,
} from '@wervi/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import {
  CONTRACT_DURATION_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  JOB_VISIBILITY_LABELS,
  WORK_MODE_LABELS,
  createJob,
} from '@/lib/jobs';

const BUDGET_MODEL_LABELS: Record<BudgetModel, string> = {
  fixed: 'Fixed price',
  hourly: 'Hourly rate',
};

/**
 * The client-side draft. Money stays raw input text until submit so an empty
 * field means "not set" rather than a fabricated zero.
 */
interface JobDraft {
  title: string;
  description: string;
  categoryId: string;
  skillIds: string[];
  budgetModel: BudgetModel;
  budgetMinMinor: string;
  budgetMaxMinor: string;
  currency: Currency;
  experienceLevel: ExperienceLevel;
  duration: string;
  workMode: WorkMode;
  countryCode: string;
  visibility: JobVisibility;
  publishNow: boolean;
}

export interface JobFormProps {
  categories: Category[];
  skills: Skill[];
}

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const details = error.details
      ?.map((detail) => `${detail.path}: ${detail.message}`)
      .join('; ');
    return details ? `${error.message} (${details})` : error.message;
  }
  return fallback;
}

/** Skills grouped by category for the option picker, uncategorized last. */
function groupedSkills(
  allSkills: Skill[],
  categories: Category[],
): Array<{ label: string; skills: Skill[] }> {
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const buckets = new Map<string, { label: string; skills: Skill[] }>();
  const uncategorized = { label: 'Other', skills: [] as Skill[] };

  for (const skill of allSkills) {
    const category =
      skill.categoryId === null
        ? undefined
        : categoryById.get(skill.categoryId);
    if (category === undefined) {
      uncategorized.skills.push(skill);
      continue;
    }
    let bucket = buckets.get(category.id);
    if (bucket === undefined) {
      bucket = { label: category.name, skills: [] };
      buckets.set(category.id, bucket);
    }
    bucket.skills.push(skill);
  }

  const ordered = [...buckets.values()].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  if (uncategorized.skills.length > 0) {
    ordered.push(uncategorized);
  }
  return ordered;
}

/** Empty input means "not budgeted"; anything else must be whole minor units. */
function parseMinor(value: string): number | null | 'invalid' {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const amount = Number(trimmed);
  if (!Number.isInteger(amount) || amount < 0) {
    return 'invalid';
  }
  return amount;
}

export default function JobForm({ categories, skills }: JobFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<JobDraft>(() => ({
    title: '',
    description: '',
    categoryId: categories[0]?.id ?? '',
    skillIds: [],
    budgetModel: 'fixed',
    budgetMinMinor: '',
    budgetMaxMinor: '',
    currency: 'USD',
    experienceLevel: 'intermediate',
    duration: '',
    workMode: 'remote',
    countryCode: '',
    visibility: 'public',
    publishNow: false,
  }));
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof JobDraft>(
    key: K,
    value: JobDraft[K],
  ): void {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  async function submitJob(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const budgetMinMinor = parseMinor(draft.budgetMinMinor);
    const budgetMaxMinor = parseMinor(draft.budgetMaxMinor);
    if (budgetMinMinor === 'invalid' || budgetMaxMinor === 'invalid') {
      setError('Budget amounts must be whole numbers of minor units.');
      return;
    }

    const countryCode = draft.countryCode.trim().toUpperCase();
    if (countryCode !== '' && !/^[A-Z]{2}$/.test(countryCode)) {
      setError('Country code must be a two-letter code such as US.');
      return;
    }

    if (draft.categoryId === '') {
      setError('Choose a category for the job.');
      return;
    }

    const body: CreateJobRequest = {
      title: draft.title,
      description: draft.description,
      categoryId: draft.categoryId,
      skills: draft.skillIds.map((skillId) => ({
        skillId,
        isRequired: false,
      })),
      budgetModel: draft.budgetModel,
      budgetMinMinor,
      budgetMaxMinor,
      currency: draft.currency,
      experienceLevel: draft.experienceLevel,
      duration:
        draft.duration === '' ? null : (draft.duration as ContractDuration),
      workMode: draft.workMode,
      countryCode: countryCode === '' ? null : countryCode,
      visibility: draft.visibility,
      status: draft.publishNow ? 'published' : 'draft',
    };

    try {
      const created = await createJob(body);
      router.push(`/jobs/${created.job.id}`);
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Failed to post the job'));
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void submitJob(event);
      }}
      className="grid gap-6 rounded-lg border border-slate-200 p-6"
    >
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="text-slate-600">Title</span>
          <input
            required
            minLength={3}
            maxLength={160}
            className="rounded-md border border-slate-300 px-3 py-2"
            placeholder="e.g. Build a Next.js dashboard for a fintech startup"
            value={draft.title}
            onChange={(event) => setField('title', event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="text-slate-600">Description</span>
          <textarea
            required
            minLength={10}
            maxLength={20000}
            rows={8}
            className="rounded-md border border-slate-300 px-3 py-2"
            placeholder="Scope, deliverables, and what a great outcome looks like."
            value={draft.description}
            onChange={(event) => setField('description', event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Category</span>
          <select
            required
            className="rounded-md border border-slate-300 px-3 py-2"
            value={draft.categoryId}
            onChange={(event) => setField('categoryId', event.target.value)}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Experience level</span>
          <select
            className="rounded-md border border-slate-300 px-3 py-2"
            value={draft.experienceLevel}
            onChange={(event) =>
              setField('experienceLevel', event.target.value as ExperienceLevel)
            }
          >
            {EXPERIENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {EXPERIENCE_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="text-slate-600">
            Skills (hold Ctrl or Cmd to pick several)
          </span>
          <select
            multiple
            size={8}
            className="rounded-md border border-slate-300 px-3 py-2"
            value={draft.skillIds}
            onChange={(event) =>
              setField(
                'skillIds',
                [...event.target.selectedOptions].map((option) => option.value),
              )
            }
          >
            {groupedSkills(skills, categories).map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.skills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Budget model</span>
          <select
            className="rounded-md border border-slate-300 px-3 py-2"
            value={draft.budgetModel}
            onChange={(event) =>
              setField('budgetModel', event.target.value as BudgetModel)
            }
          >
            {BUDGET_MODELS.map((model) => (
              <option key={model} value={model}>
                {BUDGET_MODEL_LABELS[model]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Currency</span>
          <select
            className="rounded-md border border-slate-300 px-3 py-2"
            value={draft.currency}
            onChange={(event) =>
              setField('currency', event.target.value as Currency)
            }
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Minimum budget (minor units)</span>
          <input
            type="number"
            min={0}
            step={1}
            className="rounded-md border border-slate-300 px-3 py-2"
            placeholder="e.g. 100000"
            value={draft.budgetMinMinor}
            onChange={(event) => setField('budgetMinMinor', event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Maximum budget (minor units)</span>
          <input
            type="number"
            min={0}
            step={1}
            className="rounded-md border border-slate-300 px-3 py-2"
            placeholder="e.g. 500000"
            value={draft.budgetMaxMinor}
            onChange={(event) => setField('budgetMaxMinor', event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Duration</span>
          <select
            className="rounded-md border border-slate-300 px-3 py-2"
            value={draft.duration}
            onChange={(event) => setField('duration', event.target.value)}
          >
            <option value="">Not specified</option>
            {CONTRACT_DURATIONS.map((duration) => (
              <option key={duration} value={duration}>
                {CONTRACT_DURATION_LABELS[duration]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Work mode</span>
          <select
            className="rounded-md border border-slate-300 px-3 py-2"
            value={draft.workMode}
            onChange={(event) =>
              setField('workMode', event.target.value as WorkMode)
            }
          >
            {WORK_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {WORK_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Country code</span>
          <input
            list="job-country-codes"
            maxLength={2}
            placeholder="US"
            className="rounded-md border border-slate-300 px-3 py-2"
            value={draft.countryCode}
            onChange={(event) =>
              setField('countryCode', event.target.value.toUpperCase())
            }
          />
          <datalist id="job-country-codes">
            {COUNTRY_CODES.map((code) => (
              <option key={code} value={code} />
            ))}
          </datalist>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Visibility</span>
          <select
            className="rounded-md border border-slate-300 px-3 py-2"
            value={draft.visibility}
            onChange={(event) =>
              setField('visibility', event.target.value as JobVisibility)
            }
          >
            {JOB_VISIBILITIES.map((visibility) => (
              <option key={visibility} value={visibility}>
                {JOB_VISIBILITY_LABELS[visibility]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={draft.publishNow}
            onChange={(event) => setField('publishNow', event.target.checked)}
          />
          Publish immediately (otherwise save as a draft)
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2 font-medium text-white transition hover:bg-brand-700"
        >
          {draft.publishNow ? 'Publish job' : 'Save draft'}
        </button>
      </div>
    </form>
  );
}

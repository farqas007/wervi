'use client';

import {
  AVAILABILITY,
  COUNTRY_CODES,
  CURRENCIES,
  EXPERIENCE_LEVELS,
  LANGUAGE_CODES,
  LANGUAGE_PROFICIENCIES,
  PROFILE_VISIBILITIES,
  SKILL_PROFICIENCIES,
  type Availability,
  type Category,
  type ClientProfile,
  type Currency,
  type ExperienceLevel,
  type FreelancerProfileView,
  type LanguageProficiency,
  type ProfileLanguage,
  type ProfileSkill,
  type ProfileVisibility,
  type ReplaceLanguagesRequest,
  type ReplaceSkillsRequest,
  type Skill,
  type SkillProficiency,
  type UpdateProfileRequest,
} from '@wervi/shared';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import {
  replaceMyLanguages,
  replaceMySkills,
  updateMyProfile,
} from '@/lib/profiles';

const AVAILABILITY_LABELS: Record<Availability, string> = {
  available: 'Available',
  limited: 'Limited',
  unavailable: 'Unavailable',
};

const SKILL_PROFICIENCY_LABELS: Record<SkillProficiency, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};

const LANGUAGE_PROFICIENCY_LABELS: Record<LanguageProficiency, string> = {
  basic: 'Basic',
  conversational: 'Conversational',
  fluent: 'Fluent',
  native: 'Native',
};

const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  entry: 'Entry',
  intermediate: 'Intermediate',
  expert: 'Expert',
  senior: 'Senior',
};

const VISIBILITY_LABELS: Record<ProfileVisibility, string> = {
  public: 'Public',
  private: 'Private',
};

/**
 * The editable freelancer half. `undefined` means the field was not changed
 * and is not sent; `null` explicitly clears a nullable column; every present
 * value replaces the stored one, matching the PATCH contract.
 */
interface FreelancerDraft {
  headline?: string;
  bio?: string | null;
  hourlyRateMinor?: number | null;
  currency?: Currency | null;
  availability?: Availability;
  timezone?: string;
  countryCode?: string | null;
  experienceLevel?: ExperienceLevel | null;
  visibility?: ProfileVisibility;
}

interface ClientDraft {
  companyName?: string;
  about?: string | null;
  websiteUrl?: string | null;
  countryCode?: string | null;
}

export interface ProfileFormProps {
  initialProfile: {
    freelancer?: FreelancerProfileView | null;
    client?: ClientProfile | null;
  };
  initialSkills: ProfileSkill[];
  initialLanguages: ProfileLanguage[];
  categories: Category[];
  allSkills: Skill[];
}

function toFreelancerDraft(
  view: FreelancerProfileView | null | undefined,
): FreelancerDraft {
  if (view === null || view === undefined) {
    return {};
  }
  return {
    headline: view.headline,
    bio: view.bio,
    hourlyRateMinor: view.hourlyRateMinor,
    currency: view.currency,
    availability: view.availability,
    timezone: view.timezone,
    countryCode: view.countryCode,
    experienceLevel: view.experienceLevel,
    visibility: view.visibility,
  };
}

function toClientDraft(view: ClientProfile | null | undefined): ClientDraft {
  if (view === null || view === undefined) {
    return {};
  }
  return {
    companyName: view.companyName,
    about: view.about,
    websiteUrl: view.websiteUrl,
    countryCode: view.countryCode,
  };
}

function hasChanges(draft: object): boolean {
  return Object.values(draft).some((value) => value !== undefined);
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

export default function ProfileForm({
  initialProfile,
  initialSkills,
  initialLanguages,
  categories,
  allSkills,
}: ProfileFormProps) {
  const [freelancer, setFreelancer] = useState<FreelancerDraft>(() =>
    toFreelancerDraft(initialProfile.freelancer),
  );
  const [client, setClient] = useState<ClientDraft>(() =>
    toClientDraft(initialProfile.client),
  );
  const [skills, setSkills] = useState<ProfileSkill[]>(initialSkills);
  const [languages, setLanguages] =
    useState<ProfileLanguage[]>(initialLanguages);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const hasFreelancerProfile = initialProfile.freelancer !== null;

  function setFreelancerField<K extends keyof FreelancerDraft>(
    key: K,
    value: FreelancerDraft[K],
  ): void {
    setFreelancer((previous) => ({ ...previous, [key]: value }));
  }

  function setClientField<K extends keyof ClientDraft>(
    key: K,
    value: ClientDraft[K],
  ): void {
    setClient((previous) => ({ ...previous, [key]: value }));
  }

  /** Empty input clears a nullable column instead of storing an empty string. */
  function nullableText(value: string): string | null {
    return value.trim() === '' ? null : value;
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const body: UpdateProfileRequest = {};
    if (hasChanges(freelancer)) {
      body.freelancer = {
        headline: freelancer.headline,
        bio: freelancer.bio,
        hourlyRateMinor: freelancer.hourlyRateMinor,
        currency: freelancer.currency,
        availability: freelancer.availability,
        timezone: freelancer.timezone,
        countryCode: freelancer.countryCode,
        experienceLevel: freelancer.experienceLevel,
        visibility: freelancer.visibility,
      };
    }
    if (hasChanges(client)) {
      body.client = {
        companyName: client.companyName,
        about: client.about,
        websiteUrl: client.websiteUrl,
        countryCode: client.countryCode,
      };
    }

    try {
      const updated = await updateMyProfile(body);
      setFreelancer(toFreelancerDraft(updated.freelancer));
      setClient(toClientDraft(updated.client));
      setSuccess('Profile saved');
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Failed to save profile'));
    }
  }

  async function saveSkills(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const request: ReplaceSkillsRequest = { skills };
      const updated = await replaceMySkills(request);
      setSkills(
        updated.items.map((item) => ({
          skillId: item.skill.id,
          proficiency: item.proficiency,
          yearsExperience: item.yearsExperience,
          isFeatured: item.isFeatured,
        })),
      );
      setSuccess('Skills saved');
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Failed to save skills'));
    }
  }

  async function saveLanguages(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const request: ReplaceLanguagesRequest = { languages };
      const updated = await replaceMyLanguages(request);
      setLanguages(updated.items);
      setSuccess('Languages saved');
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Failed to save languages'));
    }
  }

  function setSkill<K extends keyof ProfileSkill>(
    index: number,
    key: K,
    value: ProfileSkill[K],
  ): void {
    setSkills((current) =>
      current.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    );
  }

  function addLanguage(): void {
    setLanguages((current) => [
      ...current,
      { languageCode: 'en', proficiency: 'native' },
    ]);
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-primary/10 text-primary rounded-md p-3 text-sm">
          {success}
        </div>
      )}

      <form
        onSubmit={(event) => {
          void saveProfile(event);
        }}
        className="grid gap-6 rounded-lg border p-6"
      >
        <h2 className="text-xl font-semibold">Freelancer</h2>
        {!hasFreelancerProfile && (
          <p className="text-muted-foreground text-sm">
            No freelancer profile yet. Saving requires a headline and timezone.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Headline</span>
            <input
              className="rounded-md border px-3 py-2"
              value={freelancer.headline ?? ''}
              onChange={(event) =>
                setFreelancerField('headline', event.target.value)
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Timezone</span>
            <input
              className="rounded-md border px-3 py-2"
              placeholder="e.g. Europe/Lisbon"
              value={freelancer.timezone ?? ''}
              onChange={(event) =>
                setFreelancerField('timezone', event.target.value)
              }
            />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="text-muted-foreground">Bio</span>
            <textarea
              className="rounded-md border px-3 py-2"
              rows={4}
              value={freelancer.bio ?? ''}
              onChange={(event) =>
                setFreelancerField('bio', nullableText(event.target.value))
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">
              Hourly rate (minor units)
            </span>
            <input
              type="number"
              min={0}
              className="rounded-md border px-3 py-2"
              value={freelancer.hourlyRateMinor ?? ''}
              onChange={(event) => {
                const value = event.target.value.trim();
                setFreelancerField(
                  'hourlyRateMinor',
                  value === '' ? null : Number(value),
                );
              }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Currency</span>
            <select
              className="rounded-md border px-3 py-2"
              value={freelancer.currency ?? ''}
              onChange={(event) =>
                setFreelancerField(
                  'currency',
                  event.target.value === ''
                    ? null
                    : (event.target.value as Currency),
                )
              }
            >
              <option value="">Not set</option>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Availability</span>
            <select
              className="rounded-md border px-3 py-2"
              value={freelancer.availability ?? ''}
              onChange={(event) =>
                setFreelancerField(
                  'availability',
                  event.target.value === ''
                    ? undefined
                    : (event.target.value as Availability),
                )
              }
            >
              <option value="">Not set</option>
              {AVAILABILITY.map((option) => (
                <option key={option} value={option}>
                  {AVAILABILITY_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Country code</span>
            <input
              className="rounded-md border px-3 py-2"
              list="profile-country-codes"
              maxLength={2}
              placeholder="US"
              value={freelancer.countryCode ?? ''}
              onChange={(event) =>
                setFreelancerField(
                  'countryCode',
                  nullableText(event.target.value.toUpperCase()),
                )
              }
            />
            <datalist id="profile-country-codes">
              {COUNTRY_CODES.map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Experience level</span>
            <select
              className="rounded-md border px-3 py-2"
              value={freelancer.experienceLevel ?? ''}
              onChange={(event) =>
                setFreelancerField(
                  'experienceLevel',
                  event.target.value === ''
                    ? null
                    : (event.target.value as ExperienceLevel),
                )
              }
            >
              <option value="">Not set</option>
              {EXPERIENCE_LEVELS.map((option) => (
                <option key={option} value={option}>
                  {EXPERIENCE_LEVEL_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Visibility</span>
            <select
              className="rounded-md border px-3 py-2"
              value={freelancer.visibility ?? ''}
              onChange={(event) =>
                setFreelancerField(
                  'visibility',
                  event.target.value === ''
                    ? undefined
                    : (event.target.value as ProfileVisibility),
                )
              }
            >
              <option value="">Not set</option>
              {PROFILE_VISIBILITIES.map((option) => (
                <option key={option} value={option}>
                  {VISIBILITY_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
          >
            Save profile
          </button>
        </div>
      </form>

      <form
        onSubmit={(event) => {
          void saveSkills(event);
        }}
        className="grid gap-6 rounded-lg border p-6"
      >
        <h2 className="text-xl font-semibold">Skills</h2>
        {!hasFreelancerProfile && (
          <p className="text-muted-foreground text-sm">
            Create a freelancer profile before saving skills.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {skills.map((skill, index) => (
            <div
              key={skill.skillId}
              className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <select
                className="rounded-md border px-2 py-1"
                value={skill.skillId}
                onChange={(event) => {
                  const next = skills.map((item, i) =>
                    i === index
                      ? { ...item, skillId: event.target.value }
                      : item,
                  );
                  setSkills(next);
                }}
              >
                {groupedSkills(allSkills, categories).map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.skills.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                className="rounded-md border px-2 py-1"
                value={skill.proficiency}
                onChange={(event) =>
                  setSkill(
                    index,
                    'proficiency',
                    event.target.value as SkillProficiency,
                  )
                }
              >
                {SKILL_PROFICIENCIES.map((option) => (
                  <option key={option} value={option}>
                    {SKILL_PROFICIENCY_LABELS[option]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                max={60}
                className="w-20 rounded-md border px-2 py-1"
                value={skill.yearsExperience ?? ''}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  setSkill(
                    index,
                    'yearsExperience',
                    value === '' ? null : Number(value),
                  );
                }}
              />
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={skill.isFeatured}
                  onChange={(event) =>
                    setSkill(index, 'isFeatured', event.target.checked)
                  }
                />
                Featured
              </label>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() =>
                  setSkills((current) => current.filter((_, i) => i !== index))
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-2"
            onClick={() => {
              const first = allSkills[0];
              if (first !== undefined) {
                setSkills((current) => [
                  ...current,
                  {
                    skillId: first.id,
                    proficiency: 'intermediate',
                    yearsExperience: null,
                    isFeatured: false,
                  },
                ]);
              }
            }}
          >
            Add skill
          </button>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
          >
            Save skills
          </button>
        </div>
      </form>

      <form
        onSubmit={(event) => {
          void saveLanguages(event);
        }}
        className="grid gap-6 rounded-lg border p-6"
      >
        <h2 className="text-xl font-semibold">Languages</h2>
        {!hasFreelancerProfile && (
          <p className="text-muted-foreground text-sm">
            Create a freelancer profile before saving languages.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {languages.map((language, index) => (
            <div
              key={`${language.languageCode}-${index}`}
              className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <select
                className="rounded-md border px-2 py-1"
                value={language.languageCode}
                onChange={(event) => {
                  const next = languages.map((item, i) =>
                    i === index
                      ? { ...item, languageCode: event.target.value }
                      : item,
                  );
                  setLanguages(next);
                }}
              >
                {LANGUAGE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border px-2 py-1"
                value={language.proficiency}
                onChange={(event) => {
                  const next = languages.map((item, i) =>
                    i === index
                      ? {
                          ...item,
                          proficiency: event.target
                            .value as LanguageProficiency,
                        }
                      : item,
                  );
                  setLanguages(next);
                }}
              >
                {LANGUAGE_PROFICIENCIES.map((option) => (
                  <option key={option} value={option}>
                    {LANGUAGE_PROFICIENCY_LABELS[option]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() =>
                  setLanguages((current) =>
                    current.filter((_, i) => i !== index),
                  )
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-2"
            onClick={addLanguage}
          >
            Add language
          </button>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
          >
            Save languages
          </button>
        </div>
      </form>

      <form
        onSubmit={(event) => {
          void saveProfile(event);
        }}
        className="grid gap-6 rounded-lg border p-6"
      >
        <h2 className="text-xl font-semibold">Client</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Company name</span>
            <input
              className="rounded-md border px-3 py-2"
              value={client.companyName ?? ''}
              onChange={(event) =>
                setClientField('companyName', event.target.value)
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Website URL</span>
            <input
              className="rounded-md border px-3 py-2"
              value={client.websiteUrl ?? ''}
              onChange={(event) =>
                setClientField('websiteUrl', nullableText(event.target.value))
              }
            />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="text-muted-foreground">About</span>
            <textarea
              className="rounded-md border px-3 py-2"
              rows={4}
              value={client.about ?? ''}
              onChange={(event) =>
                setClientField('about', nullableText(event.target.value))
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Country code</span>
            <input
              className="rounded-md border px-3 py-2"
              list="client-country-codes"
              maxLength={2}
              placeholder="US"
              value={client.countryCode ?? ''}
              onChange={(event) =>
                setClientField(
                  'countryCode',
                  nullableText(event.target.value.toUpperCase()),
                )
              }
            />
            <datalist id="client-country-codes">
              {COUNTRY_CODES.map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
          >
            Save client
          </button>
        </div>
      </form>
    </div>
  );
}

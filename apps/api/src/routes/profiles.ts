import {
  errorResponseSchema,
  myProfileResponseSchema,
  profileLanguageListResponseSchema,
  profileSkillListResponseSchema,
  publicProfileResponseSchema,
  replaceLanguagesRequestSchema,
  replaceSkillsRequestSchema,
  updateProfileRequestSchema,
  type FreelancerProfileView,
  type ProfileLanguage,
  type ProfileSkillView,
  type UpdateProfileRequest,
} from '@wervi/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import {
  DrizzleProfilesRepository,
  DrizzleUsersRepository,
  type ClientProfileRecord,
  type ClientProfileWrite,
  type FreelancerProfileRecord,
  type FreelancerProfileWrite,
  type ProfileLanguageRecord,
  type ProfileSkillRecord,
  type ProfilesRepository,
} from '../repositories/index.js';

type FreelancerSection = NonNullable<UpdateProfileRequest['freelancer']>;
type ClientSection = NonNullable<UpdateProfileRequest['client']>;

const errorResponses = {
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  422: errorResponseSchema,
} as const;

const OWN_PROFILE_RESPONSE = {
  response: { 200: myProfileResponseSchema, ...errorResponses },
} as const;

/**
 * Own-account profile management plus a single public freelancer lookup.
 *
 * Ownership comes from the session, never from the body: `userId` is not part
 * of any contract here, and every write is keyed on
 * `request.authData.user.id`. The PATCH body is a strict schema with no
 * account-level fields (`roles`, `status`, `email`, …), so those can never be
 * mass-assigned into a write.
 */
export const profileRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const repository = new DrizzleProfilesRepository(fastify.db);
  const usersRepository = new DrizzleUsersRepository(fastify.db);

  fastify.get(
    '/profiles/me',
    {
      schema: {
        tags: ['profiles'],
        summary: 'Get my profile',
        description:
          'Returns the signed-in account with both profile halves. The ' +
          'freelancer half embeds the saved skills and languages.',
        ...OWN_PROFILE_RESPONSE,
      },
      preValidation: fastify.requireAuth,
    },
    async (request) => {
      const userId = request.authData.user.id;
      const client = await repository.getClientProfile(userId);
      const freelancer = await loadFreelancerView(repository, userId);
      return { user: request.authData.user, freelancer, client };
    },
  );

  fastify.patch(
    '/profiles/me',
    {
      schema: {
        tags: ['profiles'],
        summary: 'Update my profile',
        description:
          'Creates or updates the freelancer and/or client half in one ' +
          'request. A missing half is untouched; `null` clears a nullable ' +
          'field; `headline`/`timezone` are required the first time the ' +
          'freelancer half is created. Fields that belong to the account ' +
          '(roles, status, email, …) are not accepted here.',
        body: updateProfileRequestSchema,
        ...OWN_PROFILE_RESPONSE,
      },
      preValidation: fastify.requireAuth,
    },
    async (request) => {
      const userId = request.authData.user.id;
      const body = request.body;

      if (body.freelancer !== undefined) {
        const current = await repository.getFreelancerProfile(userId);
        await repository.upsertFreelancerProfile(
          userId,
          mergeFreelancerSection(body.freelancer, current),
        );
      }

      if (body.client !== undefined) {
        const current = await repository.getClientProfile(userId);
        await repository.upsertClientProfile(
          userId,
          mergeClientSection(body.client, current),
        );
      }

      const client = await repository.getClientProfile(userId);
      const freelancer = await loadFreelancerView(repository, userId);
      return { user: request.authData.user, freelancer, client };
    },
  );

  fastify.get(
    '/profiles/me/skills',
    {
      schema: {
        tags: ['profiles'],
        summary: 'List my skills',
        description:
          'Returns the saved skills with the taxonomy row for each. The ' +
          'list is empty when the account has no freelancer profile yet.',
        response: { 200: profileSkillListResponseSchema, ...errorResponses },
      },
      preValidation: fastify.requireAuth,
    },
    async (request) => {
      const userId = request.authData.user.id;
      const items =
        (await repository.getFreelancerProfile(userId)) === null
          ? []
          : await repository.getFreelancerSkills(userId);
      return { items };
    },
  );

  fastify.put(
    '/profiles/me/skills',
    {
      schema: {
        tags: ['profiles'],
        summary: 'Replace my skills',
        description:
          'Atomically replaces the whole skill set. Every `skillId` must ' +
          'name an active skill; duplicates and unknown ids are rejected ' +
          'before anything is written. An empty list clears the profile.',
        body: replaceSkillsRequestSchema,
        response: { 200: profileSkillListResponseSchema, ...errorResponses },
      },
      preValidation: fastify.requireAuth,
    },
    async (request) => {
      const userId = request.authData.user.id;
      if ((await repository.getFreelancerProfile(userId)) === null) {
        throw new NotFoundError('Freelancer profile');
      }

      const requested = request.body.skills;
      const found = await repository.getActiveSkillsByIds(
        requested.map((skill) => skill.skillId),
      );
      if (found.length !== requested.length) {
        const validIds = new Set(found.map((skill) => skill.id));
        const invalidIds = requested
          .map((skill) => skill.skillId)
          .filter((id) => !validIds.has(id));
        throw new ValidationError('Unrecognised or deactivated skill', [
          ...invalidIds.map((id) => ({
            path: 'skills',
            message: `Skill ${id} is not active`,
          })),
        ]);
      }

      await repository.replaceFreelancerSkills(
        userId,
        requested.map((skill) => ({
          skillId: skill.skillId,
          proficiency: skill.proficiency,
          yearsExperience: skill.yearsExperience,
          isFeatured: skill.isFeatured,
        })),
      );

      return { items: await repository.getFreelancerSkills(userId) };
    },
  );

  fastify.get(
    '/profiles/me/languages',
    {
      schema: {
        tags: ['profiles'],
        summary: 'List my languages',
        description:
          'Returns the languages the freelancer works in. The list is empty ' +
          'when the account has no freelancer profile yet.',
        response: { 200: profileLanguageListResponseSchema, ...errorResponses },
      },
      preValidation: fastify.requireAuth,
    },
    async (request) => {
      const userId = request.authData.user.id;
      const items =
        (await repository.getFreelancerProfile(userId)) === null
          ? []
          : await repository.getFreelancerLanguages(userId);
      return { items };
    },
  );

  fastify.put(
    '/profiles/me/languages',
    {
      schema: {
        tags: ['profiles'],
        summary: 'Replace my languages',
        description:
          'Atomically replaces the whole language set. Codes are ISO 639-1 ' +
          'and normalised to lowercase; duplicates are rejected. An empty ' +
          'list clears the profile. The freelancer profile must exist first.',
        body: replaceLanguagesRequestSchema,
        response: { 200: profileLanguageListResponseSchema, ...errorResponses },
      },
      preValidation: fastify.requireAuth,
    },
    async (request) => {
      const userId = request.authData.user.id;
      if ((await repository.getFreelancerProfile(userId)) === null) {
        throw new NotFoundError('Freelancer profile');
      }

      await repository.replaceFreelancerLanguages(
        userId,
        request.body.languages.map((language) => ({
          languageCode: language.languageCode,
          proficiency: language.proficiency,
        })),
      );

      return { items: await repository.getFreelancerLanguages(userId) };
    },
  );

  fastify.get(
    '/profiles/:userId',
    {
      schema: {
        tags: ['profiles'],
        summary: 'Get a public freelancer profile',
        description:
          'Returns a freelancer profile (with skills and languages) only ' +
          'when it is set to `public` and the owner account is active. Any ' +
          'other state, including a missing profile, answers 404 so private ' +
          'profiles cannot be fingerprinted.',
        params: z.object({ userId: z.string().uuid() }),
        response: { 200: publicProfileResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const profile = await repository.getFreelancerProfile(
        request.params.userId,
      );
      if (profile === null || profile.visibility !== 'public') {
        throw new NotFoundError('Profile');
      }

      const owner = await usersRepository.findById(request.params.userId);
      if (owner === null || owner.status !== 'active') {
        throw new NotFoundError('Profile');
      }

      const [skills, languages] = await Promise.all([
        repository.getFreelancerSkills(request.params.userId),
        repository.getFreelancerLanguages(request.params.userId),
      ]);

      return { profile: toFreelancerView(profile, skills, languages) };
    },
  );
};

/** Fetch the freelancer half with skills and languages, or `null`. */
async function loadFreelancerView(
  repository: ProfilesRepository,
  userId: string,
): Promise<FreelancerProfileView | null> {
  const profile = await repository.getFreelancerProfile(userId);
  if (profile === null) {
    return null;
  }
  const [skills, languages] = await Promise.all([
    repository.getFreelancerSkills(userId),
    repository.getFreelancerLanguages(userId),
  ]);
  return toFreelancerView(profile, skills, languages);
}

function toFreelancerView(
  profile: FreelancerProfileRecord,
  skills: ProfileSkillRecord[],
  languages: ProfileLanguageRecord[],
): FreelancerProfileView {
  return {
    userId: profile.userId,
    headline: profile.headline,
    bio: profile.bio,
    hourlyRateMinor: profile.hourlyRateMinor,
    currency: profile.currency,
    availability: profile.availability,
    timezone: profile.timezone,
    countryCode: profile.countryCode,
    experienceLevel: profile.experienceLevel,
    visibility: profile.visibility,
    completedAt: profile.completedAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    skills: skills satisfies ProfileSkillView[],
    languages: languages satisfies ProfileLanguage[],
  };
}

/**
 * A PATCH freelancer section is an expressed replace of the visible state:
 * present fields replace, `null` clears, absent fields fall back to the stored
 * value (or the create-time default). Key presence (not `??`) decides the three
 * cases, because `null` is a legitimate "clear" value and must not fall through
 * to the stored value. `headline`+`timezone` are the only required-not-null
 * columns with no default, so a first-time create without them is a 422 rather
 * than a database-level surprise.
 */
function mergeFreelancerSection(
  section: FreelancerSection,
  current: FreelancerProfileRecord | null,
): FreelancerProfileWrite {
  const headline = section.headline ?? current?.headline;
  const timezone = section.timezone ?? current?.timezone;
  if (headline === undefined || timezone === undefined) {
    throw new ValidationError(
      'Creating a freelancer profile requires `headline` and `timezone`',
    );
  }
  return {
    headline,
    timezone,
    bio: section.bio !== undefined ? section.bio : (current?.bio ?? null),
    hourlyRateMinor:
      section.hourlyRateMinor !== undefined
        ? section.hourlyRateMinor
        : (current?.hourlyRateMinor ?? null),
    currency:
      section.currency !== undefined
        ? section.currency
        : (current?.currency ?? null),
    availability: section.availability ?? current?.availability ?? 'available',
    countryCode:
      section.countryCode !== undefined
        ? section.countryCode
        : (current?.countryCode ?? null),
    experienceLevel:
      section.experienceLevel !== undefined
        ? section.experienceLevel
        : (current?.experienceLevel ?? null),
    visibility: section.visibility ?? current?.visibility ?? 'public',
  };
}

function mergeClientSection(
  section: ClientSection,
  current: ClientProfileRecord | null,
): ClientProfileWrite {
  const companyName = section.companyName ?? current?.companyName;
  if (companyName === undefined) {
    throw new ValidationError(
      'Creating a client profile requires `companyName`',
    );
  }
  return {
    companyName,
    about:
      section.about !== undefined ? section.about : (current?.about ?? null),
    websiteUrl:
      section.websiteUrl !== undefined
        ? section.websiteUrl
        : (current?.websiteUrl ?? null),
    countryCode:
      section.countryCode !== undefined
        ? section.countryCode
        : (current?.countryCode ?? null),
  };
}

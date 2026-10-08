import { z } from 'zod';
import {
  availabilitySchema,
  experienceLevelSchema,
  languageProficiencySchema,
  profileVisibilitySchema,
  skillProficiencySchema,
} from '../constants/attributes.js';
import {
  isValidCountryCode,
  isValidLanguageCode,
  isValidTimeZone,
} from '../utils/locale.js';
import { authUserSchema } from './auth.js';
import { currencySchema } from './money.js';
import { skillSchema } from './taxonomy.js';

/**
 * Profiles on the wire.
 *
 * A WERVI account has two independent halves — `freelancer_profiles` and
 * `client_profiles` — because the two answer different questions, and one
 * account may hold both. Skills and languages belong to the freelancer half
 * only: they describe what a person can do.
 *
 * Timestamps are ISO-8601 strings because that is what every serializer here
 * emits; the numeric rate is minor units with the currency paired beside it,
 * matching the databases CHECK constraint.
 */

/** The database allows 0–60 years of experience per skill. */
export const MAX_PROFILE_SKILL_YEARS = 60;

export const MAX_PROFILE_SKILLS = 60;
export const MAX_PROFILE_LANGUAGES = 50;

/** Where the raw two-letter code is a display origin, order comes from here. */
const normalizedCountryCode = z
  .string()
  .regex(/^[A-Za-z]{2}$/)
  .transform((value) => value.toUpperCase())
  .refine(isValidCountryCode);

const normalizedLanguageCode = z
  .string()
  .regex(/^[A-Za-z]{2}$/)
  .transform((value) => value.toLowerCase())
  .refine(isValidLanguageCode);

function nothingToUpdate(ctx: z.RefinementCtx): void {
  ctx.addIssue({ code: 'custom', message: 'Nothing to update' });
}

/** One entry a caller sends when replacing a profile's skills. */
export const profileSkillSchema = z
  .object({
    skillId: z.string().uuid(),
    proficiency: skillProficiencySchema,
    yearsExperience: z
      .number()
      .int()
      .min(0)
      .max(MAX_PROFILE_SKILL_YEARS)
      .nullable(),
    isFeatured: z.boolean(),
  })
  .strict();

export type ProfileSkill = z.infer<typeof profileSkillSchema>;

/** A saved profile skill, with the taxonomy row it points at. */
export const profileSkillViewSchema = z
  .object({
    skill: skillSchema,
    proficiency: skillProficiencySchema,
    yearsExperience: z
      .number()
      .int()
      .min(0)
      .max(MAX_PROFILE_SKILL_YEARS)
      .nullable(),
    isFeatured: z.boolean(),
  })
  .strict();

export type ProfileSkillView = z.infer<typeof profileSkillViewSchema>;

/** One entry a caller sends when replacing a profile's languages. */
export const profileLanguageInputSchema = z
  .object({
    languageCode: normalizedLanguageCode,
    proficiency: languageProficiencySchema,
  })
  .strict();

export type ProfileLanguageInput = z.infer<typeof profileLanguageInputSchema>;

/** A saved profile language (ISO 639-1, lowercased at the boundary). */
export const profileLanguageSchema = z
  .object({
    languageCode: z.string().regex(/^[a-z]{2}$/),
    proficiency: languageProficiencySchema,
  })
  .strict();

export type ProfileLanguage = z.infer<typeof profileLanguageSchema>;

/** The freelancer half, as served by every profile read. */
export const freelancerProfileSchema = z
  .object({
    userId: z.string().uuid(),
    headline: z.string().min(1),
    bio: z.string().nullable(),
    hourlyRateMinor: z.number().int().min(0).nullable(),
    currency: currencySchema.nullable(),
    availability: availabilitySchema,
    timezone: z.string().min(1),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    experienceLevel: experienceLevelSchema.nullable(),
    visibility: profileVisibilitySchema,
    completedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine(pairingIssues);

export type FreelancerProfile = z.infer<typeof freelancerProfileSchema>;

/** The client half, as served by every profile read. */
export const clientProfileSchema = z
  .object({
    userId: z.string().uuid(),
    companyName: z.string().min(1),
    about: z.string().nullable(),
    websiteUrl: z.string().nullable(),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export type ClientProfile = z.infer<typeof clientProfileSchema>;

/** The freelancer profile plus its skills and languages. */
export const freelancerProfileViewSchema = freelancerProfileSchema
  .extend({
    skills: z.array(profileSkillViewSchema),
    languages: z.array(profileLanguageSchema),
  })
  .strict();

export type FreelancerProfileView = z.infer<typeof freelancerProfileViewSchema>;

/**
 * `PATCH /profiles/me` body. Either half may be updated independently, and
 * within a half each present field replaces the stored value (`null` clears a
 * nullable column). Fields like `roles`, `status` or `email` are not part of
 * the contract: a strict schema rejects them before they reach the database.
 */
export const updateProfileRequestSchema = z
  .object({
    freelancer: z
      .object({
        headline: z.string().trim().min(1).max(120).optional(),
        bio: z.string().trim().max(4000).nullable().optional(),
        hourlyRateMinor: z.number().int().min(0).nullable().optional(),
        currency: currencySchema.nullable().optional(),
        availability: availabilitySchema.optional(),
        timezone: z.string().refine(isValidTimeZone).optional(),
        countryCode: normalizedCountryCode.nullable().optional(),
        experienceLevel: experienceLevelSchema.nullable().optional(),
        visibility: profileVisibilitySchema.optional(),
      })
      .strict()
      .superRefine((value, ctx) => {
        if (Object.keys(value).length === 0) {
          return nothingToUpdate(ctx);
        }
        const ratePresent = value.hourlyRateMinor !== undefined;
        const currencyPresent = value.currency !== undefined;
        if (ratePresent !== currencyPresent) {
          ctx.addIssue({
            code: 'custom',
            path: ['hourlyRateMinor'],
            message:
              'A rate and its currency must be updated or cleared together',
          });
          return;
        }
        if (
          ratePresent &&
          currencyPresent &&
          (value.hourlyRateMinor === null) !== (value.currency === null)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['hourlyRateMinor'],
            message: 'A rate and its currency must be set or cleared together',
          });
        }
      })
      .optional(),
    client: z
      .object({
        companyName: z.string().trim().min(1).max(160).optional(),
        about: z.string().trim().max(4000).nullable().optional(),
        websiteUrl: z.string().url().max(2048).nullable().optional(),
        countryCode: normalizedCountryCode.nullable().optional(),
      })
      .strict()
      .superRefine((value, ctx) => {
        if (Object.keys(value).length === 0) {
          ctx.addIssue({ code: 'custom', message: 'Nothing to update' });
        }
      })
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.freelancer === undefined && value.client === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide a `freelancer` or `client` section to update',
      });
    }
  });

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

/** `PUT /profiles/me/skills` — an atomic replacement of the whole set. */
export const replaceSkillsRequestSchema = z
  .object({
    skills: z.array(profileSkillSchema).max(MAX_PROFILE_SKILLS),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.skills.map((skill) => skill.skillId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['skills'],
        message: 'A skill may appear only once on a profile',
      });
    }
  });

export type ReplaceSkillsRequest = z.infer<typeof replaceSkillsRequestSchema>;

/** `PUT /profiles/me/languages` — an atomic replacement of the whole set. */
export const replaceLanguagesRequestSchema = z
  .object({
    languages: z.array(profileLanguageInputSchema).max(MAX_PROFILE_LANGUAGES),
  })
  .strict()
  .superRefine((value, ctx) => {
    const codes = value.languages.map((language) => language.languageCode);
    if (new Set(codes).size !== codes.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['languages'],
        message: 'A language may appear only once on a profile',
      });
    }
  });

export type ReplaceLanguagesRequest = z.infer<
  typeof replaceLanguagesRequestSchema
>;

/** `GET /profiles/me` — own profile with both halves and freelancer extras. */
export const myProfileResponseSchema = z
  .object({
    user: authUserSchema,
    freelancer: freelancerProfileViewSchema.nullable(),
    client: clientProfileSchema.nullable(),
  })
  .strict();

export type MyProfileResponse = z.infer<typeof myProfileResponseSchema>;

/** `GET /profiles/:userId` — a public freelancer profile, nothing else. */
export const publicProfileResponseSchema = z
  .object({ profile: freelancerProfileViewSchema })
  .strict();

export type PublicProfileResponse = z.infer<typeof publicProfileResponseSchema>;

export const profileSkillListResponseSchema = z
  .object({ items: z.array(profileSkillViewSchema) })
  .strict();

export type ProfileSkillListResponse = z.infer<
  typeof profileSkillListResponseSchema
>;

export const profileLanguageListResponseSchema = z
  .object({ items: z.array(profileLanguageSchema) })
  .strict();

export type ProfileLanguageListResponse = z.infer<
  typeof profileLanguageListResponseSchema
>;

/** Rate and currency are a single column pair, mirroring the DB CHECK. */
function pairingIssues(profile: FreelancerProfile, ctx: z.RefinementCtx): void {
  if (profile.hourlyRateMinor !== null && profile.currency === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['currency'],
      message: 'A rate without a currency is invalid',
    });
  }
  if (profile.hourlyRateMinor === null && profile.currency !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['hourlyRateMinor'],
      message: 'A currency without a rate is invalid',
    });
  }
}

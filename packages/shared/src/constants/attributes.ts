import { z } from 'zod';

/**
 * Non-status domain enumerations.
 *
 * These are closed vocabularies rather than free text: a job budget model or a
 * proficiency level is filtered, sorted and translated, so an unexpected value
 * is a data bug rather than a new category.
 */

export const AVAILABILITY = ['available', 'limited', 'unavailable'] as const;
export const availabilitySchema = z.enum(AVAILABILITY);
export type Availability = z.infer<typeof availabilitySchema>;

export const PROFILE_VISIBILITIES = ['public', 'private'] as const;
export const profileVisibilitySchema = z.enum(PROFILE_VISIBILITIES);
export type ProfileVisibility = z.infer<typeof profileVisibilitySchema>;

export const BUDGET_MODELS = ['fixed', 'hourly'] as const;
export const budgetModelSchema = z.enum(BUDGET_MODELS);
export type BudgetModel = z.infer<typeof budgetModelSchema>;

export const JOB_VISIBILITIES = ['public', 'invite_only', 'private'] as const;
export const jobVisibilitySchema = z.enum(JOB_VISIBILITIES);
export type JobVisibility = z.infer<typeof jobVisibilitySchema>;

export const EXPERIENCE_LEVELS = [
  'entry',
  'intermediate',
  'expert',
  'senior',
] as const;
export const experienceLevelSchema = z.enum(EXPERIENCE_LEVELS);
export type ExperienceLevel = z.infer<typeof experienceLevelSchema>;

export const CONTRACT_DURATIONS = [
  'less_than_30_days',
  'one_to_three_months',
  'three_to_six_months',
  'six_to_nine_months',
  'over_nine_months',
] as const;
export const contractDurationSchema = z.enum(CONTRACT_DURATIONS);
export type ContractDuration = z.infer<typeof contractDurationSchema>;

export const WORK_MODES = ['remote', 'hybrid', 'onsite'] as const;
export const workModeSchema = z.enum(WORK_MODES);
export type WorkMode = z.infer<typeof workModeSchema>;

export const SKILL_PROFICIENCIES = [
  'beginner',
  'intermediate',
  'advanced',
  'expert',
] as const;
export const skillProficiencySchema = z.enum(SKILL_PROFICIENCIES);
export type SkillProficiency = z.infer<typeof skillProficiencySchema>;

/** ISO 639-1. Display names come from `Intl.DisplayNames` at render time. */
export const LANGUAGE_PROFICIENCIES = [
  'basic',
  'conversational',
  'fluent',
  'native',
] as const;
export const languageProficiencySchema = z.enum(LANGUAGE_PROFICIENCIES);
export type LanguageProficiency = z.infer<typeof languageProficiencySchema>;

/** Outcome of a client review of one milestone delivery. */
export const DELIVERY_OUTCOMES = [
  'approved',
  'changes_requested',
  'rejected',
] as const;
export const deliveryOutcomeSchema = z.enum(DELIVERY_OUTCOMES);
export type DeliveryOutcome = z.infer<typeof deliveryOutcomeSchema>;

/** Revision cycles allowed per milestone before a milestone is at risk. */
export const DEFAULT_MAX_REVISIONS = 3;
export const MIN_REVISION_NUMBER = 1;
export const MAX_ALLOWED_REVISIONS = 10;

export const MIN_REVIEW_RATING = 1;
export const MAX_REVIEW_RATING = 5;

/** Milestone revisions are a bounded loop; the ceiling keeps it a loop. */
export const milestoneRevisionSchema = z
  .number()
  .int()
  .min(MIN_REVISION_NUMBER)
  .max(MAX_ALLOWED_REVISIONS);

export const reviewRatingSchema = z
  .number()
  .int()
  .min(MIN_REVIEW_RATING)
  .max(MAX_REVIEW_RATING);

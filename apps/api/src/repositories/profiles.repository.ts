import type {
  Availability,
  Category,
  Currency,
  ExperienceLevel,
  LanguageProficiency,
  ProfileVisibility,
  Skill,
  SkillProficiency,
} from '@wervi/shared';

/**
 * Profile storage records.
 *
 * Timestamps are ISO-8601 strings, not `Date`s: the routes return them straight
 * to a strict Zod response schema, and `z.iso.datetime()` only accepts strings.
 */

export interface FreelancerProfileRecord {
  userId: string;
  headline: string;
  bio: string | null;
  hourlyRateMinor: number | null;
  currency: Currency | null;
  availability: Availability;
  timezone: string;
  countryCode: string | null;
  experienceLevel: ExperienceLevel | null;
  visibility: ProfileVisibility;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientProfileRecord {
  userId: string;
  companyName: string;
  about: string | null;
  websiteUrl: string | null;
  countryCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileSkillRecord {
  skill: Skill;
  proficiency: SkillProficiency;
  yearsExperience: number | null;
  isFeatured: boolean;
}

export interface ProfileLanguageRecord {
  languageCode: string;
  proficiency: LanguageProficiency;
}

/**
 * The full intended profile state, computed by the route from the PATCH body
 * merged over the current row (or over database defaults when the profile does
 * not exist yet). Required at every write because a PATCH is an express
 * replace of the shown value: an omitted field here carries its old value, an
 * explicit `null` clears it.
 */
export interface FreelancerProfileWrite {
  headline: string;
  timezone: string;
  bio: string | null;
  hourlyRateMinor: number | null;
  currency: Currency | null;
  availability: Availability;
  countryCode: string | null;
  experienceLevel: ExperienceLevel | null;
  visibility: ProfileVisibility;
}

export interface ClientProfileWrite {
  companyName: string;
  about: string | null;
  websiteUrl: string | null;
  countryCode: string | null;
}

/** One row offered when atomically replacing a profile's skill list. */
export interface ReplaceSkillItem {
  skillId: string;
  proficiency: SkillProficiency;
  yearsExperience: number | null;
  isFeatured: boolean;
}

/** One row offered when atomically replacing a profile's language list. */
export interface ReplaceLanguageItem {
  languageCode: string;
  proficiency: LanguageProficiency;
}

/**
 * The only way the service layer reaches profile storage. Insert and update are
 * one upsert so a first-time PATCH and an edit are the same code path; skills
 * and languages are replaced as whole sets, keeping the boundary transactional.
 */
export interface ProfilesRepository {
  getFreelancerProfile(userId: string): Promise<FreelancerProfileRecord | null>;
  getClientProfile(userId: string): Promise<ClientProfileRecord | null>;
  getFreelancerSkills(userId: string): Promise<ProfileSkillRecord[]>;
  getFreelancerLanguages(userId: string): Promise<ProfileLanguageRecord[]>;
  upsertFreelancerProfile(
    userId: string,
    input: FreelancerProfileWrite,
  ): Promise<FreelancerProfileRecord>;
  upsertClientProfile(
    userId: string,
    input: ClientProfileWrite,
  ): Promise<ClientProfileRecord>;
  replaceFreelancerSkills(
    userId: string,
    items: ReplaceSkillItem[],
  ): Promise<void>;
  replaceFreelancerLanguages(
    userId: string,
    items: ReplaceLanguageItem[],
  ): Promise<void>;
  listActiveCategories(): Promise<Category[]>;
  getActiveCategoryById(id: string): Promise<Category | null>;
  listActiveSkills(categoryId?: string): Promise<Skill[]>;
  getActiveSkillsByIds(ids: string[]): Promise<Skill[]>;
}

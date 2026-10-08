import { type Database, sql } from '@wervi/db';
import {
  clientProfiles,
  freelancerProfiles,
  profileLanguages,
  profileSkills,
} from '@wervi/db';
import { type categories, type skills } from '@wervi/db';
import type {
  ClientProfileRecord,
  ClientProfileWrite,
  FreelancerProfileRecord,
  FreelancerProfileWrite,
  ProfileLanguageRecord,
  ProfileSkillRecord,
  ProfilesRepository,
  ReplaceLanguageItem,
  ReplaceSkillItem,
} from './profiles.repository.js';
import type { Category, Skill } from '@wervi/shared';

type ClientProfileRow = typeof clientProfiles.$inferSelect;
type FreelancerProfileRow = typeof freelancerProfiles.$inferSelect;

/**
 * Drizzle implementation of `ProfilesRepository`.
 *
 * Updates go through a single upsert statement (INSERT ... ON CONFLICT DO
 * UPDATE) so a first-time PATCH and a later edit share one code path. The
 * `updated_at` column is maintained by the database trigger, never by the
 * application. Filter operators come from the query callbacks (same Drizzle
 * instance as the tables) rather than a direct `drizzle-orm` import, which
 * keeps the whole module on one engine copy.
 */
export class DrizzleProfilesRepository implements ProfilesRepository {
  readonly #db: Database;

  constructor(database: Database) {
    this.#db = database;
  }

  async getFreelancerProfile(
    userId: string,
  ): Promise<FreelancerProfileRecord | null> {
    const row = await this.#db.db.query.freelancerProfiles.findFirst({
      where: (table, operators) => operators.eq(table.userId, userId),
    });
    return row === undefined ? null : toFreelancerProfileRecord(row);
  }

  async getClientProfile(userId: string): Promise<ClientProfileRecord | null> {
    const row = await this.#db.db.query.clientProfiles.findFirst({
      where: (table, operators) => operators.eq(table.userId, userId),
    });
    return row === undefined ? null : toClientProfileRecord(row);
  }

  async getFreelancerSkills(userId: string): Promise<ProfileSkillRecord[]> {
    const rows = await this.#db.db.query.profileSkills.findMany({
      where: (table, operators) => operators.eq(table.freelancerId, userId),
    });

    if (rows.length === 0) {
      return [];
    }

    const skillRows = await this.#db.db.query.skills.findMany({
      where: (table, operators) =>
        operators.inArray(
          table.id,
          rows.map((row) => row.skillId),
        ),
    });
    const skillsById = new Map(skillRows.map((row) => [row.id, row]));

    const records: ProfileSkillRecord[] = [];
    for (const row of rows) {
      const skill = skillsById.get(row.skillId);
      if (skill === undefined) {
        continue;
      }
      records.push({
        skill: toSkillRecord(skill),
        proficiency: row.proficiency as ProfileSkillRecord['proficiency'],
        yearsExperience: row.yearsExperience,
        isFeatured: row.isFeatured,
      });
    }

    return records.sort(compareSkills);
  }

  async getFreelancerLanguages(
    userId: string,
  ): Promise<ProfileLanguageRecord[]> {
    const rows = await this.#db.db.query.profileLanguages.findMany({
      where: (table, operators) => operators.eq(table.freelancerId, userId),
      orderBy: (table, operators) => operators.asc(table.languageCode),
    });

    return rows.map((row) => ({
      languageCode: row.languageCode,
      proficiency: row.proficiency as ProfileLanguageRecord['proficiency'],
    }));
  }

  async upsertFreelancerProfile(
    userId: string,
    input: FreelancerProfileWrite,
  ): Promise<FreelancerProfileRecord> {
    const values = {
      userId,
      headline: input.headline,
      bio: input.bio,
      hourlyRateMinor: input.hourlyRateMinor,
      currency: input.currency,
      availability: input.availability,
      timezone: input.timezone,
      countryCode: input.countryCode,
      experienceLevel: input.experienceLevel,
      visibility: input.visibility,
    };

    const row = (
      await this.#db.db
        .insert(freelancerProfiles)
        .values(values)
        .onConflictDoUpdate({
          target: freelancerProfiles.userId,
          set: values,
        })
        .returning()
    )[0];

    if (row === undefined) {
      throw new Error('Failed to upsert freelancer profile');
    }

    return toFreelancerProfileRecord(row);
  }

  async upsertClientProfile(
    userId: string,
    input: ClientProfileWrite,
  ): Promise<ClientProfileRecord> {
    const values = {
      userId,
      companyName: input.companyName,
      about: input.about,
      websiteUrl: input.websiteUrl,
      countryCode: input.countryCode,
    };

    const row = (
      await this.#db.db
        .insert(clientProfiles)
        .values(values)
        .onConflictDoUpdate({
          target: clientProfiles.userId,
          set: values,
        })
        .returning()
    )[0];

    if (row === undefined) {
      throw new Error('Failed to upsert client profile');
    }

    return toClientProfileRecord(row);
  }

  async replaceFreelancerSkills(
    userId: string,
    items: ReplaceSkillItem[],
  ): Promise<void> {
    await this.#db.db.transaction(async (tx) => {
      await tx.delete(profileSkills).where(sql`freelancer_id = ${userId}`);
      if (items.length > 0) {
        await tx.insert(profileSkills).values(
          items.map((item) => ({
            freelancerId: userId,
            skillId: item.skillId,
            proficiency: item.proficiency,
            yearsExperience: item.yearsExperience,
            isFeatured: item.isFeatured,
          })),
        );
      }
    });
  }

  async replaceFreelancerLanguages(
    userId: string,
    items: ReplaceLanguageItem[],
  ): Promise<void> {
    await this.#db.db.transaction(async (tx) => {
      await tx.delete(profileLanguages).where(sql`freelancer_id = ${userId}`);
      if (items.length > 0) {
        await tx.insert(profileLanguages).values(
          items.map((item) => ({
            freelancerId: userId,
            languageCode: item.languageCode,
            proficiency: item.proficiency,
          })),
        );
      }
    });
  }

  async listActiveCategories(): Promise<Category[]> {
    const rows = await this.#db.db.query.categories.findMany({
      where: (table, operators) => operators.eq(table.isActive, true),
      orderBy: (table, operators) => [
        operators.asc(table.position),
        operators.asc(table.name),
      ],
    });

    return rows.map(toCategoryRecord);
  }

  async getActiveCategoryById(id: string): Promise<Category | null> {
    const row = await this.#db.db.query.categories.findFirst({
      where: (table, operators) =>
        operators.and(
          operators.eq(table.id, id),
          operators.eq(table.isActive, true),
        ),
    });
    return row === undefined ? null : toCategoryRecord(row);
  }

  async listActiveSkills(categoryId?: string): Promise<Skill[]> {
    const rows = await this.#db.db.query.skills.findMany({
      where: (table, operators) =>
        operators.and(
          operators.eq(table.isActive, true),
          categoryId === undefined
            ? operators.sql`true`
            : operators.eq(table.categoryId, categoryId),
        ),
      orderBy: (table, operators) => [
        operators.asc(table.position),
        operators.asc(table.name),
      ],
    });

    return rows.map(toSkillRecord);
  }

  async getActiveSkillsByIds(ids: string[]): Promise<Skill[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.#db.db.query.skills.findMany({
      where: (table, operators) =>
        operators.and(
          operators.eq(table.isActive, true),
          operators.inArray(table.id, ids),
        ),
    });

    return rows.map(toSkillRecord);
  }
}

function compareSkills(a: ProfileSkillRecord, b: ProfileSkillRecord): number {
  const position = a.skill.position - b.skill.position;
  if (position !== 0) {
    return position;
  }
  return a.skill.name.localeCompare(b.skill.name);
}

function toFreelancerProfileRecord(
  row: FreelancerProfileRow,
): FreelancerProfileRecord {
  return {
    userId: row.userId,
    headline: row.headline,
    bio: row.bio,
    hourlyRateMinor: row.hourlyRateMinor,
    currency: row.currency as FreelancerProfileRecord['currency'],
    availability: row.availability,
    timezone: row.timezone,
    countryCode: row.countryCode,
    experienceLevel: row.experienceLevel,
    visibility: row.visibility,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toClientProfileRecord(row: ClientProfileRow): ClientProfileRecord {
  return {
    userId: row.userId,
    companyName: row.companyName,
    about: row.about,
    websiteUrl: row.websiteUrl,
    countryCode: row.countryCode,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toCategoryRecord(row: typeof categories.$inferSelect): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    parentId: row.parentId,
    position: row.position,
    isActive: row.isActive,
  };
}

function toSkillRecord(row: typeof skills.$inferSelect): Skill {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    categoryId: row.categoryId,
    position: row.position,
    isActive: row.isActive,
  };
}

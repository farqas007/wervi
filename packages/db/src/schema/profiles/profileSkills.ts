import { SKILL_PROFICIENCIES } from '@wervi/shared';
import {
  boolean,
  index,
  integer,
  primaryKey,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { oneOf, optionalInRange } from '../common/index.js';
import { skills } from '../taxonomy/skills.js';
import { freelancerProfiles } from './freelancerProfiles.js';

/**
 * A skill on a freelancer profile, with the proficiency and experience that make
 * proposals comparable.
 *
 * Composite primary key: a skill appears at most once per profile. CASCADE from
 * the profile, RESTRICT from the skill — taxonomy outlives profiles.
 */
export const profileSkills = pgTable(
  'profile_skills',
  {
    freelancerId: uuid('freelancer_id')
      .notNull()
      .references(() => freelancerProfiles.userId, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'restrict' }),
    proficiency: text().notNull(),
    yearsExperience: integer('years_experience'),
    isFeatured: boolean('is_featured').notNull().default(false),
  },
  (table) => [
    primaryKey({
      name: 'profile_skills_pkey',
      columns: [table.freelancerId, table.skillId],
    }),
    index('profile_skills_skill_id_idx').on(table.skillId),
    oneOf(
      'profile_skills_proficiency_check',
      table.proficiency,
      SKILL_PROFICIENCIES,
    ),
    optionalInRange(
      'profile_skills_years_experience_check',
      table.yearsExperience,
      0,
      60,
    ),
  ],
);

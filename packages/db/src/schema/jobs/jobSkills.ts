import { boolean, index, primaryKey, pgTable, uuid } from 'drizzle-orm/pg-core';
import { jobs } from './jobs.js';
import { skills } from '../taxonomy/skills.js';

/**
 * Skills a job asks for, and whether they are essential.
 *
 * `is_required` is what lets a client filter bids: a freelancer who lacks a
 * required skill can still be shortlisted, but the listing says up front that
 * it is a stretch.
 */
export const jobSkills = pgTable(
  'job_skills',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'restrict' }),
    isRequired: boolean('is_required').notNull().default(false),
  },
  (table) => [
    primaryKey({
      name: 'job_skills_pkey',
      columns: [table.jobId, table.skillId],
    }),
    index('job_skills_skill_id_idx').on(table.skillId),
  ],
);

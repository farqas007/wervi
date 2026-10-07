import type { categories } from '../schema/taxonomy/categories.js';
import type { skills } from '../schema/taxonomy/skills.js';
import type { users } from '../schema/auth/users.js';
import { SEED_TIMESTAMP, seedIds } from './ids.js';

/**
 * Identity and taxonomy rows.
 *
 * Return types are the tables' own `$inferInsert` types, so the seed cannot
 * drift from the schema: rename a column or narrow a status and this stops
 * compiling.
 *
 * No passwords, no verification tokens, no sessions. This package owns tables
 * only; credentials arrive with Phase 3 through Better Auth, and a seed that
 * invented its own password hashing would be a second auth path.
 */
export function seedAuthAndTaxonomy(): {
  users: (typeof users.$inferInsert)[];
  categories: (typeof categories.$inferInsert)[];
  skills: (typeof skills.$inferInsert)[];
} {
  return {
    users: [
      {
        id: seedIds.users.client,
        name: 'Dana Client',
        email: 'client@wervi.test',
        emailVerified: true,
        roles: ['client'],
        status: 'active',
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.users.freelancerA,
        name: 'Freya Freelancer',
        email: 'freelancer@wervi.test',
        emailVerified: true,
        roles: ['freelancer'],
        status: 'active',
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.users.freelancerB,
        name: 'Bo Builder',
        email: 'builder@wervi.test',
        emailVerified: true,
        roles: ['freelancer'],
        status: 'active',
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.users.admin,
        name: 'Avery Admin',
        email: 'admin@wervi.test',
        emailVerified: true,
        roles: ['admin'],
        status: 'active',
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.users.suspended,
        name: 'Sam Suspended',
        email: 'suspended@wervi.test',
        emailVerified: false,
        roles: ['freelancer'],
        status: 'suspended',
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.users.freelancerC,
        name: 'Casey Contractor',
        email: 'contractor@wervi.test',
        emailVerified: true,
        roles: ['freelancer', 'client'],
        status: 'active',
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    ],
    categories: [
      {
        id: seedIds.categories.engineering,
        slug: 'engineering',
        name: 'Engineering',
        description: 'Software engineering and infrastructure work.',
        position: 1,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.categories.design,
        slug: 'design',
        name: 'Design',
        description: 'Product, brand and interface design work.',
        position: 2,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.categories.writing,
        slug: 'writing',
        name: 'Writing',
        description: 'Technical writing, documentation and editing.',
        position: 3,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    ],
    skills: [
      {
        id: seedIds.skills.typescript,
        slug: 'typescript',
        name: 'TypeScript',
        categoryId: seedIds.categories.engineering,
        position: 1,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.skills.postgres,
        slug: 'postgresql',
        name: 'PostgreSQL',
        categoryId: seedIds.categories.engineering,
        position: 2,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.skills.react,
        slug: 'react',
        name: 'React',
        categoryId: seedIds.categories.engineering,
        position: 3,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.skills.figure,
        slug: 'figma',
        name: 'Figma',
        categoryId: seedIds.categories.design,
        position: 1,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.skills.technicalWriting,
        slug: 'technical-writing',
        name: 'Technical Writing',
        categoryId: seedIds.categories.writing,
        position: 1,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    ],
  };
}

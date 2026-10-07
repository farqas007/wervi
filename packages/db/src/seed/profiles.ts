import type { clientProfiles } from '../schema/profiles/clientProfiles.js';
import type { freelancerProfiles } from '../schema/profiles/freelancerProfiles.js';
import type { portfolioItems } from '../schema/profiles/portfolioItems.js';
import type { profileLanguages } from '../schema/profiles/profileLanguages.js';
import type { profileSkills } from '../schema/profiles/profileSkills.js';
import { SEED_TIMESTAMP, seedIds } from './ids.js';

/**
 * Profile rows.
 *
 * Freelancers, not clients, get languages and skills, because those describe
 * what a person can do. The client profile is the company.
 */
export function seedProfiles(): {
  freelancerProfiles: (typeof freelancerProfiles.$inferInsert)[];
  clientProfiles: (typeof clientProfiles.$inferInsert)[];
  profileSkills: (typeof profileSkills.$inferInsert)[];
  profileLanguages: (typeof profileLanguages.$inferInsert)[];
  portfolioItems: (typeof portfolioItems.$inferInsert)[];
} {
  return {
    freelancerProfiles: [
      {
        userId: seedIds.users.freelancerA,
        headline: 'TypeScript and Postgres, shipped end to end',
        bio: 'Ten years of product engineering, most of it on data-heavy dashboards.',
        hourlyRateMinor: 9500,
        currency: 'USD',
        availability: 'available',
        timezone: 'Europe/Lisbon',
        countryCode: 'PT',
        experienceLevel: 'senior',
        visibility: 'public',
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        userId: seedIds.users.freelancerB,
        headline: 'Design systems and product UI',
        bio: 'I design interfaces that survive contact with engineering.',
        // No listed rate: this freelancer takes fixed-price work only, which
        // the rate/currency pairing CHECK constraint has to allow.
        hourlyRateMinor: null,
        currency: null,
        availability: 'limited',
        timezone: 'America/New_York',
        countryCode: 'US',
        experienceLevel: 'intermediate',
        visibility: 'public',
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    ],
    clientProfiles: [
      {
        userId: seedIds.users.client,
        companyName: 'Northwind Analytics',
        about: 'Small team building reporting tools.',
        websiteUrl: 'https://northwind.example',
        countryCode: 'US',
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    ],
    profileSkills: [
      {
        freelancerId: seedIds.users.freelancerA,
        skillId: seedIds.skills.typescript,
        proficiency: 'expert',
        yearsExperience: 8,
        isFeatured: true,
      },
      {
        freelancerId: seedIds.users.freelancerA,
        skillId: seedIds.skills.postgres,
        proficiency: 'advanced',
        yearsExperience: 6,
        isFeatured: true,
      },
      {
        freelancerId: seedIds.users.freelancerA,
        skillId: seedIds.skills.react,
        proficiency: 'intermediate',
        yearsExperience: 5,
        isFeatured: false,
      },
      {
        freelancerId: seedIds.users.freelancerB,
        skillId: seedIds.skills.figure,
        proficiency: 'expert',
        yearsExperience: 7,
        isFeatured: true,
      },
    ],
    profileLanguages: [
      {
        freelancerId: seedIds.users.freelancerA,
        languageCode: 'en',
        proficiency: 'native',
      },
      {
        freelancerId: seedIds.users.freelancerA,
        languageCode: 'pt',
        proficiency: 'native',
      },
      {
        freelancerId: seedIds.users.freelancerB,
        languageCode: 'en',
        proficiency: 'native',
      },
    ],
    portfolioItems: [
      {
        freelancerId: seedIds.users.freelancerA,
        title: 'Fleet telemetry dashboard',
        description: 'Realtime ingest plus charting for 40k vehicles.',
        position: 1,
        publishedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        freelancerId: seedIds.users.freelancerA,
        title: 'Billing service rewrite',
        position: 2,
        publishedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    ],
  };
}

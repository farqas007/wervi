import { sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { users } from '../schema/auth/users.js';
import { categories } from '../schema/taxonomy/categories.js';
import { skills } from '../schema/taxonomy/skills.js';
import { clientProfiles } from '../schema/profiles/clientProfiles.js';
import { freelancerProfiles } from '../schema/profiles/freelancerProfiles.js';
import { portfolioItems } from '../schema/profiles/portfolioItems.js';
import { profileLanguages } from '../schema/profiles/profileLanguages.js';
import { profileSkills } from '../schema/profiles/profileSkills.js';
import { jobs } from '../schema/jobs/jobs.js';
import { jobSkills } from '../schema/jobs/jobSkills.js';
import { proposals } from '../schema/proposals/proposals.js';
import { contracts } from '../schema/contracts/contracts.js';
import { milestones } from '../schema/milestones/milestones.js';
import { milestoneDeliveries } from '../schema/milestones/deliveries.js';
import { reviews } from '../schema/reviews/reviews.js';
import { auditLog } from '../schema/audit/auditLog.js';
import { TRUNCATE_ORDER } from './ids.js';
import { seedAuthAndTaxonomy } from './core.js';
import { seedProfiles } from './profiles.js';
import { seedMarketplace } from './marketplace.js';

/** Row counts, so a caller can report or assert on what was written. */
export interface SeedSummary {
  users: number;
  jobs: number;
  proposals: number;
  contracts: number;
  milestones: number;
  reviews: number;
}

/**
 * Applies the whole seed in one transaction.
 *
 * Truncate first, so re-running is idempotent: a seed that only works on an
 * empty database is a script, not a seed. The transaction means a failure
 * half-way through leaves nothing behind, which matters more than usual here
 * because so many foreign keys are RESTRICT and a partial load would refuse its
 * own retry.
 *
 * `onConflictDoNothing` is belt and braces. After the truncate there should be
 * no conflicts; if a fixed id ever does collide, the conflicting row is skipped
 * rather than aborting the whole seed, and the test harness's assertions on
 * those ids would catch it.
 */
export async function runSeed(database: Database): Promise<SeedSummary> {
  const { db } = database;

  const identity = seedAuthAndTaxonomy();
  const profiles = seedProfiles();
  const marketplace = seedMarketplace();

  await db.transaction(async (tx) => {
    const tableList = TRUNCATE_ORDER.map((table) => `"${table}"`).join(', ');
    await tx.execute(sql.raw(`truncate table ${tableList} restart identity`));

    await tx.insert(users).values(identity.users).onConflictDoNothing();
    await tx
      .insert(categories)
      .values(identity.categories)
      .onConflictDoNothing();
    await tx.insert(skills).values(identity.skills).onConflictDoNothing();

    await tx
      .insert(freelancerProfiles)
      .values(profiles.freelancerProfiles)
      .onConflictDoNothing();
    await tx
      .insert(clientProfiles)
      .values(profiles.clientProfiles)
      .onConflictDoNothing();
    await tx
      .insert(profileSkills)
      .values(profiles.profileSkills)
      .onConflictDoNothing();
    await tx
      .insert(profileLanguages)
      .values(profiles.profileLanguages)
      .onConflictDoNothing();
    await tx
      .insert(portfolioItems)
      .values(profiles.portfolioItems)
      .onConflictDoNothing();

    await tx.insert(jobs).values(marketplace.jobs).onConflictDoNothing();
    await tx
      .insert(jobSkills)
      .values(marketplace.jobSkills)
      .onConflictDoNothing();
    await tx
      .insert(proposals)
      .values(marketplace.proposals)
      .onConflictDoNothing();
    await tx
      .insert(contracts)
      .values(marketplace.contracts)
      .onConflictDoNothing();
    await tx
      .insert(milestones)
      .values(marketplace.milestones)
      .onConflictDoNothing();
    await tx
      .insert(milestoneDeliveries)
      .values(marketplace.milestoneDeliveries)
      .onConflictDoNothing();
    await tx.insert(reviews).values(marketplace.reviews).onConflictDoNothing();
    await tx
      .insert(auditLog)
      .values(marketplace.auditLog)
      .onConflictDoNothing();
  });

  return {
    users: identity.users.length,
    jobs: marketplace.jobs.length,
    proposals: marketplace.proposals.length,
    contracts: marketplace.contracts.length,
    milestones: marketplace.milestones.length,
    reviews: marketplace.reviews.length,
  };
}

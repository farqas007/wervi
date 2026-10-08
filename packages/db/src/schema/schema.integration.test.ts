import { MAX_ALLOWED_REVISIONS, ROLES, type UserStatus } from '@wervi/shared';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDatabase,
  resetDatabase,
  resolveTestDatabaseUrl,
  setupDatabase,
} from '../testing/index.js';
import { runSeed } from '../seed/index.js';
import {
  authAccounts,
  authSessions,
  authVerifications,
  users,
} from './auth/index.js';
import { categories, skills } from './taxonomy/index.js';
import { freelancerProfiles } from './profiles/index.js';
import { jobs } from './jobs/index.js';
import { proposals } from './proposals/index.js';
import { contracts } from './contracts/index.js';
import { milestones, milestoneDeliveries } from './milestones/index.js';
import { reviews } from './reviews/index.js';
import { auditLog } from './audit/auditLog.js';
import type { Database } from '../client.js';

/**
 * Schema-level guarantees, checked against a real PostgreSQL.
 *
 * These are the rules that unit tests cannot reach: the generated DDL, the
 * CHECK constraints, the partial unique indexes, the composite foreign keys and
 * the `updated_at` trigger. Anything expressible in TypeScript belongs in
 * `@wervi/shared` and is tested there instead.
 */
const target = resolveTestDatabaseUrl();

/**
 * Constraint identity from a rejected insert.
 *
 * The driver error is the only place a named constraint shows up, so a test that
 * asserts "the database rejected this" without naming the constraint would pass
 * for the wrong reason: a missing column or a bad type fails just as loudly as a
 * CHECK constraint.
 *
 * Drizzle wraps the driver error as `Failed query: ...`, which names nothing,
 * and leaves the driver's own message on `cause`. The text below therefore walks
 * the chain instead of reading one message, so a name on either level matches.
 */
function errorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  while (current !== undefined && parts.length < 5) {
    if (current instanceof Error) {
      parts.push(`${current.name}: ${current.message}`);
      current = current.cause;
    } else {
      parts.push(JSON.stringify(current) ?? 'undefined');
      break;
    }
  }

  return parts.join('\n');
}

/**
 * Asserts that a statement was rejected with a named constraint or index.
 *
 * `rejects.toThrow` cannot express this: it accepts a string, a pattern or an
 * error *class*, and a plain function argument is taken as that class rather
 * than as a check of the message. Matching the name — and rethrowing anything
 * else, so the real failure stays visible — is stated once here instead.
 */
async function rejectsWith(
  statement: Promise<unknown>,
  constraint: string,
): Promise<void> {
  try {
    await statement;
  } catch (error) {
    if (errorText(error).includes(constraint)) {
      return;
    }
    throw error;
  }

  throw new Error(
    `expected the statement to be rejected with "${constraint}", but it resolved`,
  );
}

describe.skipIf(target.url === undefined)('schema constraints', () => {
  let database: Database;

  beforeAll(async () => {
    database = await setupDatabase(target.url as string);
  });

  afterAll(async () => {
    await closeDatabase(database);
  });

  beforeEach(async () => {
    await resetDatabase(database);
  });

  async function insertUser(
    overrides: Partial<typeof users.$inferInsert> = {},
  ): Promise<string> {
    const id = randomUUID();
    await database.db.insert(users).values({
      id,
      name: 'Test User',
      email: `${id}@wervi.test`,
      ...overrides,
    });
    return id;
  }

  describe('users', () => {
    it('accepts every status in the shared vocabulary', async () => {
      const statuses = ['pending', 'active', 'suspended', 'closed'] as const;

      for (const status of statuses) {
        const id = randomUUID();
        await database.db.insert(users).values({
          id,
          name: status,
          email: `${id}@wervi.test`,
          status,
        });
      }

      const rows = await database.db
        .select({ status: users.status })
        .from(users);
      expect(rows.map((row) => row.status).sort()).toEqual(
        [...statuses].sort(),
      );
    });

    it('rejects a status outside the vocabulary', async () => {
      // Deliberately untyped: the point is that the type system cannot express
      // this and the database has to catch it anyway.
      await expect(
        insertUser({ status: 'banned' as unknown as UserStatus }),
      ).rejects.toThrow();
    });

    it('accepts every role in the shared vocabulary', async () => {
      const id = randomUUID();
      await database.db.insert(users).values({
        id,
        name: 'All Roles',
        email: `${id}@wervi.test`,
        roles: [...ROLES],
      });

      const rows = await database.db.select({ roles: users.roles }).from(users);
      expect(rows[0]?.roles).toEqual([...ROLES]);
    });

    it('rejects a role outside the vocabulary', async () => {
      await expect(
        // @ts-expect-error deliberately invalid role for DB constraint test
        insertUser({ roles: ['wizard'] }),
      ).rejects.toThrow();
    });

    it('treats email uniqueness as case-insensitive', async () => {
      await insertUser({ email: 'Person@wervi.test' });

      await expect(
        insertUser({ email: 'person@wervi.test' }),
      ).rejects.toThrow();
    });
  });

  describe('proposals', () => {
    async function insertJob(clientId: string): Promise<string> {
      const id = randomUUID();
      await database.db.insert(jobs).values({
        id,
        clientId,
        slug: `job-${id}`,
        title: 'Job',
        description: 'Description',
        status: 'published',
        visibility: 'public',
        budgetModel: 'fixed',
        budgetMinMinor: 100_000,
        budgetMaxMinor: 200_000,
        currency: 'USD',
        workMode: 'remote',
        publishedAt: new Date(),
      });
      return id;
    }

    it('allows only one accepted proposal per job', async () => {
      const clientId = await insertUser();
      const jobId = await insertJob(clientId);
      const freelancerA = await insertUser();
      const freelancerB = await insertUser();

      await database.db.insert(proposals).values({
        jobId,
        clientId,
        freelancerId: freelancerA,
        status: 'accepted',
        coverLetter: 'First',
        amountMinor: 150_000,
        currency: 'USD',
        decidedAt: new Date(),
      });

      await rejectsWith(
        database.db.insert(proposals).values({
          jobId,
          clientId,
          freelancerId: freelancerB,
          status: 'accepted',
          coverLetter: 'Second',
          amountMinor: 150_000,
          currency: 'USD',
          decidedAt: new Date(),
        }),
        'proposals_one_accepted_per_job_unique',
      );
    });

    it('rejects a second proposal from the same freelancer on one job', async () => {
      const clientId = await insertUser();
      const jobId = await insertJob(clientId);
      const freelancerId = await insertUser();
      const base = {
        jobId,
        clientId,
        freelancerId,
        coverLetter: 'Letter',
        amountMinor: 100_000,
        currency: 'USD',
      };

      await database.db.insert(proposals).values(base);

      await expect(
        database.db.insert(proposals).values(base),
      ).rejects.toThrow();
    });

    it('rejects a proposal whose client does not own the job', async () => {
      const clientId = await insertUser();
      const otherClientId = await insertUser();
      const jobId = await insertJob(clientId);
      const freelancerId = await insertUser();

      await rejectsWith(
        database.db.insert(proposals).values({
          jobId,
          clientId: otherClientId,
          freelancerId,
          coverLetter: 'Letter',
          amountMinor: 100_000,
          currency: 'USD',
        }),
        'proposals_job_id_client_id_fk',
      );
    });

    it('rejects bidding on your own job', async () => {
      const clientId = await insertUser();
      const jobId = await insertJob(clientId);

      await rejectsWith(
        database.db.insert(proposals).values({
          jobId,
          clientId,
          freelancerId: clientId,
          coverLetter: 'Letter',
          amountMinor: 100_000,
          currency: 'USD',
        }),
        'proposals_client_not_freelancer_check',
      );
    });

    it('rejects an acceptance with no decision timestamp', async () => {
      const clientId = await insertUser();
      const jobId = await insertJob(clientId);
      const freelancerId = await insertUser();

      await rejectsWith(
        database.db.insert(proposals).values({
          jobId,
          clientId,
          freelancerId,
          status: 'accepted',
          coverLetter: 'Letter',
          amountMinor: 100_000,
          currency: 'USD',
        }),
        'proposals_accepted_needs_decision_check',
      );
    });

    it('rejects a zero or negative amount', async () => {
      const clientId = await insertUser();
      const jobId = await insertJob(clientId);
      const freelancerId = await insertUser();

      await rejectsWith(
        database.db.insert(proposals).values({
          jobId,
          clientId,
          freelancerId,
          coverLetter: 'Letter',
          amountMinor: 0,
          currency: 'USD',
        }),
        'proposals_amount_positive_check',
      );
    });
  });

  describe('contracts', () => {
    it('rejects a second open contract for the same job', async () => {
      const clientId = await insertUser();
      const freelancerId = await insertUser();
      const jobId = randomUUID();
      await database.db.insert(jobs).values({
        id: jobId,
        clientId,
        slug: `job-${jobId}`,
        title: 'Job',
        description: 'Description',
        status: 'published',
        visibility: 'public',
        budgetModel: 'fixed',
        currency: 'USD',
        workMode: 'remote',
        publishedAt: new Date(),
      });

      const contract = {
        jobId,
        clientId,
        freelancerId,
        title: 'Contract',
        budgetModel: 'fixed',
        agreedAmountMinor: 150_000,
        currency: 'USD',
      } as const;

      const firstProposal = randomUUID();
      await database.db.insert(proposals).values({
        id: firstProposal,
        jobId,
        clientId,
        freelancerId,
        status: 'accepted',
        coverLetter: 'Letter',
        amountMinor: 150_000,
        currency: 'USD',
        decidedAt: new Date(),
      });

      await database.db.insert(contracts).values({
        ...contract,
        proposalId: firstProposal,
        status: 'active',
        activatedAt: new Date(),
      });

      const secondProposal = randomUUID();
      await database.db.insert(proposals).values({
        id: secondProposal,
        jobId,
        clientId,
        freelancerId: await insertUser(),
        status: 'rejected',
        coverLetter: 'Letter',
        amountMinor: 150_000,
        currency: 'USD',
        decidedAt: new Date(),
      });

      await rejectsWith(
        database.db.insert(contracts).values({
          ...contract,
          proposalId: secondProposal,
          status: 'active',
          activatedAt: new Date(),
        }),
        'contracts_one_open_per_job_unique',
      );
    });

    it('allows a cancelled contract to be replaced', async () => {
      const clientId = await insertUser();
      const freelancerId = await insertUser();
      const jobId = randomUUID();
      await database.db.insert(jobs).values({
        id: jobId,
        clientId,
        slug: `job-${jobId}`,
        title: 'Job',
        description: 'Description',
        status: 'closed',
        visibility: 'public',
        budgetModel: 'fixed',
        currency: 'USD',
        workMode: 'remote',
        closedAt: new Date(),
      });

      // One proposal per freelancer per job, so the replacement contract needs
      // its own proposal from a different freelancer.
      const replacementFreelancerId = await insertUser();
      const proposalIds = [randomUUID(), randomUUID()] as const;
      for (const [index, proposalId] of proposalIds.entries()) {
        await database.db.insert(proposals).values({
          id: proposalId,
          jobId,
          clientId,
          freelancerId: index === 0 ? freelancerId : replacementFreelancerId,
          status: index === 0 ? 'accepted' : 'rejected',
          coverLetter: 'Letter',
          amountMinor: 150_000,
          currency: 'USD',
          decidedAt: new Date(),
        });
      }

      await database.db.insert(contracts).values({
        jobId,
        proposalId: proposalIds[0],
        clientId,
        freelancerId,
        status: 'cancelled',
        title: 'First attempt',
        budgetModel: 'fixed',
        agreedAmountMinor: 150_000,
        currency: 'USD',
        cancelledAt: new Date(),
      });

      await expect(
        database.db.insert(contracts).values({
          jobId,
          proposalId: proposalIds[1],
          clientId,
          freelancerId: replacementFreelancerId,
          title: 'Second attempt',
          budgetModel: 'fixed',
          agreedAmountMinor: 150_000,
          currency: 'USD',
          status: 'active',
          activatedAt: new Date(),
        }),
      ).resolves.toBeDefined();
    });

    it('rejects a completion without a completion timestamp', async () => {
      const clientId = await insertUser();
      const freelancerId = await insertUser();
      const jobId = randomUUID();
      const proposalId = randomUUID();
      await database.db.insert(jobs).values({
        id: jobId,
        clientId,
        slug: `job-${jobId}`,
        title: 'Job',
        description: 'Description',
        status: 'closed',
        visibility: 'public',
        budgetModel: 'fixed',
        currency: 'USD',
        workMode: 'remote',
        closedAt: new Date(),
      });
      await database.db.insert(proposals).values({
        id: proposalId,
        jobId,
        clientId,
        freelancerId,
        status: 'accepted',
        coverLetter: 'Letter',
        amountMinor: 150_000,
        currency: 'USD',
        decidedAt: new Date(),
      });

      await rejectsWith(
        database.db.insert(contracts).values({
          jobId,
          proposalId,
          clientId,
          freelancerId,
          status: 'completed',
          title: 'Contract',
          budgetModel: 'fixed',
          agreedAmountMinor: 150_000,
          currency: 'USD',
        }),
        'contracts_completed_at_check',
      );
    });

    describe('proposal identity', () => {
      /** A job of `clientId` with an accepted proposal from `freelancerId`. */
      async function setupAward() {
        const clientId = await insertUser();
        const freelancerId = await insertUser();
        const jobId = randomUUID();
        const proposalId = randomUUID();

        await database.db.insert(jobs).values({
          id: jobId,
          clientId,
          slug: `job-${jobId}`,
          title: 'Job',
          description: 'Description',
          status: 'closed',
          visibility: 'public',
          budgetModel: 'fixed',
          currency: 'USD',
          workMode: 'remote',
          closedAt: new Date(),
        });

        await database.db.insert(proposals).values({
          id: proposalId,
          jobId,
          clientId,
          freelancerId,
          status: 'accepted',
          coverLetter: 'Letter',
          amountMinor: 150_000,
          currency: 'USD',
          decidedAt: new Date(),
        });

        return { clientId, freelancerId, jobId, proposalId };
      }

      it('accepts a contract whose proposal, job and freelancer all agree', async () => {
        const { clientId, freelancerId, jobId, proposalId } =
          await setupAward();

        await expect(
          database.db.insert(contracts).values({
            jobId,
            proposalId,
            clientId,
            freelancerId,
            status: 'active',
            title: 'Contract',
            budgetModel: 'fixed',
            agreedAmountMinor: 150_000,
            currency: 'USD',
            activatedAt: new Date(),
          }),
        ).resolves.toBeDefined();
      });

      it('rejects a proposal belonging to a different job', async () => {
        const { clientId, freelancerId, proposalId } = await setupAward();

        // A second job for the same client, so the contract's own job/client
        // composite FK against `jobs(id, client_id)` still holds. Only the
        // proposal is wrong.
        const otherJobId = randomUUID();
        await database.db.insert(jobs).values({
          id: otherJobId,
          clientId,
          slug: `job-${otherJobId}`,
          title: 'Other job',
          description: 'Description',
          status: 'closed',
          visibility: 'public',
          budgetModel: 'fixed',
          currency: 'USD',
          workMode: 'remote',
          closedAt: new Date(),
        });

        await rejectsWith(
          database.db.insert(contracts).values({
            jobId: otherJobId,
            proposalId,
            clientId,
            freelancerId,
            status: 'active',
            title: 'Contract',
            budgetModel: 'fixed',
            agreedAmountMinor: 150_000,
            currency: 'USD',
            activatedAt: new Date(),
          }),
          'contracts_proposal_id_job_id_fk',
        );
      });

      it('rejects a contract whose freelancer is not the proposal freelancer', async () => {
        const { clientId, jobId, proposalId } = await setupAward();
        const otherFreelancerId = await insertUser();

        await rejectsWith(
          database.db.insert(contracts).values({
            jobId,
            proposalId,
            clientId,
            freelancerId: otherFreelancerId,
            status: 'active',
            title: 'Contract',
            budgetModel: 'fixed',
            agreedAmountMinor: 150_000,
            currency: 'USD',
            activatedAt: new Date(),
          }),
          'contracts_proposal_id_freelancer_id_fk',
        );
      });

      it('rejects a contract whose client is not the job owner', async () => {
        const { freelancerId, jobId, proposalId } = await setupAward();
        const otherClientId = await insertUser();

        await rejectsWith(
          database.db.insert(contracts).values({
            jobId,
            proposalId,
            clientId: otherClientId,
            freelancerId,
            status: 'active',
            title: 'Contract',
            budgetModel: 'fixed',
            agreedAmountMinor: 150_000,
            currency: 'USD',
            activatedAt: new Date(),
          }),
          'contracts_job_id_client_id_fk',
        );
      });

      it('rejects a client acting as its own freelancer', async () => {
        const { clientId, jobId, proposalId } = await setupAward();

        await rejectsWith(
          database.db.insert(contracts).values({
            jobId,
            proposalId,
            clientId,
            freelancerId: clientId,
            status: 'active',
            title: 'Contract',
            budgetModel: 'fixed',
            agreedAmountMinor: 150_000,
            currency: 'USD',
            activatedAt: new Date(),
          }),
          'contracts_client_not_freelancer_check',
        );
      });
    });
  });

  describe('jobs', () => {
    it('rejects a published job with no publication timestamp', async () => {
      const clientId = await insertUser();

      await rejectsWith(
        database.db.insert(jobs).values({
          clientId,
          slug: `job-${randomUUID()}`,
          title: 'Job',
          description: 'Description',
          status: 'published',
          visibility: 'public',
          budgetModel: 'hourly',
          currency: 'USD',
          workMode: 'remote',
        }),
        'jobs_published_at_check',
      );
    });

    it('rejects a budget range that runs backwards', async () => {
      const clientId = await insertUser();

      await rejectsWith(
        database.db.insert(jobs).values({
          clientId,
          slug: `job-${randomUUID()}`,
          title: 'Job',
          description: 'Description',
          status: 'draft',
          visibility: 'private',
          budgetModel: 'fixed',
          budgetMinMinor: 300_000,
          budgetMaxMinor: 100_000,
          currency: 'USD',
          workMode: 'remote',
        }),
        'jobs_budget_range_check',
      );
    });

    it('rejects an unknown currency', async () => {
      const clientId = await insertUser();

      await rejectsWith(
        database.db.insert(jobs).values({
          clientId,
          slug: `job-${randomUUID()}`,
          title: 'Job',
          description: 'Description',
          status: 'draft',
          visibility: 'private',
          budgetModel: 'fixed',
          currency: 'XBT',
          workMode: 'remote',
        }),
        'jobs_currency_check',
      );
    });

    it('rejects a job pointing at an unknown category', async () => {
      const clientId = await insertUser();

      await rejectsWith(
        database.db.insert(jobs).values({
          clientId,
          categoryId: randomUUID(),
          slug: `job-${randomUUID()}`,
          title: 'Job',
          description: 'Description',
          status: 'draft',
          visibility: 'private',
          budgetModel: 'fixed',
          currency: 'USD',
          workMode: 'remote',
        }),
        'jobs_category_id_categories_id_fk',
      );
    });

    it('keeps a category that is still filing a job', async () => {
      const clientId = await insertUser();
      const categoryId = randomUUID();
      await database.db.insert(categories).values({
        id: categoryId,
        slug: `category-${categoryId}`,
        name: 'Engineering',
      });
      await database.db.insert(jobs).values({
        clientId,
        categoryId,
        slug: `job-${randomUUID()}`,
        title: 'Job',
        description: 'Description',
        status: 'draft',
        visibility: 'private',
        budgetModel: 'fixed',
        currency: 'USD',
        workMode: 'remote',
      });

      await expect(
        database.db.delete(categories).where(eq(categories.id, categoryId)),
      ).rejects.toThrow();
    });
  });

  describe('freelancer profiles', () => {
    it('rejects a rate with no currency', async () => {
      const userId = await insertUser();

      await rejectsWith(
        database.db.insert(freelancerProfiles).values({
          userId,
          headline: 'Headline',
          hourlyRateMinor: 5_000,
          availability: 'available',
          timezone: 'UTC',
        }),
        'freelancer_profiles_rate_currency_pair_check',
      );
    });

    it('allows a profile with neither rate nor currency', async () => {
      const userId = await insertUser();

      await expect(
        database.db.insert(freelancerProfiles).values({
          userId,
          headline: 'Headline',
          availability: 'limited',
          timezone: 'UTC',
        }),
      ).resolves.toBeDefined();
    });

    it('rejects a negative rate', async () => {
      const userId = await insertUser();

      await rejectsWith(
        database.db.insert(freelancerProfiles).values({
          userId,
          headline: 'Headline',
          hourlyRateMinor: -1,
          currency: 'USD',
          availability: 'available',
          timezone: 'UTC',
        }),
        'freelancer_profiles_hourly_rate_check',
      );
    });
  });

  describe('taxonomy', () => {
    it('rejects a category that is its own parent', async () => {
      const id = randomUUID();

      await rejectsWith(
        database.db
          .insert(categories)
          .values({ id, slug: 'loop', name: 'Loop', parentId: id }),
        'categories_parent_not_self_check',
      );
    });

    it('keeps a skill in use when its category is deleted', async () => {
      const categoryId = randomUUID();
      await database.db.insert(categories).values({
        id: categoryId,
        slug: 'engineering',
        name: 'Engineering',
      });
      await database.db.insert(skills).values({
        id: randomUUID(),
        slug: 'typescript',
        name: 'TypeScript',
        categoryId,
      });

      await expect(
        database.db.delete(categories).where(eq(categories.id, categoryId)),
      ).rejects.toThrow();
    });
  });

  describe('milestone deliveries', () => {
    it('rejects a second delivery claiming the same revision', async () => {
      const ids = await seedContractForMilestones(database);

      await database.db.insert(milestoneDeliveries).values({
        milestoneId: ids,
        revisionNumber: 1,
        note: 'First',
      });

      await rejectsWith(
        database.db.insert(milestoneDeliveries).values({
          milestoneId: ids,
          revisionNumber: 1,
          note: 'Also first',
        }),
        'milestone_deliveries_milestone_revision_unique',
      );
    });

    it('rejects a verdict with no review timestamp', async () => {
      const milestoneId = await seedContractForMilestones(database);

      await rejectsWith(
        database.db.insert(milestoneDeliveries).values({
          milestoneId,
          revisionNumber: 1,
          outcome: 'approved',
        }),
        'milestone_deliveries_review_pair_check',
      );
    });

    it('rejects a revision number below the first', async () => {
      const milestoneId = await seedContractForMilestones(database);

      await expect(
        database.db.insert(milestoneDeliveries).values({
          milestoneId,
          revisionNumber: 0,
        }),
      ).rejects.toThrow();
    });

    it('caps a milestone revision budget above the shared maximum', async () => {
      await runSeed(database);
      const seeded = await database.db
        .select({ id: milestones.id })
        .from(milestones)
        .orderBy(milestones.position);

      await expect(
        database.db
          .update(milestones)
          .set({ maxRevisions: MAX_ALLOWED_REVISIONS + 1 })
          .where(eq(milestones.id, seeded[0]?.id ?? '')),
      ).rejects.toThrow();
    });
  });

  describe('reviews', () => {
    it('rejects a rating outside 1..5', async () => {
      const ids = await seedCompletedContract(database);

      await rejectsWith(
        database.db.insert(reviews).values({
          contractId: ids.contractId,
          authorId: ids.clientId,
          subjectId: ids.freelancerId,
          rating: 6,
        }),
        'reviews_rating_check',
      );
    });

    it('allows only one review per party per contract', async () => {
      // Its own contract rather than a seeded one: the seed already reviews the
      // contracts it completes, and the first insert has to succeed for the
      // second one to be the duplicate this test is about.
      const clientId = await insertUser();
      const freelancerId = await insertUser();
      const jobId = randomUUID();
      await database.db.insert(jobs).values({
        id: jobId,
        clientId,
        slug: `job-${jobId}`,
        title: 'Job',
        description: 'Description',
        status: 'published',
        visibility: 'public',
        budgetModel: 'fixed',
        currency: 'USD',
        workMode: 'remote',
        publishedAt: new Date(),
      });

      const proposalId = randomUUID();
      await database.db.insert(proposals).values({
        id: proposalId,
        jobId,
        clientId,
        freelancerId,
        status: 'accepted',
        coverLetter: 'Letter',
        amountMinor: 150_000,
        currency: 'USD',
        decidedAt: new Date(),
      });

      const contractId = randomUUID();
      await database.db.insert(contracts).values({
        id: contractId,
        jobId,
        proposalId,
        clientId,
        freelancerId,
        status: 'completed',
        title: 'Contract',
        budgetModel: 'fixed',
        agreedAmountMinor: 150_000,
        currency: 'USD',
        completedAt: new Date(),
      });

      const review = {
        contractId,
        authorId: clientId,
        subjectId: freelancerId,
        rating: 5,
      };

      await database.db.insert(reviews).values(review);

      await rejectsWith(
        database.db.insert(reviews).values(review),
        'reviews_contract_id_author_id_unique',
      );
    });

    it('rejects reviewing yourself', async () => {
      const ids = await seedCompletedContract(database);

      await rejectsWith(
        database.db.insert(reviews).values({
          contractId: ids.contractId,
          authorId: ids.clientId,
          subjectId: ids.clientId,
          rating: 5,
        }),
        'reviews_author_not_subject_check',
      );
    });
  });

  describe('auth tables', () => {
    it('accepts a Better Auth shaped credential row', async () => {
      const userId = await insertUser();
      const accountId = randomUUID();

      await database.db.insert(authAccounts).values({
        id: accountId,
        accountId: 'credential-account',
        providerId: 'credential',
        userId,
        password: 'scrypt$hash',
      });
      await database.db.insert(authSessions).values({
        token: 'token-value',
        expiresAt: new Date(Date.now() + 60_000),
        userId,
      });
      await database.db.insert(authVerifications).values({
        identifier: 'person@wervi.test',
        value: 'verification-token',
        expiresAt: new Date(Date.now() + 60_000),
      });

      const sessions = await database.db
        .select({ token: authSessions.token })
        .from(authSessions)
        .where(eq(authSessions.userId, userId));

      expect(sessions).toHaveLength(1);
    });

    it('removes sessions when the user is deleted', async () => {
      const userId = await insertUser();
      await database.db.insert(authSessions).values({
        token: 'token-value',
        expiresAt: new Date(Date.now() + 60_000),
        userId,
      });

      await database.db.delete(users).where(eq(users.id, userId));

      const remaining = await database.db.select().from(authSessions);
      expect(remaining).toHaveLength(0);
    });
  });

  describe('audit log', () => {
    it('keeps entries when the actor is deleted', async () => {
      const actorId = await insertUser();
      const entityId = randomUUID();

      await database.db.insert(auditLog).values({
        entityType: 'job',
        entityId,
        action: 'job.published',
        actorUserId: actorId,
      });

      await database.db.delete(users).where(eq(users.id, actorId));

      const entries = await database.db.select().from(auditLog);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.actorUserId).toBeNull();
    });

    it('keeps entries for an entity that no longer exists', async () => {
      const entityId = randomUUID();
      await database.db.insert(auditLog).values({
        entityType: 'job',
        entityId,
        action: 'job.deleted',
      });

      const entries = await database.db.select().from(auditLog);
      expect(entries).toHaveLength(1);
    });
  });

  describe('updated_at triggers', () => {
    it('advances updated_at on a bare update', async () => {
      const userId = await insertUser({
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      });

      const before = await database.db
        .select({ updatedAt: users.updatedAt })
        .from(users)
        .where(eq(users.id, userId));
      expect(before[0]?.updatedAt.getTime()).toBeCloseTo(
        new Date('2024-01-01T00:00:00Z').getTime(),
        -3,
      );

      await database.db
        .update(users)
        .set({ name: 'Renamed' })
        .where(eq(users.id, userId));

      const after = await database.db
        .select({ updatedAt: users.updatedAt })
        .from(users)
        .where(eq(users.id, userId));
      expect(after[0]?.updatedAt?.getTime()).toBeGreaterThan(
        new Date('2024-01-01T00:00:00Z').getTime(),
      );
    });
  });
});

/**
 * Runs the seed and returns the id of a milestone on the seeded active
 * contract, optionally with an overridden revision budget.
 */
async function seedContractForMilestones(database: Database): Promise<string> {
  await runSeed(database);
  const seeded = await database.db
    .select({ id: milestones.id })
    .from(milestones)
    .orderBy(milestones.position);

  const chosen = seeded[1];
  if (chosen === undefined) {
    throw new Error('seed produced no milestones');
  }
  return chosen.id;
}

async function seedCompletedContract(
  database: Database,
): Promise<{ contractId: string; clientId: string; freelancerId: string }> {
  await runSeed(database);
  const seeded = await database.db
    .select()
    .from(contracts)
    .where(eq(contracts.status, 'completed'));

  const contract = seeded[0];
  if (contract === undefined) {
    throw new Error('seed produced no completed contract');
  }

  return {
    contractId: contract.id,
    clientId: contract.clientId,
    freelancerId: contract.freelancerId,
  };
}

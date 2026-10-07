import { eq } from 'drizzle-orm';
import type { AnyPgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDatabase,
  resetDatabase,
  resolveTestDatabaseUrl,
  setupDatabase,
} from '../testing/index.js';
import { runSeed, seedIds } from './index.js';
import { users } from '../schema/auth/index.js';
import { categories, skills } from '../schema/taxonomy/index.js';
import {
  clientProfiles,
  freelancerProfiles,
} from '../schema/profiles/index.js';
import { jobs } from '../schema/jobs/index.js';
import { proposals } from '../schema/proposals/index.js';
import { contracts } from '../schema/contracts/index.js';
import { milestones, milestoneDeliveries } from '../schema/milestones/index.js';
import { reviews } from '../schema/reviews/index.js';
import { auditLog } from '../schema/audit/auditLog.js';
import type { Database } from '../client.js';

/**
 * The seed is the fastest way to see the schema's rules applied to realistic
 * data, so it gets its own suite: if the seed stops satisfying a constraint,
 * that is a schema or seed change and it should fail here first.
 */
const target = resolveTestDatabaseUrl();

describe.skipIf(target.url === undefined)('seed', () => {
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

  it('satisfies every constraint, which the insert alone proves', async () => {
    await runSeed(database);

    expect(await count(database, jobs)).toBeGreaterThan(0);
  });

  it('is idempotent: a second run leaves the same rows', async () => {
    await runSeed(database);
    const firstUsers = await database.db.select().from(users);
    const firstProposals = await database.db.select().from(proposals);

    await runSeed(database);

    expect(await count(database, users)).toBe(firstUsers.length);
    expect(await count(database, proposals)).toBe(firstProposals.length);
    expect(
      (await database.db.select({ id: users.id }).from(users))
        .map((r) => r.id)
        .sort(),
    ).toEqual(firstUsers.map((row) => row.id).sort());
  });

  it('seeds one accepted proposal per job', async () => {
    await runSeed(database);

    const accepted = await database.db
      .select({ jobId: proposals.jobId })
      .from(proposals)
      .where(eq(proposals.status, 'accepted'));

    const jobIds = accepted.map((row) => row.jobId);
    expect(new Set(jobIds).size).toBe(jobIds.length);
  });

  it('seeds a draft job with no publication timestamp', async () => {
    await runSeed(database);

    const draft = await database.db
      .select()
      .from(jobs)
      .where(eq(jobs.status, 'draft'));

    expect(draft).toHaveLength(1);
    expect(draft[0]?.publishedAt).toBeNull();
  });

  it('seeds a freelancer with no listed rate', async () => {
    await runSeed(database);

    const rows = await database.db
      .select()
      .from(freelancerProfiles)
      .where(eq(freelancerProfiles.userId, seedIds.users.freelancerB));

    expect(rows[0]?.hourlyRateMinor).toBeNull();
    expect(rows[0]?.currency).toBeNull();
  });

  it('seeds a milestone with two delivery revisions', async () => {
    await runSeed(database);

    // Pinned rather than picked as "the second row by position": two seeded
    // milestones share position 1 (one per contract), so `order by position`
    // cannot say which row is second — and the deliveries belong to the pinned
    // one, not to either of the tied rows.
    const seeded = await database.db
      .select({ id: milestones.id })
      .from(milestones)
      .where(eq(milestones.id, seedIds.milestones.second));
    const milestoneId = seeded[0]?.id ?? '';
    expect(milestoneId).not.toBe('');

    const deliveries = await database.db
      .select({ revisionNumber: milestoneDeliveries.revisionNumber })
      .from(milestoneDeliveries)
      .where(eq(milestoneDeliveries.milestoneId, milestoneId))
      .orderBy(milestoneDeliveries.revisionNumber);

    expect(deliveries.map((row) => row.revisionNumber)).toEqual([1, 2]);
  });

  it('covers every core table', async () => {
    await runSeed(database);

    const counts = await Promise.all([
      count(database, users),
      count(database, categories),
      count(database, skills),
      count(database, freelancerProfiles),
      count(database, clientProfiles),
      count(database, jobs),
      count(database, proposals),
      count(database, contracts),
      count(database, milestones),
      count(database, milestoneDeliveries),
      count(database, reviews),
      count(database, auditLog),
    ]);

    for (const value of counts) {
      expect(value).toBeGreaterThan(0);
    }
  });
});

async function count(database: Database, table: AnyPgTable): Promise<number> {
  const rows = await database.db.select().from(table);
  return rows.length;
}

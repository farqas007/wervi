import type { jobSkills } from '../schema/jobs/jobSkills.js';
import type { jobs } from '../schema/jobs/jobs.js';
import type { proposals } from '../schema/proposals/proposals.js';
import type { contracts } from '../schema/contracts/contracts.js';
import type { milestoneDeliveries } from '../schema/milestones/deliveries.js';
import type { milestones } from '../schema/milestones/milestones.js';
import type { reviews } from '../schema/reviews/reviews.js';
import type { auditLog } from '../schema/audit/auditLog.js';
import { SEED_TIMESTAMP, seedIds } from './ids.js';

/**
 * Jobs, bids, contracts, milestones and reviews, as one coherent story.
 *
 * The rows exist to exercise the rules the schema enforces, so the seed
 * deliberately includes:
 *
 *  - an accepted proposal and its contract (the happy path through Phase 10),
 *  - a second accepted-candidate proposal on the same job, so the partial
 *    unique index on accepted proposals is not taken on trust,
 *  - a job in `draft`, which must have no `published_at`,
 *  - a freelancer with no hourly rate, which must satisfy the rate/currency
 *    pairing constraint,
 *  - a milestone that went through two delivery revisions, so the
 *    `(milestone_id, revision_number)` uniqueness has something to hold.
 *
 * Seeds are not supposed to be a demo of everything at once; they are supposed
 * to make the interesting constraints visible.
 */
export function seedMarketplace(): {
  jobs: (typeof jobs.$inferInsert)[];
  jobSkills: (typeof jobSkills.$inferInsert)[];
  proposals: (typeof proposals.$inferInsert)[];
  contracts: (typeof contracts.$inferInsert)[];
  milestones: (typeof milestones.$inferInsert)[];
  milestoneDeliveries: (typeof milestoneDeliveries.$inferInsert)[];
  reviews: (typeof reviews.$inferInsert)[];
  auditLog: (typeof auditLog.$inferInsert)[];
} {
  return {
    jobs: [
      {
        id: seedIds.jobs.dashboard,
        clientId: seedIds.users.client,
        slug: 'analytics-dashboard-rebuild',
        categoryId: seedIds.categories.engineering,
        title: 'Rebuild our analytics dashboard',
        description:
          'Replace a jQuery front end over a Postgres reporting schema. Data volume is small; correctness is not negotiable.',
        status: 'published',
        visibility: 'public',
        budgetModel: 'fixed',
        budgetMinMinor: 2_400_000,
        budgetMaxMinor: 3_200_000,
        currency: 'USD',
        experienceLevel: 'senior',
        duration: 'one_to_three_months',
        workMode: 'remote',
        countryCode: 'US',
        proposalCount: 3,
        publishedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.jobs.mobileApp,
        clientId: seedIds.users.client,
        slug: 'mobile-app-design-system',
        categoryId: seedIds.categories.design,
        title: 'Design system for our mobile app',
        description: 'Component library and tokens for two platforms.',
        status: 'published',
        visibility: 'public',
        budgetModel: 'hourly',
        currency: 'USD',
        experienceLevel: 'intermediate',
        duration: 'less_than_30_days',
        workMode: 'remote',
        proposalCount: 1,
        publishedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.jobs.apiHardening,
        clientId: seedIds.users.client,
        slug: 'api-hardening-and-docs',
        categoryId: seedIds.categories.writing,
        title: 'Harden our public API',
        description:
          'Rate limiting, typed errors, and documentation that matches.',
        status: 'closed',
        visibility: 'public',
        budgetModel: 'fixed',
        budgetMinMinor: 800_000,
        budgetMaxMinor: 1_100_000,
        currency: 'USD',
        experienceLevel: 'senior',
        duration: 'one_to_three_months',
        workMode: 'remote',
        proposalCount: 1,
        publishedAt: SEED_TIMESTAMP,
        closedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        // Draft: never published, so `published_at` stays null, which is what
        // the jobs_published_at_check constraint requires.
        id: seedIds.jobs.brandGuidelines,
        clientId: seedIds.users.client,
        slug: 'brand-guidelines',
        categoryId: seedIds.categories.design,
        title: 'Brand guidelines for a new product',
        description: 'Not ready to publish; do not show this to freelancers.',
        status: 'draft',
        visibility: 'private',
        budgetModel: 'hourly',
        currency: 'EUR',
        duration: 'less_than_30_days',
        workMode: 'remote',
        proposalCount: 0,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    ],
    jobSkills: [
      {
        jobId: seedIds.jobs.dashboard,
        skillId: seedIds.skills.typescript,
        isRequired: true,
      },
      {
        jobId: seedIds.jobs.dashboard,
        skillId: seedIds.skills.postgres,
        isRequired: true,
      },
      {
        jobId: seedIds.jobs.dashboard,
        skillId: seedIds.skills.react,
        isRequired: false,
      },
      {
        jobId: seedIds.jobs.mobileApp,
        skillId: seedIds.skills.figure,
        isRequired: true,
      },
      {
        jobId: seedIds.jobs.apiHardening,
        skillId: seedIds.skills.technicalWriting,
        isRequired: true,
      },
    ],
    proposals: [
      {
        id: seedIds.proposals.acceptedDashboard,
        jobId: seedIds.jobs.dashboard,
        clientId: seedIds.users.client,
        freelancerId: seedIds.users.freelancerA,
        status: 'accepted',
        coverLetter:
          'I have rebuilt two dashboards over schemas exactly like this one, and I would start by writing the report queries down.',
        amountMinor: 2_800_000,
        currency: 'USD',
        deliveryDays: 75,
        revision: 2,
        clientNote: 'Strongest fit. Start next week.',
        submittedAt: SEED_TIMESTAMP,
        shortlistedAt: SEED_TIMESTAMP,
        decidedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.proposals.shortlistedDashboard,
        jobId: seedIds.jobs.dashboard,
        clientId: seedIds.users.client,
        freelancerId: seedIds.users.freelancerB,
        status: 'shortlisted',
        coverLetter:
          'I would pair on the interface layer; you own the queries.',
        amountMinor: 1_900_000,
        currency: 'USD',
        deliveryDays: 90,
        submittedAt: SEED_TIMESTAMP,
        shortlistedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        // A second candidate on a job that already has an accepted proposal:
        // the partial unique index forbids a *second* acceptance, not a second
        // bid, and this row is what proves the difference.
        id: seedIds.proposals.submittedDashboard,
        jobId: seedIds.jobs.dashboard,
        clientId: seedIds.users.client,
        freelancerId: seedIds.users.freelancerC,
        status: 'submitted',
        coverLetter: 'Available from next month; I have shipped two of these.',
        amountMinor: 2_600_000,
        currency: 'USD',
        deliveryDays: 60,
        submittedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.proposals.acceptedApiHardening,
        jobId: seedIds.jobs.apiHardening,
        clientId: seedIds.users.client,
        freelancerId: seedIds.users.freelancerA,
        status: 'accepted',
        coverLetter: 'Rate limiting plus typed errors is a fortnight of work.',
        amountMinor: 900_000,
        currency: 'USD',
        deliveryDays: 20,
        submittedAt: SEED_TIMESTAMP,
        decidedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.proposals.rejectedMobileApp,
        jobId: seedIds.jobs.mobileApp,
        clientId: seedIds.users.client,
        freelancerId: seedIds.users.freelancerB,
        status: 'rejected',
        coverLetter: 'I can hand you a component library in a month.',
        amountMinor: 600_000,
        currency: 'USD',
        deliveryDays: 30,
        rejectionReason:
          'Went with a portfolio that matched the brief more closely.',
        submittedAt: SEED_TIMESTAMP,
        decidedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    ],
    contracts: [
      {
        id: seedIds.contracts.dashboard,
        jobId: seedIds.jobs.dashboard,
        proposalId: seedIds.proposals.acceptedDashboard,
        clientId: seedIds.users.client,
        freelancerId: seedIds.users.freelancerA,
        status: 'active',
        title: 'Analytics dashboard rebuild',
        scope: 'Report queries, a typed API and the dashboard front end.',
        budgetModel: 'fixed',
        agreedAmountMinor: 2_800_000,
        currency: 'USD',
        startsOn: '2024-02-01',
        endsOn: '2024-04-15',
        activatedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.contracts.apiHardening,
        jobId: seedIds.jobs.apiHardening,
        proposalId: seedIds.proposals.acceptedApiHardening,
        clientId: seedIds.users.client,
        freelancerId: seedIds.users.freelancerA,
        status: 'completed',
        title: 'API hardening',
        scope: 'Rate limiting and error taxonomy only.',
        budgetModel: 'fixed',
        agreedAmountMinor: 900_000,
        currency: 'USD',
        startsOn: '2024-01-15',
        endsOn: '2024-02-01',
        activatedAt: SEED_TIMESTAMP,
        completedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    ],
    milestones: [
      {
        id: seedIds.milestones.first,
        contractId: seedIds.contracts.dashboard,
        title: 'Report query layer',
        description: 'Move every report out of the legacy views.',
        position: 1,
        amountMinor: 1_000_000,
        currency: 'USD',
        status: 'released',
        dueDate: '2024-02-15',
        maxRevisions: 3,
        fundedAt: SEED_TIMESTAMP,
        submittedAt: SEED_TIMESTAMP,
        acceptedAt: SEED_TIMESTAMP,
        releasedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.milestones.second,
        contractId: seedIds.contracts.dashboard,
        title: 'Typed API surface',
        position: 2,
        amountMinor: 900_000,
        currency: 'USD',
        status: 'submitted',
        dueDate: '2024-03-15',
        maxRevisions: 2,
        fundedAt: SEED_TIMESTAMP,
        submittedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.milestones.third,
        contractId: seedIds.contracts.dashboard,
        title: 'Dashboard front end',
        position: 3,
        amountMinor: 900_000,
        currency: 'USD',
        status: 'planned',
        dueDate: '2024-04-15',
        maxRevisions: 3,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.milestones.fourth,
        contractId: seedIds.contracts.apiHardening,
        title: 'Rate limiting',
        position: 1,
        amountMinor: 450_000,
        currency: 'USD',
        status: 'released',
        maxRevisions: 1,
        fundedAt: SEED_TIMESTAMP,
        submittedAt: SEED_TIMESTAMP,
        acceptedAt: SEED_TIMESTAMP,
        releasedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    ],
    milestoneDeliveries: [
      {
        id: seedIds.deliveries.firstRevision,
        milestoneId: seedIds.milestones.second,
        revisionNumber: 1,
        note: 'First pass at the error taxonomy.',
        submittedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
      },
      {
        id: seedIds.deliveries.secondRevision,
        milestoneId: seedIds.milestones.second,
        revisionNumber: 2,
        note: 'Revised after feedback.',
        submittedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
      },
    ],
    reviews: [
      {
        id: seedIds.reviews.clientToFreelancer,
        contractId: seedIds.contracts.apiHardening,
        authorId: seedIds.users.client,
        subjectId: seedIds.users.freelancerA,
        rating: 5,
        title: 'Exactly what we asked for',
        body: 'Clear communication and the work landed on time.',
        status: 'published',
        editableUntil: null,
        publishedAt: SEED_TIMESTAMP,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
      {
        // Not public yet, so it carries no publication timestamp.
        id: seedIds.reviews.freelancerToClient,
        contractId: seedIds.contracts.apiHardening,
        authorId: seedIds.users.freelancerA,
        subjectId: seedIds.users.client,
        rating: 5,
        status: 'pending_edit',
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    ],
    auditLog: [
      {
        entityType: 'proposal',
        entityId: seedIds.proposals.acceptedDashboard,
        action: 'proposal.accepted',
        actorUserId: seedIds.users.client,
        requestId: 'seed-0001',
        data: {
          jobId: seedIds.jobs.dashboard,
          contractId: seedIds.contracts.dashboard,
        },
        createdAt: SEED_TIMESTAMP,
      },
      {
        entityType: 'milestone',
        entityId: seedIds.milestones.first,
        action: 'milestone.released',
        actorUserId: seedIds.users.client,
        requestId: 'seed-0002',
        data: { amountMinor: 1_000_000, currency: 'USD' },
        createdAt: SEED_TIMESTAMP,
      },
    ],
  };
}

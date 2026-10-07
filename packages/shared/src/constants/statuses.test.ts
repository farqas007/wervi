import { describe, expect, it } from 'vitest';
import {
  CONTRACT_STATUS_TRANSITIONS,
  JOB_STATUS_TRANSITIONS,
  InvalidTransitionError,
  MILESTONE_STATUS_TRANSITIONS,
  PROPOSAL_STATUS_TRANSITIONS,
  USER_STATUS_TRANSITIONS,
  assertTransition,
  canTransition,
  type ContractStatus,
  type JobStatus,
  type MilestoneStatus,
  type ProposalStatus,
  type TransitionMap,
  type UserStatus,
} from './statuses.js';

describe('canTransition', () => {
  it('allows a job to be published from a draft', () => {
    expect(
      canTransition<JobStatus>(JOB_STATUS_TRANSITIONS, 'draft', 'published'),
    ).toBe(true);
  });

  it('refuses to reopen a closed job', () => {
    expect(
      canTransition<JobStatus>(JOB_STATUS_TRANSITIONS, 'closed', 'published'),
    ).toBe(false);
  });

  it('treats an accepted proposal as terminal', () => {
    expect(
      canTransition<ProposalStatus>(
        PROPOSAL_STATUS_TRANSITIONS,
        'accepted',
        'rejected',
      ),
    ).toBe(false);
  });

  it('allows a disputed contract to return to active work', () => {
    expect(
      canTransition<ContractStatus>(
        CONTRACT_STATUS_TRANSITIONS,
        'disputed',
        'active',
      ),
    ).toBe(true);
  });

  it('refuses delivery of an unfunded milestone', () => {
    expect(
      canTransition<MilestoneStatus>(
        MILESTONE_STATUS_TRANSITIONS,
        'planned',
        'submitted',
      ),
    ).toBe(false);
  });

  it('never allows a suspended account back to pending', () => {
    expect(
      canTransition<UserStatus>(
        USER_STATUS_TRANSITIONS,
        'suspended',
        'pending',
      ),
    ).toBe(false);
  });
});

describe('transition maps', () => {
  const maps: readonly (TransitionMap<string> & { [key: string]: unknown })[] =
    [
      USER_STATUS_TRANSITIONS,
      JOB_STATUS_TRANSITIONS,
      PROPOSAL_STATUS_TRANSITIONS,
      CONTRACT_STATUS_TRANSITIONS,
      MILESTONE_STATUS_TRANSITIONS,
    ];

  it('never lists a status as transitioning to itself', () => {
    for (const map of maps) {
      for (const [from, targets] of Object.entries(map)) {
        expect(targets).not.toContain(from);
      }
    }
  });

  it('only lists statuses that exist in the same map', () => {
    for (const map of maps) {
      const statuses = new Set(Object.keys(map));
      for (const targets of Object.values(map)) {
        for (const target of targets) {
          expect(statuses.has(target)).toBe(true);
        }
      }
    }
  });
});

describe('assertTransition', () => {
  it('passes silently for an allowed transition', () => {
    expect(() =>
      assertTransition('Job', JOB_STATUS_TRANSITIONS, 'published', 'paused'),
    ).not.toThrow();
  });

  it('reports both ends of a rejected transition', () => {
    try {
      assertTransition('Job', JOB_STATUS_TRANSITIONS, 'closed', 'draft');
      expect.unreachable('expected InvalidTransitionError');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTransitionError);
      const failure = error as InvalidTransitionError;
      expect(failure.entity).toBe('Job');
      expect(failure.from).toBe('closed');
      expect(failure.to).toBe('draft');
      expect(failure.message).toContain('"closed"');
      expect(failure.message).toContain('"draft"');
    }
  });
});

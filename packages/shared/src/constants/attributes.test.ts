import { describe, expect, it } from 'vitest';
import {
  AVAILABILITY,
  BUDGET_MODELS,
  CONTRACT_DURATIONS,
  DELIVERY_OUTCOMES,
  EXPERIENCE_LEVELS,
  JOB_VISIBILITIES,
  LANGUAGE_PROFICIENCIES,
  MAX_ALLOWED_REVISIONS,
  MAX_REVIEW_RATING,
  MIN_REVIEW_RATING,
  PROFILE_VISIBILITIES,
  SKILL_PROFICIENCIES,
  WORK_MODES,
} from './attributes.js';
import {
  CONTRACT_STATUSES,
  JOB_STATUSES,
  MILESTONE_STATUSES,
  PROPOSAL_STATUSES,
  REVIEW_STATUSES,
  USER_STATUSES,
} from './statuses.js';

const VOCABULARIES: Record<string, readonly string[]> = {
  AVAILABILITY,
  BUDGET_MODELS,
  CONTRACT_DURATIONS,
  DELIVERY_OUTCOMES,
  EXPERIENCE_LEVELS,
  JOB_VISIBILITIES,
  LANGUAGE_PROFICIENCIES,
  PROFILE_VISIBILITIES,
  SKILL_PROFICIENCIES,
  WORK_MODES,
  CONTRACT_STATUSES,
  JOB_STATUSES,
  MILESTONE_STATUSES,
  PROPOSAL_STATUSES,
  REVIEW_STATUSES,
  USER_STATUSES,
};

describe('domain vocabularies', () => {
  it.each(Object.entries(VOCABULARIES))(
    '%s holds no duplicate values',
    (_name, values) => {
      expect(new Set(values).size).toBe(values.length);
    },
  );

  it.each(Object.entries(VOCABULARIES))(
    '%s uses lowercase snake_case values',
    (_name, values) => {
      for (const value of values) {
        expect(value).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    },
  );

  it('keeps every status list non-empty', () => {
    for (const [name, values] of Object.entries(VOCABULARIES)) {
      expect(values.length, name).toBeGreaterThan(0);
    }
  });
});

describe('bounded numbers', () => {
  it('keeps the revision ceiling above the starting revision', () => {
    expect(MAX_ALLOWED_REVISIONS).toBeGreaterThan(0);
  });

  it('keeps the review rating a five point scale', () => {
    expect(MIN_REVIEW_RATING).toBe(1);
    expect(MAX_REVIEW_RATING).toBe(5);
  });
});

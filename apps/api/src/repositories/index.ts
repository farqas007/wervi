/**
 * Storage boundary for the API.
 *
 * Services depend on the interfaces here and receive a repository instance from
 * the composition root, which keeps Drizzle out of the service layer and makes
 * a test double a one-line change.
 */

export type {
  CreateUserInput,
  CreateUserResult,
  UserRecord,
  UsersRepository,
} from './users.repository.js';

export { DrizzleUsersRepository } from './drizzle-users.repository.js';

export type {
  ClientProfileRecord,
  ClientProfileWrite,
  FreelancerProfileRecord,
  FreelancerProfileWrite,
  ProfileLanguageRecord,
  ProfileSkillRecord,
  ProfilesRepository,
  ReplaceLanguageItem,
  ReplaceSkillItem,
} from './profiles.repository.js';

export { DrizzleProfilesRepository } from './drizzle-profiles.repository.js';

export type {
  JobListFilters,
  JobListPage,
  JobRecord,
  JobSkillRecord,
  JobSkillWrite,
  JobsRepository,
  JobUpdate,
  JobWrite,
} from './jobs.repository.js';

export { DrizzleJobsRepository } from './drizzle-jobs.repository.js';

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

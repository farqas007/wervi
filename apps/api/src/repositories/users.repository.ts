import type { Role, UserStatus } from '@wervi/shared';

/**
 * The user shape the API works with.
 *
 * A repository returns this rather than a Drizzle row so the service layer does
 * not depend on the ORM: swapping the query builder, or adding a column the API
 * must never expose, does not reach past the repository boundary.
 */
export interface UserRecord {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  roles: Role[];
  status: UserStatus;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  id?: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  roles?: Role[];
  status?: UserStatus;
}

/** What a create call should return when the email is already taken. */
export type CreateUserResult =
  { outcome: 'created'; user: UserRecord } | { outcome: 'email_taken' };

/**
 * The only way the service layer reaches user storage.
 *
 * Phase 2 delivers this interface with a Drizzle implementation and nothing
 * that calls it yet: the auth flows that would consume it arrive in Phase 3. It
 * exists now so the queries are written once, in one place, with error
 * translation and column selection decided deliberately.
 */
export interface UsersRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<CreateUserResult>;
}

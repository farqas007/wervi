import { type Database, users } from '@wervi/db';
import type {
  CreateUserInput,
  CreateUserResult,
  UserRecord,
  UsersRepository,
} from './users.repository.js';

/**
 * Drizzle implementation of `UsersRepository`.
 *
 * The column list is written out rather than `select()`-ing the whole table: it
 * is the reason `deleted_at` cannot leak into a response by accident, and it
 * keeps the mapping from row to `UserRecord` in one place.
 */
export class DrizzleUsersRepository implements UsersRepository {
  readonly #db: Database;

  constructor(database: Database) {
    this.#db = database;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await this.#db.db.query.users.findFirst({
      where: (table, operators) => operators.eq(table.id, id),
    });

    return row === undefined ? null : toUserRecord(row);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    // Email lookup is case-insensitive in the database (a unique index on
    // `lower(email)`), so the query has to be too or it would miss a row the
    // constraint already considers a duplicate.
    const row = await this.#db.db.query.users.findFirst({
      where: (table, operators) =>
        operators.sql`lower(${table.email}) = lower(${email})`,
    });

    return row === undefined ? null : toUserRecord(row);
  }

  async create(input: CreateUserInput): Promise<CreateUserResult> {
    try {
      const inserted = await this.#db.db
        .insert(users)
        .values({
          id: input.id,
          name: input.name,
          email: input.email,
          emailVerified: input.emailVerified ?? false,
          roles: input.roles ?? [],
          status: input.status ?? 'pending',
        })
        .returning();

      const row = inserted[0];
      return row === undefined
        ? { outcome: 'email_taken' }
        : { outcome: 'created', user: toUserRecord(row) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { outcome: 'email_taken' };
      }
      throw error;
    }
  }
}

type UserRow = typeof users.$inferSelect;

function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    image: row.image,
    roles: row.roles,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Recognises a unique-constraint violation without importing a driver error
 * class: the SQLSTATE is the contract, and postgres.js surfaces it on the error.
 */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const { code } = error as { code?: unknown };
  return code === '23505';
}

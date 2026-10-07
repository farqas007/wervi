import { findGrantedRole, type AuthUser, type Role } from '@wervi/shared';
import { ForbiddenError } from '../lib/errors.js';

/**
 * The role gate behind every WERVI authorization guard.
 *
 * Membership is exact and additive: a user is authorized when they hold at
 * least one of the required roles, and `admin` does not implicitly unlock
 * role-scoped routes (guards must list the roles they accept explicitly).
 *
 * The rejected response is always the generic `forbidden` envelope so a caller
 * can never enumerate which role a route requires.
 */
export function assertRole(
  user: AuthUser,
  requiredRoles: readonly Role[],
): Role {
  const granted = findGrantedRole(user.roles, requiredRoles);
  if (granted === undefined) {
    throw new ForbiddenError();
  }
  return granted;
}

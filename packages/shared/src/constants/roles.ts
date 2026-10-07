import { z } from 'zod';

export const ROLES = ['client', 'freelancer', 'admin'] as const;

export const roleSchema = z.enum(ROLES);

export type Role = z.infer<typeof roleSchema>;

/**
 * A single account may act as both client and freelancer on WERVI, so roles
 * are additive rather than exclusive. `admin` is always implied by staff.
 */
export const accountSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    roles: z.array(roleSchema).min(1),
    emailVerifiedAt: z.iso.datetime().nullable(),
  })
  .strict();

export type Account = z.infer<typeof accountSchema>;

/**
 * True when the account holds at least one of the required roles. Roles are
 * additive, so membership is always checked against the full set a user carries.
 */
export function hasAnyRole(
  userRoles: readonly Role[],
  requiredRoles: readonly Role[],
): boolean {
  return requiredRoles.some((role) => userRoles.includes(role));
}

/**
 * The first required role the account holds, or `undefined`. Callers reuse the
 * result (e.g. to echo which role authorized a request) instead of re-searching.
 */
export function findGrantedRole(
  userRoles: readonly Role[],
  requiredRoles: readonly Role[],
): Role | undefined {
  return requiredRoles.find((role) => userRoles.includes(role));
}

export function isStaff(roles: readonly Role[]): boolean {
  return roles.includes('admin');
}

export function canHire(roles: readonly Role[]): boolean {
  return roles.includes('client') || isStaff(roles);
}

export function canBid(roles: readonly Role[]): boolean {
  return roles.includes('freelancer') || isStaff(roles);
}

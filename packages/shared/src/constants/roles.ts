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

export function isStaff(roles: readonly Role[]): boolean {
  return roles.includes('admin');
}

export function canHire(roles: readonly Role[]): boolean {
  return roles.includes('client') || isStaff(roles);
}

export function canBid(roles: readonly Role[]): boolean {
  return roles.includes('freelancer') || isStaff(roles);
}

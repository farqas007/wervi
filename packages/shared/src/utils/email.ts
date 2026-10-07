/**
 * The local part of an email address is case-insensitive, and addresses are
 * frequently pasted or typed with accidental whitespace. Normalizing at the
 * auth boundary means a user who signs up as `Jane@Example.com ` is the same
 * account as one who signs in as `jane@example.com` — the database enforces
 * this with `lower(email)`, and every layer above it does the same.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Whether two addresses refer to the same mailbox. */
export function emailsMatch(a: string, b: string): boolean {
  return normalizeEmail(a) === normalizeEmail(b);
}

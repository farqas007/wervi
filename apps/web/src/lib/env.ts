const fallback = 'http://localhost:4000';

/**
 * Browser-visible API origin. Inlined at build time, so it must be prefixed with
 * NEXT_PUBLIC_ and cannot reference server-only secrets.
 */
export const apiBaseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'] ?? fallback;

/** API origin used by server components and route handlers. */
export const serverApiBaseUrl =
  process.env['API_BASE_URL'] ??
  process.env['NEXT_PUBLIC_API_BASE_URL'] ??
  fallback;

export const siteUrl =
  process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000';

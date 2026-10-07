import { cookies } from 'next/headers';
import {
  authSessionResponseSchema,
  type AuthSessionResponse,
} from '@wervi/shared';
import { serverApiBaseUrl } from './env';

/**
 * Server-side session lookup.
 *
 * Forwards this request's cookies to the API's `/auth/session` endpoint. The
 * API owns session state, so any route handler can reject below this layer and
 * the page still renders a nullable session instead of crashing.
 */
export async function getServerSession(): Promise<AuthSessionResponse | null> {
  const cookieHeader = (await cookies()).toString();
  if (cookieHeader.length === 0) {
    return null;
  }

  let response: Response;
  try {
    response = await fetch(`${serverApiBaseUrl}/auth/session`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const parsed = authSessionResponseSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
}

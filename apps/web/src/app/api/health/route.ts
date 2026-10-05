import { z } from 'zod';
import { apiRequest } from '@/lib/api';

export const dynamic = 'force-dynamic';

const healthSchema = z
  .object({
    status: z.string(),
    service: z.string(),
    version: z.string(),
    environment: z.string(),
    uptimeSeconds: z.number(),
    timestamp: z.string(),
  })
  .loose();

export interface HealthPayload {
  reachable: boolean;
  api: z.infer<typeof healthSchema> | null;
  error: string | null;
}

/**
 * Proxies the API health check through Next.js.
 *
 * This keeps the browser on a single origin (no CORS preflight for health
 * polling) and gives the web app a real end-to-end check of the API contract
 * instead of a hardcoded placeholder.
 */
export async function GET(): Promise<Response> {
  try {
    const api = await apiRequest('/health', healthSchema, {
      signal: AbortSignal.timeout(5_000),
    });
    return Response.json({
      reachable: true,
      api,
      error: null,
    } satisfies HealthPayload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error contacting API';
    return Response.json(
      { reachable: false, api: null, error: message } satisfies HealthPayload,
      { status: 503 },
    );
  }
}

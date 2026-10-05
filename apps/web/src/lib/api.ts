import { errorResponseSchema } from '@wervi/shared';
import type { z } from 'zod';
import { serverApiBaseUrl } from './env';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/**
 * Typed client for the WERVI API.
 *
 * Two behaviours that matter for a production client:
 *  - every non-2xx response is decoded into the shared error envelope, so
 *    callers get a typed `ApiError` instead of parsing prose;
 *  - a network failure or unparseable body is surfaced as `ApiError` too,
 *    never as a raw `TypeError`, so error handling stays uniform.
 */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const url = new URL(path, serverApiBaseUrl);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      headers: {
        accept: 'application/json',
        ...(options.body === undefined
          ? {}
          : { 'content-type': 'application/json' }),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      0,
      'service_unavailable',
      `Could not reach the WERVI API at ${serverApiBaseUrl}`,
    );
  }

  const payload = await safeJson(response);

  if (!response.ok) {
    throw toApiError(response.status, payload);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      502,
      'internal_error',
      'The WERVI API returned an unexpected response shape',
    );
  }

  return parsed.data;
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toApiError(status: number, payload: unknown): ApiError {
  const parsed = errorResponseSchema.safeParse(payload);
  if (parsed.success) {
    return new ApiError(
      status,
      parsed.data.error.code,
      parsed.data.error.message,
      parsed.data.error.requestId,
    );
  }
  return new ApiError(status, 'internal_error', `Request failed (${status})`);
}

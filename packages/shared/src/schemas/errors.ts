import { z } from 'zod';

/**
 * Stable, machine-readable error codes. Clients branch on `code`, never on the
 * human-readable `message`, so codes must not be renamed once shipped.
 */
export const ERROR_CODES = [
  'bad_request',
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'unprocessable_entity',
  'rate_limited',
  'internal_error',
  'service_unavailable',
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const httpStatusByCode: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable_entity: 422,
  rate_limited: 429,
  internal_error: 500,
  service_unavailable: 503,
};

export const errorDetailSchema = z
  .object({
    path: z.string(),
    message: z.string(),
  })
  .strict();

export type ErrorDetail = z.infer<typeof errorDetailSchema>;

/** The single error envelope every non-2xx API response uses. */
export const errorResponseSchema = z
  .object({
    error: z
      .object({
        code: errorCodeSchema,
        message: z.string(),
        requestId: z.string(),
        details: z.array(errorDetailSchema).optional(),
      })
      .strict(),
  })
  .strict();

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

import { type ErrorResponse, httpStatusByCode } from '@wervi/shared';
import fp from 'fastify-plugin';
import type {
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { AppError } from '../lib/errors.js';

interface ValidationIssue {
  instancePath?: string;
  path?: (string | number | symbol)[];
  message?: string;
}

/**
 * Converts anything thrown inside a handler into the single error envelope
 * defined in @wervi/shared. Unrecognised errors become an opaque
 * `internal_error` so stack traces and driver messages never reach a client.
 */
export const errorHandlerPlugin: FastifyPluginCallback = fp((fastify) => {
  fastify.setNotFoundHandler((request, reply) => {
    const body: ErrorResponse = {
      error: {
        code: 'not_found',
        message: `Route ${request.method} ${request.url} does not exist`,
        requestId: request.id,
      },
    };
    return reply.status(404).send(body);
  });

  fastify.setErrorHandler(
    (error, request: FastifyRequest, reply: FastifyReply) => {
      if (error instanceof AppError) {
        if (error.statusCode >= 500) {
          request.log.error({ err: error }, 'application error');
        } else {
          request.log.warn(
            { code: error.code, err: error.message },
            'request rejected',
          );
        }
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
            requestId: request.id,
            ...(error.details === undefined ? {} : { details: error.details }),
          },
        } satisfies ErrorResponse);
      }

      if (isValidationError(error)) {
        return reply.status(httpStatusByCode.validation_failed).send({
          error: {
            code: 'validation_failed',
            message: 'Request validation failed',
            requestId: request.id,
            details: toDetails(error),
          },
        } satisfies ErrorResponse);
      }

      if (isRateLimitError(error)) {
        return reply.status(httpStatusByCode.rate_limited).send({
          error: {
            code: 'rate_limited',
            message: 'Too many requests',
            requestId: request.id,
          },
        } satisfies ErrorResponse);
      }

      if (isPayloadTooLarge(error)) {
        return reply.status(httpStatusByCode.bad_request).send({
          error: {
            code: 'bad_request',
            message: 'Request body is too large',
            requestId: request.id,
          },
        } satisfies ErrorResponse);
      }

      request.log.error({ err: error }, 'unhandled error');

      return reply.status(httpStatusByCode.internal_error).send({
        error: {
          code: 'internal_error',
          message: 'An unexpected error occurred',
          requestId: request.id,
        },
      } satisfies ErrorResponse);
    },
  );
});

function isValidationError(error: unknown): error is {
  validation: ValidationIssue[];
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'validation' in error &&
    Array.isArray(error.validation)
  );
}

function toDetails(error: { validation: ValidationIssue[] }): {
  path: string;
  message: string;
}[] {
  return error.validation.map((issue) => ({
    path:
      issue.instancePath ??
      (issue.path ?? []).map((segment) => String(segment)).join('.'),
    message: issue.message ?? 'Invalid value',
  }));
}

function isRateLimitError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { statusCode?: number }).statusCode === 429
  );
}

function isPayloadTooLarge(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { statusCode?: number }).statusCode === 413
  );
}

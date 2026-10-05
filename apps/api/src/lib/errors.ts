import {
  type ErrorCode,
  type ErrorDetail,
  httpStatusByCode,
} from '@wervi/shared';

/**
 * Application-level error. Anything thrown that is *not* an AppError is treated
 * as an unexpected fault by the error handler: logged with a stack trace and
 * reported to the client as a generic `internal_error`, so implementation
 * details never leak.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details: ErrorDetail[] | undefined;
  readonly expose: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: ErrorDetail[]; cause?: unknown } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'AppError';
    this.code = code;
    this.statusCode = httpStatusByCode[code];
    this.details = options.details;
    this.expose = this.statusCode < 500;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: ErrorDetail[]) {
    super(
      'validation_failed',
      message,
      details === undefined ? {} : { details },
    );
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('unauthorized', message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource') {
    super('forbidden', message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super('not_found', `${resource} was not found`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('conflict', message);
    this.name = 'ConflictError';
  }
}

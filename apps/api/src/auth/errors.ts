import {
  AppError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '../lib/errors.js';

/**
 * The serialized body of a Better Auth APIError: `{ message, code, status }`.
 * Only `code` is examined; the message stays internal so Better Auth internals
 * never leak into WERVI responses.
 */
interface BetterAuthErrorBody {
  code?: string;
  message?: string;
  status?: number;
}

/**
 * Maps a rejected Better Auth forwarding onto the WERVI error contract.
 *
 * Known failure codes become specific WERVI errors; anything unexpected falls
 * back to a judgement by HTTP status. Never throws the Better Auth error itself
 * and never surfaces its message text to a client.
 */
export function raiseAuthError(statusCode: number, body: unknown): never {
  const error = (body ?? {}) as BetterAuthErrorBody;

  switch (error.code) {
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      throw new ConflictError('An account with this email already exists');
    case 'INVALID_EMAIL_OR_PASSWORD':
    case 'INVALID_EMAIL':
    case 'INVALID_PASSWORD':
    case 'PASSWORD_MISMATCH':
    case 'USER_NOT_FOUND':
    case 'USER_EMAIL_NOT_FOUND':
    case 'CREDENTIAL_ACCOUNT_NOT_FOUND':
    case 'SESSION_EXPIRED':
    case 'SESSION_REVOKED':
    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
      throw new UnauthorizedError('Invalid email or password');
    case 'EMAIL_NOT_VERIFIED':
      throw new ForbiddenError('Please verify your email address to continue');
    case 'PASSWORD_TOO_SHORT':
      throw new ValidationError('Password must be at least 8 characters');
    case 'PASSWORD_TOO_LONG':
      throw new ValidationError('Password is too long');
    case 'VALIDATION_ERROR':
    case 'MISSING_FIELDS':
      throw new ValidationError();
    case 'INVALID_ORIGIN':
    case 'INVALID_CALLBACK_URL':
    case 'CROSS_SITE_NAVIGATION_LOGIN_BLOCKED':
      throw new ForbiddenError('Request rejected: origin check failed');
  }

  if (statusCode >= 500) {
    // Config errors such as schema mismatches are logged by Better Auth; the
    // caller gets an opaque 500 exactly like any other unexpected fault.
    throw new AppError('internal_error', 'An unexpected error occurred');
  }
  if (statusCode === 401) {
    throw new UnauthorizedError('Invalid email or password');
  }
  if (statusCode === 403) {
    throw new ForbiddenError();
  }
  if (statusCode === 409) {
    throw new ConflictError('The request conflicts with existing data');
  }
  if (statusCode === 422) {
    throw new ValidationError();
  }
  throw new AppError('bad_request', 'The request could not be processed');
}

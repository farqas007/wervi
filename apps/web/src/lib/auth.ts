import { authUserResponseSchema, type AuthUserResponse } from '@wervi/shared';
import { z } from 'zod';
import { apiRequest } from './api';

const signOutSchema = z.object({ success: z.literal(true) }).loose();

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

/** Creates an account and starts a session. Rendered user comes from the API. */
export async function signUp(input: SignUpInput): Promise<AuthUserResponse> {
  return apiRequest('/auth/signup', authUserResponseSchema, {
    method: 'POST',
    body: input,
    credentials: 'include',
  });
}

/** Signs in with email and password, resolving a signed-in user. */
export async function signIn(input: SignInInput): Promise<AuthUserResponse> {
  return apiRequest('/auth/login', authUserResponseSchema, {
    method: 'POST',
    body: input,
    credentials: 'include',
  });
}

/** Revokes the current session. Idempotent: succeeds even when signed out. */
export async function signOut(): Promise<void> {
  await apiRequest('/auth/logout', signOutSchema, {
    method: 'POST',
    credentials: 'include',
  });
}

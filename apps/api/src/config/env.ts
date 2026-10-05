import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv({ path: new URL('../../../.env', import.meta.url), quiet: true });

const toBoolean = (value: string): boolean => value === 'true' || value === '1';

const toList = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

/** `CORS_ORIGINS=a,b` -> `['a','b']`, defaulting when unset. */
const listVar = (fallback: string) =>
  z.string().default(fallback).transform(toList);

/** Accepts `true|false|1|0`, defaulting when unset. */
const booleanVar = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(fallback ? 'true' : 'false')
    .transform(toBoolean);

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    SERVICE_NAME: z.string().min(1).default('wervi-api'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    API_BASE_URL: z.url().default('http://localhost:4000'),
    CORS_ORIGINS: listVar('http://localhost:3000'),
    API_EXPOSE_DOCS: booleanVar(process.env['NODE_ENV'] !== 'production'),
    API_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576),
    API_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    API_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60_000),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_SSL: z.enum(['require', 'disable']).default('require'),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15_000),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') {
      return;
    }
    if (value['CORS_ORIGINS'].includes('*')) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS must not be "*" in production',
      });
    }
    if (value['API_EXPOSE_DOCS']) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_EXPOSE_DOCS'],
        message: 'API_EXPOSE_DOCS must be false in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Validated process configuration.
 *
 * Parsed once and cached. A misconfigured deployment fails immediately at boot
 * with a readable message instead of surfacing as a confusing runtime error in
 * the middle of a user request.
 */
export function getEnv(): Env {
  if (cached === undefined) {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
      const details = result.error.issues
        .map(
          (issue) =>
            `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
        )
        .join('\n');
      throw new Error(`Invalid environment configuration:\n${details}`);
    }

    cached = result.data;
  }

  return cached;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

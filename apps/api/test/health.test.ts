import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const TEST_ENV = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL:
    process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/wervi_test',
  DATABASE_SSL: 'disable',
  API_RATE_LIMIT_MAX: '10000',
} satisfies Record<string, string>;

describe('health endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    Object.assign(process.env, TEST_ENV);
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports liveness without touching the database', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('wervi-api');
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('returns the shared error envelope for an unknown route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/does-not-exist',
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe('not_found');
    expect(typeof body.error.requestId).toBe('string');
  });

  it('reports readiness as degraded when the database is unreachable', async () => {
    const broken = await buildApp({ logger: false });
    // Simulate an outage by replacing the pool with one that always fails.
    Object.defineProperty(broken.db, 'sql', {
      value: () => Promise.reject(new Error('connection refused')),
    });
    await broken.ready();

    const response = await broken.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.database).toBe('down');

    await broken.close();
  });
});

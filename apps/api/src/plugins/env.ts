import fp from 'fastify-plugin';
import type { FastifyPluginCallback } from 'fastify';
import { type Env, getEnv } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    env: Env;
  }
}

/**
 * Validates configuration once at boot and exposes it on the instance. Routes
 * read `fastify.env.*` instead of touching `process.env`, so every setting they
 * depend on is guaranteed to exist and be correctly typed.
 */
export const envPlugin: FastifyPluginCallback = fp((fastify) => {
  fastify.decorate('env', getEnv());
});

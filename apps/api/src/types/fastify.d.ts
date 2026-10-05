import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    /** Version reported by the health endpoint. */
    appVersion: string;
  }
}

export {};

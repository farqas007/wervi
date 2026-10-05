import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { getEnv } from './config/env.js';
import { dbPlugin } from './plugins/db.js';
import { envPlugin } from './plugins/env.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { openapiPlugin } from './plugins/openapi.js';
import { routes } from './routes/index.js';

const APP_VERSION = '0.1.0';

export interface BuildAppOptions {
  logger?: boolean;
  database?: {
    verifyOnBoot?: boolean;
  };
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const env = getEnv();

  const fastify = Fastify({
    logger: options.logger ?? {
      level: env.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty' } }
        : {}),
    },
    bodyLimit: env.API_BODY_LIMIT_BYTES,
    requestTimeout: env.API_REQUEST_TIMEOUT_MS,
    trustProxy: true,
    logController: new LogController({
      disableRequestLogging: env.NODE_ENV === 'test',
    }),
    genReqId: () => crypto.randomUUID(),
  });

  fastify.decorate('appVersion', APP_VERSION);

  // Installed on the root instance so every plugin and route context inherits
  // Zod-based request validation and response serialization.
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  await fastify.register(envPlugin);
  await fastify.register(errorHandlerPlugin);

  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });

  await fastify.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(rateLimit, {
    max: env.API_RATE_LIMIT_MAX,
    timeWindow: env.API_RATE_LIMIT_WINDOW_MS,
  });

  await fastify.register(dbPlugin, {
    verifyOnBoot: options.database?.verifyOnBoot ?? env.NODE_ENV !== 'test',
  });
  await fastify.register(openapiPlugin);
  await fastify.register(routes, { prefix: '/' });

  return fastify;
}

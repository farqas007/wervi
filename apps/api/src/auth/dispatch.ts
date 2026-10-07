import { type IncomingHttpHeaders } from 'node:http';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthInstance } from './instance.js';

/**
 * The subset of a Fastify request Better Auth needs, re-created so a handler
 * can replace the body after Fastify has already consumed and parsed it.
 */
export interface AuthProxyRequest {
  method: string;
  protocol: string;
  host: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

/** Copies the Fastify request into the shape `dispatchAuth` expects. */
export function toAuthProxyRequest(
  request: FastifyRequest,
  body: unknown = request.body,
): AuthProxyRequest {
  return {
    method: request.method,
    protocol: request.protocol,
    host: request.host,
    headers: request.headers,
    body,
  };
}

export interface AuthHandlerResult {
  /** HTTP status Better Auth produced for the forwarded request. */
  status: number;
  /** Response headers, including any `Set-Cookie` to copy back. */
  headers: Headers;
  /** Parsed JSON body, or `null` when there was none. */
  body: unknown;
}

/**
 * Forwards a WERVI request to the Better Auth handler.
 *
 * Better Auth owns cookie signing, session lookup, CSRF/origin validation and
 * password hashing. Rather than reimplement any of that, a request is rebuilt
 * as a WHATWG `Request` (the body is serialized again because Fastify already
 * read it) and handed to `auth.handler`, which performs the full pipeline and
 * returns a `Response` with the session cookies attached. The route that calls
 * this is then responsible for copying the `Set-Cookie` headers (and other
 * response headers, such as `Cache-Control`) onto its own reply and mapping
 * the status/body onto the WERVI API contract.
 */
export async function dispatchAuth(
  auth: AuthInstance,
  path: string,
  request: AuthProxyRequest,
): Promise<AuthHandlerResult> {
  const url = new URL(path, `${request.protocol}://${request.host}`);
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(name, entry);
      }
    } else {
      headers.set(name, value);
    }
  }

  // The WHATWG Request derives its own framing from `body`; a stale
  // content-length from the incoming socket must not confuse it.
  headers.delete('content-length');

  const requestBody =
    request.body === undefined || request.body === null
      ? undefined
      : JSON.stringify(request.body);
  if (requestBody !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await auth.handler(
    new Request(url, {
      method: request.method,
      headers,
      body: requestBody,
    }),
  );

  const text = await response.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }

  return { status: response.status, headers: response.headers, body };
}

/**
 * Copies the headers from a Better Auth response that must reach the client:
 * session/clear `Set-Cookie` pairs and cache directives for sensitive data.
 * Everything else (server headers, content-type) is Fastify's to produce.
 */
export function copyAuthResponseHeaders(
  headers: Headers,
  reply: FastifyReply,
): void {
  const setCookies = headers.getSetCookie();
  if (setCookies.length > 0) {
    reply.header('set-cookie', setCookies);
  }
  const cacheControl = headers.get('cache-control');
  if (cacheControl !== null) {
    reply.header('cache-control', cacheControl);
  }
}

# Architecture

## Shape

WERVI is a **modular monolith**: one deployable web application, one
deployable API, and two shared libraries.

```
Browser ──► Next.js (apps/web) ──► Fastify API (apps/api) ──► PostgreSQL
                     │                       │
                     └──── @wervi/shared ────┘
                              @wervi/db
```

Microservices were rejected deliberately. A marketplace's hard problems are
domain rules and data integrity — a proposal must not be accepted twice, escrow
must be a ledger, disputes need immutable history — not network plumbing. A
modular monolith keeps subsystem boundaries explicit while avoiding distributed
transactions and a dozen deploy targets for a single maintainer. The API is
already a separate process from the web app, so the main scaling seam exists
from day one, and any module can be extracted later if it ever needs to.

## Packages

| Package | Responsibility | May depend on |
| --- | --- | --- |
| `@wervi/shared` | Zod contracts, types, constants, pure utilities | nothing |
| `@wervi/db` | Drizzle schema, migrations, pool | `@wervi/shared` |
| `@wervi/api` | HTTP layer, business logic, workers | `shared`, `db` |
| `@wervi/web` | Rendering, browser/server components | `shared` |

The dependency graph is acyclic and enforced by TypeScript project references.

Inside `@wervi/api`, storage is reached through repositories
(`src/repositories`): services depend on an interface, and the composition root
supplies the Drizzle implementation. Queries live in the repository and nowhere
else, so a table change has one place to move. `docs/DATABASE.md` covers the
schema conventions, the rules the database enforces, and how to migrate it.

## Technology decisions

### TypeScript everywhere

A marketplace is a set of state machines over money and permissions. One type
system means a change to `ProposalStatus` breaks the API and the UI at compile
time instead of in production.

Pinned to **TypeScript 5.9** rather than 7.x: `typescript-eslint` currently
caps its supported range at `<6.1.0`, so TypeScript 7 would break linting. This
is revisited when the ecosystem catches up.

### pnpm + Turborepo

pnpm's strict, content-addressed `node_modules` keep transitive dependencies
isolated, and Turborepo caches typecheck/build/test per package. Both are free
and MIT/Apache licensed.

Note for pnpm 12: build-script allow-listing uses `allowBuilds` in
`pnpm-workspace.yaml` (the older `onlyBuiltDependencies` key is ignored), and
pnpm applies a minimum release age to newly published packages.

### Next.js rather than a client-rendered SPA

Job listings and freelancer profiles are the growth engine, so they must be
server-rendered, indexable, link-previewable, and use optimized images. That
rules out a client-only SPA.

`typedRoutes` is enabled, which turns a typo in a `href` into a build error.

### shadcn/ui planned, inside `apps/web`

Components are copied into the repository rather than consumed from a vendor:
no paid tiers, no forced upgrades. They live in `apps/web` for now to keep the
build simple; they move to `packages/ui` only if a second application appears.

### Fastify rather than NestJS

NestJS is tuned for large teams — decorators, a DI container and per-module
boilerplate are overhead for one maintainer. Fastify provides schema-first
validation and a very small core; structure comes from folder conventions plus
Zod instead of framework magic. NestJS becomes the right choice only if the API
grows to multiple engineers.

### Zod as the single contract

One schema per entity in `@wervi/shared` drives four consumers: Fastify request
validation, Fastify response serialization, the generated OpenAPI document, and
the inferred TypeScript types. `fastify-type-provider-zod` performs the
conversion, so the published documentation cannot drift from the
implementation.

Two Zod caveats learned during the foundation build:

- `components.schemas` in the Swagger config requires real JSON Schema. Zod
  schemas belong on route `schema` fields, where the transform converts them.
  Shared schemas are referenced from routes as `{ $ref: 'Name#' }`.
- With `zod`, `.default()` must be applied *before* `.transform()`, otherwise
  the default is type-checked against the transform's output type.

### PostgreSQL and Drizzle

The domain is deeply relational and transactional: proposals must not be
double-accepted, escrow must be an append-only ledger, disputes must reference
immutable history. PostgreSQL gives real constraints, `SELECT ... FOR UPDATE`,
`JSONB` for flexible metadata, and full-text search.

Drizzle rather than Prisma because it needs no codegen step, infers types
directly, and keeps migrations as readable SQL that a human reviews before it
reaches production. SQLite or MySQL would all be workarounds rather than fits.

Search starts with PostgreSQL full-text search (`tsvector` + `pg_trgm`), which
handles fuzzy titles, skills and location with no extra service. Meilisearch or
Typesense remains an option later, once there is a measured need.

### Better Auth planned, self-hosted

NextAuth is Next-coupled, which is awkward from a separate API service.
Better Auth is framework-agnostic, TypeScript-first, has a first-class Drizzle
adapter, supports sessions and OAuth, and is self-hostable — so
authentication is not a paid SaaS dependency and user data stays in WERVI's own
database.

### Redis

One dependency serving three needs: rate limiting (a marketplace is a bot
target), BullMQ queues (email, notifications, image processing), and caching
hot reads. Upstash's free tier removes the operational burden.

### Stripe Connect

The only credible way to pay freelancers internationally, because it handles
multi-currency payouts and KYC. It models platform commission as a fee on top
of a charge, which is exactly WERVI's revenue model, and has no monthly cost.

## API conventions

- Every non-2xx response uses one envelope: `{ error: { code, message,
  requestId, details? } }`, defined in `@wervi/shared/schemas/errors`. Clients
  branch on `code`, never on `message`.
- Error codes are stable identifiers. Renaming a shipped code is a breaking
  change.
- `requestId` is returned on every response and correlates with the server log
  line for that request.
- `GET /health` performs no dependency calls, so a database blip cannot cause
  an orchestrator to kill healthy processes. `GET /health/ready` does check
  dependencies and returns 503 when degraded.

## Data conventions

- **Money is always integer minor units** paired with an ISO 4217 code. JPY
  has no decimal places and BHD has three, so the exponent is looked up from
  the currency rather than assumed to be two.
- `toMinorUnits` treats strings as strict (excess precision throws, because a
  human typed it) and floats as already-inexact (rounded half-up). Scaling is
  performed on the decimal text, never by float multiplication.
- Platform commission is derived in minor units and rounded once. Splits use
  `allocateMoney`, which guarantees the parts sum exactly back to the original.
- Statuses are enums; transitions are validated in the service layer.
- Timestamps are `timestamptz`, stored in UTC.

## Security posture

- Helmet security headers, explicit CORS allow-list, and a global rate limit are
  enabled by default.
- `authorization` and `cookie` request headers are redacted from logs.
- Validation failures, `CORS_ORIGINS=*` and exposed API docs are rejected when
  `NODE_ENV=production`.
- Unrecognised errors are logged with a stack trace and reported to clients as
  a bare `internal_error`, so driver messages never leak.
- The database connection is verified at boot outside tests, so a broken
  deployment fails immediately instead of erroring on every request.

## Deployment

Targets, all free-tier friendly:

| Concern | Service |
| --- | --- |
| Web | Vercel Hobby (or Cloudflare) |
| API | Render/Fly free tier initially, then a small VPS |
| Database | Neon free tier (branchable dev databases) |
| Redis | Upstash free tier |
| Files | Cloudflare R2 |
| Email | Resend |
| Payments | Stripe |

Free API hosts sleep between requests, which is acceptable for early
development but not for a production marketplace; the planned move is a small
Hetzner VPS or an Oracle Always Free VM.

`docker-compose.yml` mirrors the production services so a local environment
resembles staging.
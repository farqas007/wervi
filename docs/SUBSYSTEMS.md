# Subsystems

WERVI is delivered one subsystem at a time. Each phase is built, verified with
`pnpm verify`, and reviewed before the next begins.

## Current status

| # | Subsystem | Status |
| --- | --- | --- |
| 1 | Foundation | **Complete** |
| 2 | Database core | **Complete** |
| 3 | Auth and accounts | **In progress** |
| 4 | Profiles | **Complete** |
| 5 | Jobs | **In progress** |
| 6 | Proposals | Not started |
| 7 | Contracts | Not started |
| 8 | Messaging | Not started |
| 9 | Milestones | Not started |
| 10 | Payments and commission | Not started |
| 11 | Reviews | Not started |
| 12 | Disputes | Not started |
| 13 | Notifications | Not started |
| 14 | Platform operations | Not started |

---

## 1. Foundation — complete

- pnpm + Turborepo monorepo, TypeScript project references, ESLint 10 with
  type-aware rules, Prettier
- `@wervi/shared`: currency metadata, roles, the error envelope, pagination
  contracts, and the money utilities that every later phase depends on
- `@wervi/db`: Drizzle configuration, pooled connection management with lazy
  connect, migration runner, migration folder
- `apps/api`: Fastify app factory, boot-time environment validation, Postgres
  plugin, the shared error handler, security headers, CORS, rate limiting,
  OpenAPI 3.1 with a Swagger UI, liveness and readiness endpoints
- `apps/web`: Next.js app with Tailwind, a typed API client that decodes errors
  into a typed error class, and a health route that proves the web-to-API
  contract end to end
- CI: format, lint, typecheck, test, build, plus a migration drift check

## 2. Database core — complete

Delivered, in 19 tables grouped by domain, each in its own module under
`packages/db/src/schema`:

- **auth** — `users`, `auth_accounts`, `auth_sessions`, `auth_verifications`,
  shaped for the Better Auth adapter Phase 3 will drive
- **taxonomy** — `categories`, `skills`
- **profiles** — `freelancer_profiles`, `client_profiles`, `profile_skills`,
  `profile_languages`, `portfolio_items`
- **jobs** — `jobs`, `job_skills`
- **proposals** — `proposals`
- **contracts** — `contracts`
- **milestones** — `milestones`, `milestone_deliveries`
- **reviews** — `reviews`
- **audit** — `audit_log`

With it:

- Lifecycle statuses, transition maps and the non-status vocabularies moved into
  `@wervi/shared`, so the database CHECK constraint, the Zod schemas and the
  TypeScript types are generated from one list
- Two migrations: the generated baseline and a custom migration carrying the
  `updated_at` trigger, `pg_trgm`, trigram indexes and full-text indexes
- A deterministic seed: fixed ids and timestamps, one transaction, truncate
  first, with data chosen to exercise the constraints rather than to look full
- Integration tests against a real PostgreSQL, skipped locally unless
  `DATABASE_TEST_URL` names a test database
- `docs/DATABASE.md`: conventions, ownership, and how to change the schema
- `apps/api/src/repositories`: the storage interface Phase 3 onwards build on

Depends on: nothing.

## 3. Auth and accounts — in progress

Delivered so far, on top of `pnpm verify`:

- **Better Auth 1.7.7 with the Drizzle adapter**. `generateId` is disabled so
  every id comes from the database's `uuid()` defaults — no foreign Better Auth
  primary keys leak into WERVI tables.
- **Fastify-first integration**: explicit `routes -> handler` proxying Backend
  Auth's WHATWG `Request` API rather than embedding its fetch-style client, so
  `Set-Cookie` headers round-trip naturally through Fastify.
- **Routes**: `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`
  (idempotent), `GET /auth/session`, `GET /auth/me`, and `GET /auth/protected`
  demonstrating the `requireAuth` guard.
- **Role guards**: `fastify.requireAuth`, `fastify.requireRoles(...roles)`, and
  `fastify.requireAdmin` preHandlers. Roles are additive and checked exactly —
  `admin` does not implicitly unlock a role-scoped route. Guard rejects are the
  generic `forbidden` envelope, so callers can never enumerate which role a
  route requires. Demo route `GET /auth/roles/client`,
  `GET /auth/roles/freelancer`, `GET /auth/roles/admin`, and the any-of
  `GET /auth/roles/participant` (`client` or `freelancer`) exercise the matrix;
  marketplace routes will reuse the same guards.
- **Role assignment is server-side**: there is no public endpoint for changing
  roles. Sign-up is strict and rejects any `roles`/`status` payload, and the DB
  enforces a CHECK constraint. Role management will be wired to the admin
  subsystem in a later phase.
- **WERVI-specific user shape**: emails are normalized (trim + lowercase) and
  compared case-insensitively, so duplicates collide on any casing; accounts
  are created with `roles: ['client']` and `status: 'active'`, and clients can
  never self-assign roles or statuses through the API.
- **Typed contracts in `@wervi/shared`** (`authUserSchema`, `authSessionSchema`,
  `authSessionResponseSchema`) — the API serializes to exactly these, and the
  web app validates responses against them.
- **Web app**: `/login` and `/signup` pages, a client-side sign-out button, and
  a session-aware home page that reads the API session server-side via
  `getServerSession()`.
- **Tests**: 27 integration tests against a real Postgres covering normalization,
  duplicate casing/whitespace, invalid payloads, login failures, session shape,
  the protected guard, idempotent logout, suspended/closed accounts (403), the
  full role matrix (each role granted/denied, any-of routing, additive roles,
  no session → 401, no role-change surface, unknown-role rejection), and
  OpenAPI coverage of every auth route.

Still ahead in this phase: email verification, password reset, role guards for
real marketplace routes, admin role management, and account lockout on repeated
failures.

Depends on: 2.

## 4. Profiles — complete

Both profile halves, their skills and languages, and the read-only taxonomy
that feeds them, delivered on top of the Phase 2 tables — no schema change was
needed.

- **Own-profile API**: `GET /profiles/me`, `PATCH /profiles/me` (creates either
  half on first edit; a missing half is untouched, a present `null` clears a
  nullable field), `GET`/`PUT /profiles/me/skills`, and
  `GET`/`PUT /profiles/me/languages`. Skills and languages are replaced as
  whole sets in one transaction; an empty list clears the profile. Skills must
  name an active `skills` row and duplicates are rejected; language codes are
  ISO 639-1, normalised to lowercase at the boundary, and de-duplicated.
- **Public freelancer lookup**: `GET /profiles/:userId` serves a profile only
  when it is `public` and the owner account is active; every other state is a
  404 so private profiles cannot be fingerprinted.
- **Taxonomy**: `GET /categories`, `GET /categories/:id`, `GET /skills`
  (optionally filtered by `categoryId`), serving active rows in display order.
  Unauthenticated, because sign-up needs the vocabulary before a session
  exists; admin taxonomy management is deferred to the platform-operations
  phase.
- **Ownership is session-derived**: no contract here accepts a `userId`, roles,
  statuses, email, or any account-level field — a strict entire schema rejects
  them before they reach a write, and every read/write is keyed on
  `request.authData.user.id`. Guards run as `preValidation`, so an
  unauthenticated caller gets a 401 before body validation even with a
  malformed payload.
- **Auth-guard bug fix**: the session guard now always proxies Better Auth's
  `get-session` as a cookie-only `GET`, instead of forwarding the outer
  request's method and body, so PATCH/PUT routes authenticate correctly.
- **Shared contracts**: strict Zod schemas in `@wervi/shared` for
  `MyProfileResponse`, `PublicProfileResponse`, the freelancer/client halves,
  profile skills and languages, and the category/skill taxonomy; the API
  serialises to exactly these and the web app validates responses against
  them. Locale validation (ISO 3166-1, ISO 639-1, IANA timezones) lives in the
  same package with its own tests.
- **Web app**: a `/profile` page (server-rendered, session-gated) with a fully
  typed form for the freelancer and client halves, skill and language editors,
  and validation errors from the API envelope.
- **Tests**: 28 API integration tests against a real Postgres covering the
  whole contract — 401/403 semantics, suspended/closed blocking, skil/language
  attach/reject/duplicate/clear, taxonomy reads, mass-assignment and unknown
  field rejection, public-profile privacy, and OpenAPI coverage — plus shared
  locale tests. No DB-integration test is skipped when a dedicated test
  database is available.

Depends on: 3.

Still ahead: portfolio items with attachments (Phase 4 adds the `files` table
when the attachments groundwork is built, per `docs/DATABASE.md`), rated
profile fields, and admin taxonomy management in the platform-operations phase.

## 5. Jobs — foundation delivered

The client-owned listing with its full lifecycle, strict wire contracts and
the public browse surface. Built on the Phase 2 tables plus one schema change:
`jobs.category_id`, a nullable foreign key to `categories` (nullable only
because it was added to a table with rows; the API requires it on create).

- **Lifecycle**: `draft → published → paused → closed`, validated against the
  shared `JOB_STATUS_TRANSITIONS` map. An illegal move answers 409, re-setting
  the current status is an idempotent no-op, and closed jobs refuse further
  edits.
- **API**: `POST /jobs` (client role), `GET /jobs/me` (owned listings with a
  status filter), `GET /jobs/:id`, `GET /jobs` (public browse),
  `PATCH /jobs/:id` (partial merge — a present key overwrites, an explicit
  `null` clears a nullable column, an absent key keeps the stored value; the
  merged budget pair is re-validated), and `PUT /jobs/:id/status`.
- **Visibility and ownership**: browse serves only `published` + `public`
  rows; detail resolves a stranger's listing only in that same state while the
  owner — through a forwarded session cookie — sees their own job in any
  state. Everything else is a 404 (non-fingerprintable), except a stranger
  writing to a publicly visible job, which is 403.
- **Browse filters**: escaped `ILIKE` search over title and description,
  category, skills (any-match), experience level, budget model, currency, work
  mode, and budget bounds in minor units paired with `currency`. The query
  schema is strict: unknown or malformed parameters are 422 rather than
  silently ignored. Ordering is deterministic — `published_at DESC, id DESC`
  for browse (re-publishing refreshes `published_at`), `created_at DESC` for
  owned listings — with offset pagination.
- **Slugs**: generated server-side from the title, collision-retried with a
  random suffix, never user-supplied.
- **Shared contracts**: strict Zod schemas in `@wervi/shared` for create,
  patch, status, both list queries and the job view (embedded category and
  skills included), so mass assignment — `clientId`, `slug`, `proposalCount`,
  `status` inside a patch — is rejected at the boundary.
- **Web app**: `/jobs` (server-rendered browse with a filter form and
  pagination), `/jobs/new` (session-gated, client-role-gated create form that
  saves a draft or publishes), `/jobs/[id]` (detail page that forwards this
  request's cookies, so the owner sees their own non-public listing, with
  owner-only lifecycle buttons driven by the shared transition map).
- **Tests**: 31 API integration tests against a real Postgres covering create
  and slug uniqueness, taxonomy and malformed-body rejection, ownership and
  visibility rules, every lifecycle edge, filters (including literal quotes
  and wildcards in `q`), pagination, mass assignment, the authorization
  matrix, and OpenAPI coverage — plus `jobs.category_id` foreign-key tests.

Depends on: 3.

Still ahead: PostgreSQL full-text search with `pg_trgm` fuzzy matching and
sort options, attachments, a richer budget UI (the create form still takes
minor-unit integers), an owner "my jobs" dashboard, proposal counters fed by
Phase 6, and job moderation in the platform-operations phase.

## 6. Proposals

Submit, revise and withdraw proposals against open jobs. Client-side review:
shortlist, reject with reason, and bulk actions. Proposal counters on jobs
maintained transactionally. Duplicate and spam protection.

Depends on: 4, 5.

## 7. Contracts

Accepting a proposal creates a contract with an explicit state machine
(`draft -> active -> paused -> completed -> cancelled`, plus `disputed`).
Terms are snapshotted from the job and proposal at acceptance so later edits
cannot rewrite history. Exclusivity: a job accepts at most one proposal.
Client and freelancer dashboards for active contracts.

Depends on: 6.

## 8. Messaging

Project-scoped conversation threads, one per contract. Messages with read
receipts, unread counters, attachments, and realtime delivery. Access is
restricted to contract participants; messages are retained for dispute
evidence.

Depends on: 7.

## 9. Milestones

Milestone plans agreed before work starts: title, description, amount, due
date, and ordering. Delivery, client review, revision cycles with a bounded
count, acceptance, and a clear state machine per milestone. Requires funding
before delivery is permitted.

Depends on: 7, 8.

## 10. Payments and platform commission

Stripe Connect onboarding for freelancer payouts. Escrow funded per milestone,
released on acceptance or split during a dispute. Platform commission computed
in minor units and rounded once. Double-entry ledger for every movement, webhooks
processed idempotently, refunds, and payout failure handling.

Depends on: 9.

## 11. Reviews

Two-way reviews permitted only after a contract completes. One review per party
per contract, immutable after a short edit window. Reputation aggregates
computed asynchronously and denormalised for profile display.

Depends on: 7.

## 12. Disputes

Raising a dispute freezes the affected escrow. Evidence upload with a deadline,
a structured resolution state machine, staff mediation, and resolution
outcomes including refund, partial release, and full release. Every transition
recorded in the ledger.

Depends on: 10.

## 13. Notifications

In-app notification centre with read state, plus transactional email through
Resend and optional digest email. Per-category user preferences. Delivery runs
on BullMQ workers with retries and dead-letter handling. Unread badges in the
web app.

Depends on: 3, and incrementally on 5 through 12.

## 14. Platform operations

Admin surfaces for user management, job moderation, dispute queues and payout
review. Reporting and abuse tooling. Observability: structured logs, error
tracking, uptime monitoring and basic metrics. Internationalisation, rate-limit
tuning, and a production security and performance pass.

Depends on: all.

---

## Cross-cutting work

These are not standalone phases but are introduced as each subsystem needs
them:

- **Observability** — structured logging from day one; metrics and tracing in
  Phase 14.
- **Internationalisation** — currency and locale handling from Phase 2;
  translated UI copy in Phase 14.
- **Accessibility** — keyboard and screen-reader support for every new surface.
- **Data retention and export** — required before launch, driven by the
  payments and messaging phases.
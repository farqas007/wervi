# Subsystems

WERVI is delivered one subsystem at a time. Each phase is built, verified with
`pnpm verify`, and reviewed before the next begins.

## Current status

| # | Subsystem | Status |
| --- | --- | --- |
| 1 | Foundation | **Complete** |
| 2 | Database core | Not started |
| 3 | Auth and accounts | Not started |
| 4 | Profiles | Not started |
| 5 | Jobs | Not started |
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

## 2. Database core

Tables for users, accounts, sessions and verification tokens. Enums for roles
and account status. First migrations, a seed script with realistic development
data, and integration tests that run against a real Postgres instance.

Depends on: nothing.

## 3. Auth and accounts

Registration, email verification, login, logout, session management and
password reset using Better Auth with the Drizzle adapter. Role guards and an
authorization helper for `client`, `freelancer` and `admin`. Rate-limited
endpoints and account lockout on repeated failures.

Depends on: 2.

## 4. Profiles

Freelancer profiles: headline, biography, hourly or fixed rates, availability,
skills with proficiency, languages, timezone, and portfolio items with
attachments on Cloudflare R2. Public profile pages that are server-rendered and
indexable.

Depends on: 3.

## 5. Jobs

Job lifecycle: draft, published, paused, closed. Budget models (fixed and
hourly), experience level, duration, visibility, and attachments. Public
browse and search using PostgreSQL full-text search with `pg_trgm` fuzzy
matching, plus filters, sorting and pagination. Categories and skill taxonomy.

Depends on: 3.

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
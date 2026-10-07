# Database

The PostgreSQL schema, how it is changed, and the rules that keep it honest.
Companion to `docs/ARCHITECTURE.md` (package layout) and `docs/SUBSYSTEMS.md`
(what each phase delivers).

## Ownership

| Package | Owns |
| --- | --- |
| `packages/shared` | Vocabularies, statuses, transitions, money utilities |
| `packages/db` | Tables, constraints, indexes, migrations, seed, client |
| `apps/api` | Repositories. No table definitions, no SQL strings |

`@wervi/db` depends on `@wervi/shared`, never the other way round. A table
column that is restricted to a shared vocabulary takes its allowed values from
there, which is why adding a status is one edit in one file: the CHECK
constraint, the Zod schema and the TypeScript type all follow.

## Layout

```
packages/db/src/schema/
  common/          column and CHECK constraint factories
  auth/            users, auth_accounts, auth_sessions, auth_verifications
  taxonomy/        categories, skills
  profiles/        freelancer_profiles, client_profiles, profile_skills,
                   profile_languages, portfolio_items
  jobs/            jobs, job_skills
  proposals/       proposals
  contracts/       contracts
  milestones/      milestones, milestone_deliveries
  reviews/         reviews
  audit/           audit_log
  index.ts         barrel: tables only, re-exported by the package root
```

`schema/index.ts` exports tables and nothing else. Helpers are imported from
`schema/common/index.js` directly, because Drizzle discovers schema through that
barrel and would otherwise treat a helper as a table.

## Conventions

**Types and defaults.**

- Primary keys are `uuid` with `gen_random_uuid()`.
- Columns shared by most tables come from `schema/common/columns.ts`:
  `primaryId`, `createdAt`, `updatedAt`, `requiredTimestamp`,
  `optionalTimestamp`, `dateOnly`, `minorUnits`, `currencyCode`, `enumColumn`,
  `optionalEnumColumn`.
- `enumColumn(name, values)` writes `text` with a CHECK constraint generated
  from the shared list, not a PostgreSQL enum type. Drizzle cannot see a value
  added to a `pgEnum`, so a new enum value would need a hand-written
  `ALTER TYPE` that the CI drift check cannot verify. A CHECK constraint
  evolves as an ordinary generated migration.

**Money.** `bigint` minor units plus an ISO 4217 code, always paired. Rates use
the shared money utilities for conversion and formatting, so no float ever
touches an amount.

**Timestamps.** `timestamptz` everywhere; `date` only for calendar dates such as
`due_date` and `starts_on`. `created_at` and `updated_at` are maintained by the
`wervi_touch_updated_at` trigger from the custom migration, so an update that
bypasses the application still records when it happened.

**Foreign keys.** Choose the delete rule from the meaning, not from convenience:

- `cascade` — a child that cannot exist without its parent: profile rows,
  auth sessions, job skills, milestone deliveries
- `restrict` — a reference that history depends on: job to client, contract to
  proposal, skill to category
- `set null` — an attribution that should survive the person leaving:
  `audit_log.actor_user_id`, `milestone_deliveries.reviewed_by`

**What the database enforces.** Rules that a race, a second code path or a buggy
client could break belong in the schema, not in a service. The rules currently
enforced here:

- a job has at most one accepted proposal (partial unique index)
- a job has at most one open contract (partial unique index)
- one proposal per freelancer per job
- a proposal's `client_id` matches the job's client (composite foreign key), and
  it differs from the freelancer's id
- one contract per proposal, and one review per party per contract
- one delivery per revision number per milestone
- a published job has `published_at`; a completed contract has `completed_at`; a
  cancelled contract has `cancelled_at`
- amounts are positive where zero is meaningless, non-negative where zero is
  legitimate; a budget range does not run backwards
- an optional rate and its currency are set together

**Indexes.** Every index answers a query the phase that needs it will make.
Foreign key columns that are filtered on are indexed; enum columns that will be
filtered or sorted on are indexed; unique constraints have unique indexes. Search
indexes (trigram, `tsvector` GIN) live in the custom migration rather than in
the schema, because a generated `tsvector` column emits invalid DDL and a
functional index cannot be expressed as a generated column at all.

## Changing the schema

1. Edit the table module in `packages/db/src/schema/<domain>/`.
2. If a value list changed, edit the list in `@wervi/shared` first — that is the
   single source for the CHECK constraint, the Zod schema and the type.
3. `pnpm db:generate`, then read the generated SQL. A CHECK constraint diff is
   fine; a dropped column or index usually means a typo in the schema file.
4. For anything Drizzle cannot express, `pnpm --filter @wervi/db generate --custom
   --name=<what>` and write the SQL by hand. Keep the `--> statement-breakpoint`
   markers so the migrator sends statements one at a time.
5. `pnpm db:migrate` against a development database, never production.
6. `pnpm verify`.

Never edit a committed migration. CI applies every migration to an empty
database and then fails if `pnpm db:generate` reports a difference, so a
migration that does not match the schema is a build failure.

Two things that need a custom migration rather than a schema edit:

- `generatedAlwaysAs` expressions and any interpolated value inside DDL. A
  number in a `sql` template becomes a bind parameter, and a `$1` in a CHECK
  constraint is invalid in a migration file. The helpers in
  `schema/common/constraints.ts` quote numeric bounds with `sql.raw` for exactly
  this reason.
- Full-text and trigram indexes, plus the `updated_at` trigger.

## Seed

`pnpm db:seed` truncates and reseeds, in one transaction, with fixed ids and a
fixed timestamp: the same command always produces the same rows, so a broken
seed can be reproduced and a diff means a real change. It is development and CI
data only — `TRUNCATE` is the first statement and is not filtered, so never point
it at anything you care about.

The data is chosen to exercise the constraints: a job with an accepted proposal
and a second candidate, a draft job with no `published_at`, a freelancer with no
listed rate, a milestone with two delivery revisions, both review directions.

## Tests

`packages/db` integration tests need a real PostgreSQL, because most of what
they check — CHECK constraints, partial unique indexes, composite foreign keys,
the trigger — only exists in the database.

Resolution order, in `packages/db/src/testing/harness.ts`:

1. `DATABASE_TEST_URL`
2. `DATABASE_URL`, but only if its database name contains `test`
3. otherwise the suites skip

The suites truncate every table between tests. A dedicated test database is
required, not merely advisable: the generated foreign keys reference
`"public"."users"` explicitly, so a schema other than `public` in `search_path`
cannot resolve them.

```bash
# local, when you have a throwaway database
DATABASE_TEST_URL=postgresql://wervi:wervi@localhost:5432/wervi_test \
  pnpm --filter @wervi/db test
```

CI runs the same suites against a `postgres:17` service database named
`wervi_test`, and a separate job applies the migrations to an empty database and
fails on drift.

## Known seams

Left out on purpose, each with the place it will attach:

- **Attachments.** `portfolio_items` and `jobs` have no file columns. Phase 4
  adds a `files` table keyed to the owning row; nothing here stores a URL.
- **Payments.** No ledger, escrow or commission tables; milestone `funded_at`,
  `released_at` and `disputed_at` are the hooks Phase 9 and 10 use.
- **Messaging.** Phase 8 adds threads keyed to `contracts.id`.
- **Reputation.** No aggregates on the profile tables; Phase 11 denormalises
  computed review totals rather than storing them per review.
- **`jobs.proposal_count`** is a denormalised counter maintained by the
  proposal service in Phase 6. It is constrained non-negative, not derived, so
  browse queries never run a `COUNT(*)` per row.
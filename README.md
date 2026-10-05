# WERVI

A global freelancer marketplace. Clients post jobs, freelancers submit
proposals, clients hire, and the resulting projects are managed through
milestone-based escrow payments, messaging, reviews and disputes.

WERVI is being built subsystem by subsystem. This repository currently
contains **Phase 1 — the project foundation**.

---

## Stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript 5.9 (end to end) |
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| API | Fastify 5, REST + OpenAPI 3.1 |
| Contracts | Zod 4, shared via `@wervi/shared` |
| Auth | Better Auth (planned, Phase 3) |
| Database | PostgreSQL + Drizzle ORM |
| Tests | Vitest, Playwright (planned) |
| CI | GitHub Actions |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the reasoning behind each
choice and [docs/SUBSYSTEMS.md](docs/SUBSYSTEMS.md) for the delivery plan.

---

## Requirements

- Node.js 22 (see `.nvmrc`)
- pnpm 12 (`corepack enable`)
- A PostgreSQL database. The recommended development setup is the free Neon
  tier, which needs nothing installed locally.

## Setup

```bash
pnpm install
cp .env.example .env      # then fill in DATABASE_URL
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000
- API docs: http://localhost:4000/docs
- OpenAPI document: http://localhost:4000/openapi.json

If you prefer a local database instead of Neon, `docker-compose up -d` starts
Postgres and Redis, and `.env` should point at
`postgresql://wervi:wervi@localhost:5432/wervi` with `DATABASE_SSL=disable`.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run web and API in watch mode |
| `pnpm build` | Build every package |
| `pnpm typecheck` | Type-check every package |
| `pnpm lint` | Lint (ESLint 10, type-aware) |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm test` | Unit and integration tests |
| `pnpm verify` | Everything CI runs, in order |
| `pnpm db:generate` | Create a migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:seed` | Seed development data |
| `pnpm db:studio` | Open Drizzle Studio |

## Repository layout

```
apps/
  api/       Fastify REST API and background workers
  web/       Next.js application
packages/
  db/        Drizzle schema, migrations, connection pool
  shared/    Zod contracts, types and utilities used by both apps
docs/        Architecture notes and the subsystem delivery plan
```

Layering rule inside `apps/api`: `routes -> service -> repository`. Drizzle
queries never appear in route handlers, and Zod request/response schemas never
appear in repositories.

## Conventions

- **Money is integer minor units.** Never a float. Use the helpers in
  `@wervi/shared/utils/money`, which also handle currencies with zero or three
  decimal places.
- **Statuses are enums with validated transitions**, checked in the service
  layer.
- **Configuration is validated at boot.** The API refuses to start on invalid
  environment variables rather than failing later during a request.

## License

MIT
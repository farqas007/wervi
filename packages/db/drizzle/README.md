Generated SQL migrations live here and are committed to git.

Create a migration after editing `src/schema/`:

    pnpm db:generate

Apply pending migrations:

    pnpm db:migrate

Never edit an already-applied migration by hand — add a new one instead.

## Custom migrations

Anything Drizzle cannot generate — a trigger, a function, an extension, a
functional index — goes in a custom migration:

    pnpm --filter @wervi/db generate --custom --name=<what>

Keep the `--> statement-breakpoint` markers between statements: the migrator
splits on them and sends each statement on its own connection round trip. Write
the statements idempotently (`if not exists`, `create or replace`) so the file
can be re-applied by hand.

`0000_*` is the generated baseline. `0001_*` is hand-written and holds the
`updated_at` trigger, `pg_trgm` with trigram indexes, and the full-text indexes.
Both are applied by `pnpm db:migrate`; see `docs/DATABASE.md` for the full
conventions.

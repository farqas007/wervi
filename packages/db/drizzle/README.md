Generated SQL migrations live here and are committed to git.

Create a migration after editing `src/schema/`:

    pnpm db:generate

Apply pending migrations:

    pnpm db:migrate

Never edit an already-applied migration by hand — add a new one instead.

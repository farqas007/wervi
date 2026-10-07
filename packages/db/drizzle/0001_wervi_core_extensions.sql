-- Custom SQL migration: things Drizzle cannot express as schema definitions.
--
--   1. `wervi_touch_updated_at` plus triggers, so `updated_at` stays correct
--      even for writes that do not go through the application (admin SQL, a
--      data fix, a future worker). Application code sets it as well; the trigger
--      is the backstop, not the mechanism.
--   2. `pg_trgm` and trigram indexes, for the "did you mean" matching that
--      Phase 8 search needs.
--   3. Full-text search over jobs and profiles, as functional GIN indexes.
--      A generated `tsvector` column was the obvious alternative and does not
--      work here: Drizzle emits `$1` for a generated expression, which is not
--      valid DDL in a migration file.
--
-- Statements are separated with the same statement-breakpoint marker the
-- generated migrations use, so the migrator sends them one at a time. They are
-- also idempotent, so this file can be re-run by hand against a database that
-- already has the objects.
--
-- Do not re-create this file with `generate --custom`: that truncates whatever
-- is here. Add a new `0002_*` instead.

-- 1. updated_at triggers ---------------------------------------------------

CREATE OR REPLACE FUNCTION wervi_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'users',
    'auth_accounts',
    'auth_sessions',
    'auth_verifications',
    'categories',
    'skills',
    'client_profiles',
    'freelancer_profiles',
    'portfolio_items',
    'jobs',
    'proposals',
    'contracts',
    'milestones',
    'reviews'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', target || '_touch_updated_at', target);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION wervi_touch_updated_at()',
      target || '_touch_updated_at',
      target
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

-- 2. Trigram indexes -------------------------------------------------------

-- Trigram matching needs pg_trgm. Safe to require: it ships with PostgreSQL as
-- a contrib module and is present both on Neon and on the CI service image.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS jobs_title_trgm_idx ON jobs USING gin (title gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS jobs_description_trgm_idx ON jobs USING gin (description gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS freelancer_profiles_headline_trgm_idx
  ON freelancer_profiles USING gin (headline gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS categories_name_trgm_idx ON categories USING gin (name gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS skills_name_trgm_idx ON skills USING gin (name gin_trgm_ops);
--> statement-breakpoint

-- 3. Full-text search ------------------------------------------------------

-- coalesce keeps a row searchable by whichever fields actually have text, and
-- the explicit 'english' selects the two-argument `to_tsvector`, which is
-- immutable and therefore allowed inside an index expression.
CREATE INDEX IF NOT EXISTS jobs_search_idx ON jobs USING gin (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS freelancer_profiles_search_idx ON freelancer_profiles USING gin (
  to_tsvector('english', coalesce(headline, '') || ' ' || coalesce(bio, ''))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS skills_search_idx ON skills USING gin (
  to_tsvector('english', coalesce(name, ''))
);
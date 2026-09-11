# PostgreSQL migration convention

TypeORM migrations in this directory are the executable schema history. They
are run explicitly through the migration CLI; the API and worker never run
migrations at startup.

- Use a timestamp-prefixed filename and an exported, uniquely named migration
  class (for example, `20260904123000-add-projects.ts`).
- A capability phase owns the tables, indexes, foreign keys, partial indexes,
  and `CHECK` constraints it needs. Do not add future business schema here in
  advance.
- Keep `up` and `down` reversible while that is safe. A migration that cannot
  be safely reversed must document why in its source.
- Use PostgreSQL SQL directly when TypeORM metadata cannot faithfully express
  a Frozen Data Model requirement, including `citext`, composite constraints,
  partial indexes, and `CHECK` constraints.
- Validate a migration from an empty disposable database and rerun it before
  treating it as deployed. Do not run migration commands against an unconfirmed
  Supabase project or environment.

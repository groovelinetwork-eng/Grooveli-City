# Grooveli seed package

A database seed for **development and staging only**, built from the frontend's existing mock data. With it, API mode shows the same organisations, vacancies, people, HR records, events and communities that mock mode shows today.

The frontend team prepared this package. The backend team reviews it and runs it; see [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md). Nothing here changes the backend, its schema, its migrations or the frontend fixtures, and nothing here has been run against a real database server.

## What's in the folder

| File | What it is |
|---|---|
| [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md) | Step by step for the backend team: verify the target, back up, check migrations, career content, anchor date, run, verify, provision, smoke-test |
| [DATA_MAPPING.md](DATA_MAPPING.md) | Every mock dataset → database table and column, the account and permission model, duplicate resolution, resolved issues and what isn't migrated |
| [VALIDATION_REPORT.md](VALIDATION_REPORT.md) | Generated. Row counts, persona identity, merges, permission table, static checks, dry-run results. |
| [POST_SEED_API_CHECKLIST.md](POST_SEED_API_CHECKLIST.md) | Generated. 87 API requests with the expected results, all checked against `openapi.json` |
| `seed.sql` | Generated. The seed: PostgreSQL, one transaction, insert-only, guarded, safe to re-run. |
| `post-seed-verify.sql` | Generated. Read-only checks to run straight after seeding. |
| `seed-data.json` | Generated. The same rows as JSON, keyed by table with database column names, plus the generation report and the unsupported records. |
| `ID_MAPPING.json` | Generated. Every account and why it exists, the test accounts, the persona identity decision, application merges, derived and remapped IDs. |
| `scripts/generate.mjs` | Rebuilds every generated file from the mock data |
| `scripts/validate.mjs` | Checks the package; `--dry-run` also runs it on throwaway in-memory PostgreSQL databases |
| `scripts/provision-accounts.mjs` | For the backend team: gives the 8 test accounts a password after seeding |
| `scripts/lib/` | Schema reader, SQL writer, shared integrity checks, checklist builder, TypeScript loader |

## Where the data comes from

The data comes from the same sources the frontend uses in mock mode. The generator imports them directly, so nothing is copied by hand:

- **Fixtures:** `frontend/domain/src/fixtures/*`.
- **Personas:** `frontend/domain/src/permissions.ts`.
- **Mock initial state:** `createInitialState()` in `frontend/web/src/lib/store/state.ts`.

The target schema is read from `backend/api/prisma/migrations/*/migration.sql`, the database's real definition. Effective permissions are read from `backend/api/src/auth/permissions.ts`, and the checklist endpoints from `backend/api/openapi/openapi.json`. All of these are read-only.

## Target database

- **PostgreSQL 13 or later**, with every migration applied by Prisma (`db:deploy`). The seed checks `_prisma_migrations` and refuses on any mismatch.
- **Development or staging, verified by a person.** The seed's flags are acknowledgements, not proof (see the handoff). Existing rows are never changed. The seed aborts, writing nothing, if a seed account or organisation would collide with an existing one.

## Regenerating

You need Node 22.18+, 23.6+ or 24+. Node loads the TypeScript mock data directly, so there is nothing to install or build.

```bash
# from the repository root
node frontend/seed-preparation/scripts/generate.mjs --anchor-date=2026-12-01   # use the day you will seed
node frontend/seed-preparation/scripts/validate.mjs
```

The output is deterministic: the same mock data and the same anchor date always give byte-identical files. `--anchor-date` moves every date by the same number of days, so that the mock "today" (2026-11-09) falls on the given day.

## Validating

```bash
node frontend/seed-preparation/scripts/validate.mjs            # static checks
node frontend/seed-preparation/scripts/validate.mjs --dry-run  # + execution on in-memory PostgreSQL (PGlite)
```

**Static checks:**
- tables, columns, required fields, data types and enums against the migrations;
- primary keys, unique constraints, foreign keys and insertion order;
- references the database doesn't enforce;
- the persona identity and the duplicate merges;
- least privilege against the backend's role matrix;
- no usable credentials anywhere in the package;
- SQL safety, including that `post-seed-verify.sql` is read-only;
- every checklist request against OpenAPI;
- determinism.

**The dry run** needs PGlite, which is not a project dependency. Install it outside the repository:

```bash
npm install --prefix /tmp/pglite @electric-sql/pglite@0.3.14
PGLITE_MODULE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js \
  node frontend/seed-preparation/scripts/validate.mjs --dry-run
```

It applies the 6 migrations to empty in-memory databases and records them in `_prisma_migrations`, as Prisma does. It then checks:
- every guard refuses when it should: no development flag, wrong target name, missing migration table, missing, extra or unfinished migration, colliding account, colliding organisation;
- the first run loads exactly the expected rows, and a second run changes nothing;
- the 14 relationship and permission checks pass;
- `post-seed-verify.sql` passes before and after provisioning, and flags a non-test account that has a password.

## Known limitations (accepted)

- **No real database has been tested.** The SQL has run only on PGlite (PostgreSQL 17.5 compiled to WebAssembly) with the real migrations. It has not run on a PostgreSQL server, staging or Render, and the live API hasn't been run against seeded data.
- **Provisioning is only partly tested.** The `--sql` route was tested on PGlite with the backend's argon2 library. The Prisma route needs the backend's packages installed and hasn't been run.
- **Accounts start locked.** Only the 8 designated test accounts can be given credentials.
- **No files.** CV and employee-document files don't exist, so those rows aren't seeded and no file URLs are invented.
- **Totals start from real rows.** Event, community, acknowledgement, reaction and RSVP totals come from real rows, not the mock's display numbers.
- **The seed follows the schema of 2026-11-23.** If the backend schema changes, regenerate and validate. The generator refuses migration statements it doesn't understand, and the seed refuses a database with a different migration set.

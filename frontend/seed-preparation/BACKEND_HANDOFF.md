# Seed package: backend handoff

**For:** the backend team
**From:** the frontend team

This is a PostgreSQL seed built from the frontend's mock data:
- 9 organisations and 32 vacancies;
- 60 accounts, including 8 test accounts, one per role;
- HR, payroll-preview, engagement and social records.

In total that's **1,134 rows in 37 tables**.

**Use it in development or staging only.** We haven't changed `backend/api`, the schema or the migrations. We haven't run the seed anywhere except throwaway in-memory PostgreSQL databases (PGlite). The live API hasn't been run against the seeded data.

## Before you start: review

- [DATA_MAPPING.md](DATA_MAPPING.md): how each dataset maps onto your tables, the account and permission model (§2), duplicate resolution (§5) and resolved issues (§6).
- [VALIDATION_REPORT.md](VALIDATION_REPORT.md): row counts, the permission table, static checks and dry-run results.
- `seed.sql`: insert-only, with no `DROP`, `TRUNCATE`, `DELETE`, `UPDATE` or schema change.

## Step 1. Verify the target environment yourself

The seed's flags are acknowledgements, not proof that a database is safe. Before running anything, a backend team member must confirm all of the following independently:

- [ ] **The database is development or staging.** Check the host, the database name, the cloud project or service and the credentials owner. It must not be production, and it must not be any database holding real users.
- [ ] **You know which database `DATABASE_URL` points at.** Connect and run `SELECT current_database(), inet_server_addr(), current_user;`, and compare the result with what you expect.
- [ ] **No real personal data lives there.** For example, check that `SELECT count(*) FROM "User" WHERE email NOT LIKE '%.example';` is 0, or is only your team's own development accounts.
- [ ] **Someone with authority over that environment has agreed to the seed.**

We (frontend) haven't run this against Render, staging or any remote database, and we won't.

## Step 2. Prepare recovery

The seed has no undo script on purpose. To remove seed data, you restore.

- [ ] **Take a backup**, for example `pg_dump --format=custom --file=before-seed.dump "$DATABASE_URL"`, or a provider snapshot.
- [ ] **Confirm the restore works.** At minimum, `pg_restore --list before-seed.dump` should succeed.

## Step 3. Check migration compatibility

- [ ] **Apply the migrations:** `pnpm --filter @grooveli/api db:deploy`. Then run `prisma migrate status`, which must report that the schema is up to date.
- [ ] **Match the migration set.** The seed was generated against exactly these migrations (`seed.sql` header); the newest is `20261123131048_assistant_markets_games`.
  - The seed **refuses to run** if `_prisma_migrations` is missing, a migration is unfinished, one of these is missing, or any other migration is present.
  - If your schema has moved on, regenerate and validate first (Step 5).

## Step 4. Load career content

The seed doesn't touch the career-content tables, so order doesn't matter for correctness. Load them first, so the post-seed checks for missions, challenges and courses pass:

```bash
pnpm --filter @grooveli/api db:content
```

## Step 5. Regenerate for the seeding day

The mock data is dated around 2026-11-09:
- the API hides vacancies whose `closesOn` has passed and events that have ended;
- seeded events end within 12 days of the anchor date.

Regenerate on the day you seed. This needs Node 22.18+, and nothing has to be installed.

```bash
node frontend/seed-preparation/scripts/generate.mjs --anchor-date=$(date +%F)
node frontend/seed-preparation/scripts/validate.mjs          # add --dry-run with PGlite (README) for the full in-memory run
```

The output is deterministic: the same anchor date always gives identical files.

## Step 6. Run the seed

```bash
PGOPTIONS="-c grooveli.seed_allow=development -c grooveli.seed_target=<database name from step 1>" \
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f frontend/seed-preparation/seed.sql
```

What protects the run:

| Protection | Behaviour |
|---|---|
| One transaction | Any error rolls back everything; nothing is partially written |
| `grooveli.seed_allow = development` | An explicit acknowledgement that this is development/staging. It is **not** a safety check of the database. |
| `grooveli.seed_target` | Must equal `current_database()`: you name the database you verified in Step 1 |
| Migration guard | Refuses unless `_prisma_migrations` lists exactly the expected finished migrations |
| Collision detection | Aborts, writing nothing, if a seed email or user ID belongs to a different existing account, or if a seed organisation ID belongs to a differently named organisation |
| Safe repeat | Every insert is `ON CONFLICT DO NOTHING`. A second run adds only missing rows, never changes existing ones, and prints a notice that seed data is present. A repeat **does not move dates**: to re-anchor, restore the backup (Step 2) and seed again. |

## Step 7. Verify the database

```bash
psql "$DATABASE_URL" -f frontend/seed-preparation/post-seed-verify.sql
```

This is read-only. Every line must show `ok = t`:
- the row count of each table, counted by seeded IDs;
- 14 relationship and permission checks, for example: only test accounts can have a usable password, and non-test memberships are exactly `employee`.

The second result lists every seeded membership with its roles, so you can review least privilege.

Run it straight after seeding. Using the API afterwards (for example, joining a community) changes some counts.

## Step 8. Give the test accounts a password

Seeded accounts start with the placeholder hash `!seed:password-not-set`. `PasswordService.verify` catches Argon2's error on it and returns `false`, so nobody can sign in. Only the **8 test accounts** can be provisioned; the script has no option for any other account. Pick a development password that isn't used anywhere else.

```bash
pnpm install    # provides backend/api's @prisma/client and @node-rs/argon2

# A: through the backend's Prisma client
SEED_ALLOW=development SEED_TARGET_DATABASE=<database name> SEED_ACCOUNT_PASSWORD='<dev password>' DATABASE_URL='<dev db>' \
  node frontend/seed-preparation/scripts/provision-accounts.mjs

# B: as SQL piped straight into psql (don't save the output: it contains hashes)
SEED_ALLOW=development SEED_TARGET_DATABASE=<database name> SEED_ACCOUNT_PASSWORD='<dev password>' \
  node frontend/seed-preparation/scripts/provision-accounts.mjs --sql | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
```

The script:
- hashes with `@node-rs/argon2` using the parameters in `password.service.ts`, with a new salt per account;
- only touches accounts that still have the placeholder;
- refuses if the connected database isn't `SEED_TARGET_DATABASE`;
- never prints the password.

`--list` shows the 8 accounts without touching anything. Option B has been tested on PGlite; option A needs the backend packages installed and hasn't been run.

| Role | Email |
|---|---|
| Candidate | `tolu.adebayo@candidate.example` |
| Organisation admin / employer (Kestrel + Amberline) | `ifeoma@kestrel.example` |
| HR manager | `daniel@kestrel.example` |
| Recruiter | `zainab@kestrel.example` |
| Payroll officer | `chidi@kestrel.example` |
| HR manager + recruiter (Amberline) | `grace@amberline.example` |
| Employee + line manager | `kofi@kestrel.example` |
| Platform admin | `platform-admin@grooveli.example` |

- **Keep provisioned accounts off shared environments.** Don't provision them on a database reachable by people outside the team: a known password on an org-admin or platform-admin account is a real access path.
- **Share the password out of band.** Use a password manager, never the repository or chat.
- **Afterwards, re-run `post-seed-verify.sql`.** Only those 8 accounts may now have a usable password.

## Step 9. Smoke-test the API

Work through [POST_SEED_API_CHECKLIST.md](POST_SEED_API_CHECKLIST.md). It contains 87 requests, every one an operation in `openapi.json`, covering:
- health and sign-in for each test account;
- sessions and memberships;
- candidate data, vacancies, applications and organisations;
- HQs and city world data;
- events and communities;
- employees, recruitment, payroll and engagement;
- career content;
- the role-based refusals that must fail.

The checklist explains why API numbers are often smaller than database counts: filters, pagination, permissions, plan modules and dates.

## Open questions for you

1. **Platform admin account.** Do you want to keep `seed-platform-admin`? It is needed as the creator of the 6 events that no organisation admin hosts. Without it, those events would need another creator.
2. **Employee documents.** The 98 documents have no files and aren't seeded. If you want them, you would upload real placeholder files and create the rows yourselves.

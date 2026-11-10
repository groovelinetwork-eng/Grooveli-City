# Grooveli City — Full Frontend Monorepo Handoff v3
**Status (2026-11-09):** full first-build frontend implemented across `frontend/web`, `frontend/city` and the shared `frontend/domain` package, using synthetic mock adapters. See `docs/IMPLEMENTATION_STATUS.md` for what is real vs simulated.

## Running the frontend
```bash
pnpm install
pnpm dev:frontend      # web :3000 + city :3001 (city also proxied at :3000/city)
pnpm dev:web           # http://localhost:3000
pnpm dev:city          # http://localhost:3001/city/
```
Sign in at `/login` with any **demo persona** (candidate, organisation admin, HR manager, recruiter, payroll officer, employee). All data is synthetic and stored in the browser; reset it from Settings.

| Package | Checks |
|---|---|
| `@grooveli/frontend-domain` | `pnpm --filter @grooveli/frontend-domain test` · `typecheck` |
| `@grooveli/web` | `pnpm --filter @grooveli/web typecheck` · `lint` · `test` · `build` |
| `@grooveli/city` | `pnpm --filter @grooveli/city typecheck` · `lint` · `test` · `build` (includes the private-data bundle check) |
| `@grooveli/frontend-e2e` | build web and city, run `pnpm --filter @grooveli/frontend-e2e install-browsers` once, then `pnpm --filter @grooveli/frontend-e2e test` |

Configuration values are all public; never put secrets in them. Web: `frontend/web/.env.example` (`NEXT_PUBLIC_DATA_MODE=mock|api`, `NEXT_PUBLIC_CITY_URL`). City: `frontend/city/.env.example` (`VITE_WEB_URL`, `VITE_DATA_MODE`). `api` mode fails visibly until backend endpoints exist. City URL options: `?district=<id>`, `?org=<id>`, `?renderer=2d` (accessible directory).

## Repository contract (do not flatten)
```
Grooveli-city/
├── frontend/
│   ├── web/         # Next.js + TypeScript :3000
│   └── city/        # Vite + React + TypeScript + Three.js/R3F/Drei :3001
├── backend/
│   └── api/         # NestJS :4000; owned by backend team
└── packages/
    └── shared/      # Shared types/utilities; coordinate changes
```
Only `frontend/` is the frontend team's implementation scope. The other paths show the existing repository contract; do not overwrite or scaffold backend/shared without team approval.

## How to install the handoff
Copy `CLAUDE.md` into the **actual monorepo root**; copy `docs/`, `references/`, and `source_documents/` to the monorepo root. **Do not replace existing app folders or workspace configuration.** Inspect existing files before adding or changing any code. Run Claude Code from the monorepo root and use `FIRST_BUILD_PROMPT.md`.

## Read order
1. `CLAUDE.md` and `docs/PRODUCT_MASTER_SPEC.md`
2. `docs/FRONTEND_BUILD_SPEC.md`, `docs/ARCHITECTURE.md`
3. `docs/IMPLEMENTATION_ROADMAP.md`, `docs/REQUIREMENTS_TRACEABILITY.md`
4. `docs/INTEGRATION_CONTRACTS.md`, `docs/SCOPE_AND_DECISIONS.md`
5. `docs/TECH_STACK_TEAM_UPDATE.md`, `docs/VISUAL_REFERENCE_GUIDE.md`
6. Both unchanged files in `source_documents/` and images in `references/`

`docs/archive/v2/` is retained for historical traceability only and contains superseded single-app guidance. The original product documents remain authoritative for product intent; the monorepo layout and full-first-build decision are user/team instructions overriding previous implementation assumptions.

## Meaning of complete first frontend build
All three ecosystems and major documented screens/workflows must be implemented in both frontend apps as appropriate, with typed **synthetic** mock adapters for unavailable APIs. It does not mean production payroll processing, real AI inference, secure authentication services or real multiplayer have been delivered. Those require backend work and formal integration.

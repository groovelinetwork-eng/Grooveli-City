# Grooveli City — Full Frontend Monorepo Handoff v3
**Status:** architecture aligned to the team's repository layout, 2026-11-09. No code started. Full frontend scope approved. This is documentation, not application source code.

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

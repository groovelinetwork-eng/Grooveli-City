# Grooveli City

Turborepo monorepo with pnpm workspaces.

## Structure

```
Grooveli-city/
├── frontend/
│   ├── web/          → Next.js           :3000
│   └── city/         → Three.js + Vite   :3001
├── backend/
│   └── api/          → NestJS            :4000
├── packages/
│   └── shared/       → Shared types & utils
```

## Commands

```bash
pnpm dev              # Run all apps
pnpm dev:web          # Next.js only
pnpm dev:city         # Three.js + Vite only
pnpm dev:api          # NestJS only
pnpm dev:frontend     # Both frontend apps
pnpm build            # Build everything
```

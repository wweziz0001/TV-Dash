# TV-Dash

TV-Dash is a self-hosted IPTV and Web TV control surface built for operators who need real HLS playback, manual quality switching, and multi-view monitoring from one browser-based workspace.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, React Query, HLS.js
- Backend: Node.js, Fastify, Prisma, Zod
- Database: PostgreSQL
- Shared contracts: workspace package with shared Zod schemas and types

## Implemented MVP

- Admin authentication with seeded `ADMIN` and `USER` accounts
- Channel groups and channel CRUD backed by PostgreSQL
- One master HLS URL per logical channel
- Real HLS.js playback with detected quality levels and preserved `Auto` mode
- Single-channel watch page
- Multi-view layouts: `1x1`, `2x2`, `3x3`, `1+2`, `1+4`
- Favorites and saved layout persistence
- Stream test endpoint plus admin preview player

## Workspace Layout

```text
docs/
  architecture/  Repository policy, structure, API, player, and testing docs
  decisions/     ADR-style decision records
  runbooks/      Local development and release procedures
  handoff/       Current-state context for future Codex sessions
apps/
  api/           Fastify API, Prisma schema, migrations, seed data
  web/           React/Vite operator UI and admin experience
packages/
  shared/        Shared Zod schemas and TypeScript contracts
scripts/         Local smoke test helper
tests/           Reserved for future cross-workspace regression suites
```

## Local Run

1. Copy the root env file:
   - `cp .env.example .env`
2. Ensure PostgreSQL is available at the `DATABASE_URL` in `.env`.
3. Apply the database schema and seed data:
   - `npm run db:generate`
   - `cd apps/api && dotenv -e ../../.env -- prisma migrate deploy`
   - `npm run db:seed`
4. Start the apps:
   - `npm run dev`
5. Verify locally:
   - `npm run lint`
   - `npm run test`
   - `npm run build`
6. Optional smoke test against a running API:
   - `npm run smoke:test`

## Seeded Accounts

- Admin: `admin@tvdash.local` / `Admin123!`
- Viewer: `viewer@tvdash.local` / `Viewer123!`

## Key URLs

- Web app: `http://localhost:5173`
- API: `http://localhost:4000/api`
- Health check: `http://localhost:4000/api/health`

## More Detail

- [docs/architecture/project-structure.md](docs/architecture/project-structure.md)
- [docs/architecture/development-policy.md](docs/architecture/development-policy.md)
- [docs/architecture/testing-strategy.md](docs/architecture/testing-strategy.md)
- [docs/architecture/player-architecture.md](docs/architecture/player-architecture.md)
- [docs/architecture/api-boundaries.md](docs/architecture/api-boundaries.md)
- [docs/handoff/codex-handoff.md](docs/handoff/codex-handoff.md)
- [docs/handoff/codex-session-log.md](docs/handoff/codex-session-log.md)

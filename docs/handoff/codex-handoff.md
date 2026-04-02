# Codex Handoff

## Project Purpose

TV-Dash is a self-hosted IPTV/Web TV operations platform. Operators manage logical channels backed by master HLS playlists, watch single feeds, compose multi-view walls, favorite channels, and save layouts.

## Current Architecture Summary

- Monorepo with `apps/api`, `apps/web`, and `packages/shared`
- Backend now follows explicit `routes -> services -> repositories -> prisma` boundaries inside `apps/api/src/modules`
- Frontend keeps app bootstrap in `app`, route screens in `pages`, shared UI in `components`, auth in `features`, request logic in `services`, and player-specific code in `player`
- Shared API validation contracts live in `packages/shared`

## Standards Rulebook

Repository-specific engineering standards now live under `docs/standards/`.

Key references:

- `docs/standards/coding-standards.md`
- `docs/standards/naming-conventions.md`
- `docs/standards/react-typescript-standards.md`
- `docs/standards/backend-api-standards.md`
- `docs/standards/prisma-database-standards.md`
- `docs/standards/player-hls-standards.md`
- `docs/standards/testing-standards.md`

Future sessions should read those before making structural, player, API, or naming changes. They are the active engineering rulebook for TV-Dash.

## Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS, React Query, HLS.js
- Backend: Node.js, Fastify, Prisma, Zod, JWT auth
- Database: PostgreSQL
- Tests: Vitest in `apps/api` and `apps/web`

## Folder Structure

```text
docs/
  architecture/
  decisions/
  runbooks/
  handoff/
apps/
  api/
    prisma/
    src/
      app/
      config/
      db/
      modules/
  web/
    src/
      app/
      components/
      features/
      pages/
      player/
      services/
      styles/
      types/
packages/
  shared/
scripts/
tests/
```

## Key Backend Modules

- `auth`: login and current user lookup
- `channels`: logical channel catalog CRUD and browse lookups
- `groups`: category/group CRUD
- `favorites`: per-user pinned channels
- `layouts`: saved multi-view walls
- `streams`: HLS metadata and stream test endpoints
- `health`: readiness endpoint

## Database Overview

Prisma schema lives in `apps/api/prisma/schema.prisma`.

Main models:

- `User`
- `ChannelGroup`
- `Channel`
- `Favorite`
- `SavedLayout`
- `SavedLayoutItem`

Key relationship rules:

- a channel optionally belongs to a group
- favorites are per-user per-channel
- saved layouts are per-user and contain ordered tile items
- each logical channel stores one master HLS URL

## Player Architecture Overview

- `player/hls-player.tsx` owns one video element and one HLS.js instance
- quality options and preference resolution live in `player/quality-options.ts`
- supported multi-view layouts live in `player/layouts.ts`
- tile defaults and one-active-audio rules live in `player/multiview-layout.ts`

## Important Conventions

- Backend routes validate and translate HTTP only.
- Backend repositories are the only place Prisma queries belong.
- Frontend pages orchestrate; they do not become dumping grounds for reusable logic.
- Frontend services own HTTP requests.
- Frontend player behavior stays inside `src/player`.
- Cross-app contracts go in `packages/shared`; app-local types stay local.
- Frontend request payloads should use shared DTO types instead of `unknown` or ad-hoc object shapes.
- Saved layout config is now modeled as real JSON in shared contracts, not as an unbounded `any` record.

## Testing Status

Current automated coverage includes:

- API health boot/injection test
- HLS master playlist parsing test
- player quality option resolution tests
- multi-view tile default/audio ownership tests

Mandatory verification commands:

- `npm run lint`
- `npm run test`
- `npm run build`

Optional but recommended for risky changes:

- `npm run smoke:test`

## Known Issues

- Vite still warns that the player chunk is large; route-level lazy loading is the next high-value frontend optimization.
- CRUD-heavy API integration tests against an isolated database are not built yet.
- Player component-level UI tests are not built yet.
- Admin reorder remains sort-order based rather than drag-and-drop.
- `admin-channels-page.tsx`, `multiview-page.tsx`, and `player/hls-player.tsx` are still valid but near the current complexity ceiling defined in the standards docs.

## Next Recommended Priorities

1. Add Fastify integration tests for auth, channels, favorites, and layouts with isolated test data.
2. Add route-level lazy loading to reduce the large player bundle warning.
3. Add player/component regression tests around selector UI, retry UI, and saved-layout application.
4. Upgrade touched backend routes from simple param/query casts to explicit route-edge validation as those modules evolve.
5. Consider an ADR if a future session wants to extract shared backend runtime code into packages.

## Exact Local Commands

1. `cp .env.example .env`
2. `npm install`
3. `npm run db:generate`
4. `npm run db:deploy`
5. `npm run db:seed`
6. `npm run dev`
7. `npm run lint`
8. `npm run test`
9. `npm run build`
10. `npm run smoke:test`

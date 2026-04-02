# Codex Handoff

## Project Purpose

TV-Dash is a production-oriented self-hosted IPTV/Web TV platform foundation. It lets operators browse channels, watch a single feed, run multi-view monitoring walls, and manage channel metadata from an admin panel while keeping each channel represented as one logical entity backed by a single HLS master playlist URL.

## Architecture Summary

- `apps/api`: Fastify REST API with Prisma, JWT auth, Zod-backed validation, stream inspection, and PostgreSQL persistence.
- `apps/web`: React + Vite single-page app with protected admin/operator routes, React Query data access, and HLS.js playback.
- `packages/shared`: shared Zod schemas and common TypeScript contracts used by both the API and the frontend.
- `docs`: implementation handoff and session notes.
- `scripts`: smoke-test helper for quick API verification.

## Chosen Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS, React Query, HLS.js
- Backend: Node.js, Fastify, Prisma, Zod, JWT auth
- Database: PostgreSQL
- Shared package: workspace package `@tv-dash/shared`

## Folder Structure

```text
apps/
  api/
    prisma/
      migrations/
      schema.prisma
      seed.ts
    src/
      lib/
      plugins/
      routes/
      app.ts
      server.ts
  web/
    src/
      app/
      components/
      features/
      lib/
      pages/
      styles/
packages/
  shared/
    src/index.ts
docs/
  codex-handoff.md
  codex-session-log.md
scripts/
  smoke-test.sh
```

## Environment Variables

Defined in the root `.env.example`:

- `DATABASE_URL`: PostgreSQL connection string used by Prisma and the API
- `JWT_SECRET`: signing secret for Fastify JWT
- `API_PORT`: API server port
- `CLIENT_URL`: allowed CORS origin for the web app
- `VITE_API_BASE_URL`: web app API base URL

## Database Schema Summary

- `User`
  - `id`, `email`, `username`, `passwordHash`, `role`, timestamps
- `ChannelGroup`
  - `id`, `name`, `slug`, `sortOrder`, timestamps
- `Channel`
  - `id`, `name`, `slug`, `logoUrl`, `masterHlsUrl`, `groupId`, `isActive`, `sortOrder`, timestamps
- `Favorite`
  - `id`, `userId`, `channelId`, `createdAt`
- `SavedLayout`
  - `id`, `userId`, `name`, `layoutType`, `configJson`, timestamps
- `SavedLayoutItem`
  - `id`, `savedLayoutId`, `tileIndex`, `channelId`, `preferredQuality`, `isMuted`

Migration created:

- `apps/api/prisma/migrations/202604020001_init/migration.sql`

## Implemented Features

- JWT-backed auth with seeded admin and viewer accounts
- Channel group CRUD
- Channel CRUD with one master HLS URL per channel
- Stream test endpoint that inspects HLS master playlists and reports detected variants
- Admin preview player for channel forms
- Single-player watch page with real HLS.js integration
- Detected quality levels exposed in the UI with `Auto` preserved
- Retry/reconnect behavior for HLS fatal network/media errors
- Multi-view layouts:
  - `1x1`
  - `2x2`
  - `3x3`
  - `1 large + 2 small`
  - `1 large + 4 small`
- Per-tile controls:
  - channel selection
  - mute/unmute with one active audio tile
  - fullscreen
  - quality selection
  - loading and retry states
- Favorites
- Saved multi-view layouts
- Search and category filtering on the main browse page
- Root smoke-test script for API verification

## Current Limitations

- The frontend is a single SPA bundle plus a separate HLS/player chunk; route-level lazy loading is not added yet.
- The app uses seeded credentials and local JWT auth only; no registration, password reset, or RBAC expansion yet.
- Stream testing validates availability and master playlist variants, but it does not yet record deep codec metadata, DRM, captions, or long-running health probes.
- The admin reorder flow uses sort-order swaps rather than drag-and-drop.
- Browser autoplay rules can still block immediate audio playback on the one unmuted tile until user interaction, even though the UI and retry logic are browser-safe.
- No automated unit/integration test suite exists yet; current verification is lint/build plus smoke testing.

## Next Recommended Tasks

1. Add route-level lazy loading and heavier asset splitting for the web app.
2. Add richer stream metadata parsing and optional background health checks for channels.
3. Introduce drag-and-drop reorder for channels and saved layout editing.
4. Add automated API and frontend tests around auth, CRUD flows, and HLS player state handling.
5. Add audit logging and stronger role separation for production admin usage.

## Local Run Instructions

1. Copy env vars:
   - `cp .env.example .env`
2. Make sure PostgreSQL is available for the `DATABASE_URL` in `.env`.
3. Generate Prisma client:
   - `npm run db:generate`
4. Apply the migration:
   - `cd apps/api && dotenv -e ../../.env -- prisma migrate deploy`
5. Seed development data:
   - `npm run db:seed`
6. Start both apps:
   - `npm run dev`
7. Optional API smoke test:
   - `npm run smoke:test`

## Admin Usage Guide

- Sign in with `admin@tvdash.local / Admin123!`
- Open `/admin/groups` to create or edit browse categories
- Open `/admin/channels` to add/edit/delete channels, test HLS URLs, preview playback, and adjust sort order
- Use the main dashboard to browse/filter channels and favorite them
- Open `/multiview` to build or recall saved walls

## Player Design Notes

- Each logical channel stores only a master playlist URL.
- HLS.js parses manifest levels and exposes them as `Auto` plus explicit resolution options.
- The player destroys HLS instances on unmount and on source changes.
- Fatal HLS network/media errors attempt reconnect/recovery before surfacing a retry UI.
- Background multi-view tiles bias toward lower startup quality through initial preference handling.

## Known Seed Data

- Admin: `admin@tvdash.local / Admin123!`
- Viewer: `viewer@tvdash.local / Viewer123!`
- Seeded channels: `TV Dash Live`, `Match Center`, `Cinema One`, `Pulse 24`

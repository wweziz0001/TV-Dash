# Codex Handoff

## Project Purpose

TV-Dash is a self-hosted IPTV/Web TV operations platform. Operators manage logical channels backed by master HLS playlists, watch single feeds, compose multi-view walls, favorite channels, and save layouts.

The current operator milestone also adds:

- drag-to-swap multi-view tile reassignment
- focused-tile quick actions and keyboard shortcuts
- searchable quick channel switching in single-view and multiview
- now/next guide context on dashboard cards, multiview tiles, and single-view detail panels
- clearer saved-layout save/update/load ergonomics

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
- `channels`: logical channel catalog CRUD, browse lookups, playback-mode metadata, and channel-to-EPG linking
- `epg`: EPG source CRUD, XMLTV preview/loading, and now/next lookup
- `groups`: category/group CRUD
- `favorites`: per-user pinned channels
- `layouts`: saved multi-view walls
- `streams`: HLS metadata, stream test endpoints, and proxy gateway foundation
- `health`: readiness endpoint

## Database Overview

Prisma schema lives in `apps/api/prisma/schema.prisma`.

Main models:

- `User`
- `ChannelGroup`
- `Channel`
- `EpgSource`
- `Favorite`
- `SavedLayout`
- `SavedLayoutItem`

Key relationship rules:

- a channel optionally belongs to a group
- a channel may optionally point to one EPG source and one EPG channel id
- channels may play either in `DIRECT` or `PROXY` mode
- favorites are per-user per-channel
- saved layouts are per-user and contain ordered tile items
- each logical channel stores one master HLS URL plus optional upstream request metadata

## Player Architecture Overview

- `player/hls-player.tsx` owns one video element and one HLS.js instance
- `player/playback-recovery.ts` owns bounded fatal error recovery decisions
- quality options and preference resolution live in `player/quality-options.ts`
- supported multi-view layouts live in `player/layouts.ts`
- tile defaults and one-active-audio rules live in `player/multiview-layout.ts`
- saved multi-view serialization/hydration helpers live in `player/multiview-state.ts`
- focused-tile keyboard navigation lives in `player/multiview-shortcuts.ts`
- multiview tile chrome, quick actions, and drag/swap affordances live in `player/multiview-tile-card.tsx`

## Important Conventions

- Backend routes validate and translate HTTP only.
- Backend repositories are the only place Prisma queries belong.
- Frontend pages orchestrate; they do not become dumping grounds for reusable logic.
- Frontend services own HTTP requests.
- Frontend player behavior stays inside `src/player`.
- Cross-app contracts go in `packages/shared`; app-local types stay local.
- Frontend request payloads should use shared DTO types instead of `unknown` or ad-hoc object shapes.
- Saved layout config is now modeled as real JSON in shared contracts, not as an unbounded `any` record.
- Proxy playback URL selection happens in frontend service helpers, not inside the player lifecycle code.
- Public channel responses may intentionally hide raw upstream stream URLs when proxy mode is enabled.

## Testing Status

Current automated coverage includes:

- API health boot/injection test
- Fastify inject coverage for channels, groups, favorites, layouts, streams, and EPG route contracts
- HLS master playlist parsing test
- HLS playlist rewrite and proxy token tests
- XMLTV parser and now/next lookup tests
- HlsPlayer component coverage for bounded retry timers and source replacement cleanup
- player quality option resolution tests
- multi-view tile default/audio ownership tests
- multi-view layout serialization, hydration, and tile-scoped state reset tests
- multi-view tile swapping and keyboard shortcut helper tests
- guide-state display logic and channel-picker component tests
- channel admin form and playback URL helper tests

Mandatory verification commands:

- `npm run lint`
- `npm run test`
- `npm run build`

Optional but recommended for risky changes:

- `npm run smoke:test`

## Known Issues

- Vite still warns that the player chunk is large; route-level lazy loading is the next high-value frontend optimization.
- Fastify route tests still mock persistence; isolated database-backed CRUD coverage is the next backend confidence step.
- Route-level UI regression coverage for favorites and saved-layout application is still missing on the frontend.
- Admin reorder remains sort-order based rather than drag-and-drop.
- The proxy foundation currently buffers upstream asset bodies in memory instead of true streaming passthrough.
- XMLTV data is loaded on demand into process memory only; there is no background ingestion job or durable programme storage yet.
- Proxy playback is intentionally exposed through unauthenticated asset paths because the current HLS client stack does not inject bearer headers into playlist/segment requests.
- route-level React coverage for the full multiview page is still missing; current frontend regression coverage focuses on the new workflow helpers and picker component seams.
- `admin-channels-page.tsx`, `admin-epg-sources-page.tsx`, `multiview-page.tsx`, and `player/hls-player.tsx` are still valid but near the current complexity ceiling defined in the standards docs.

## Operator UX Milestone Summary

- Multi-view now centers on a focused tile workflow with:
  - drag-to-swap tile reassignment
  - searchable tile replacement instead of only large in-tile dropdowns
  - clearer focused, muted, loading, retrying, and failed visual states
  - a dedicated focused-tile panel with now/next context and operator shortcuts
- Saved layouts now distinguish:
  - `Save as new`
  - `Update selected`
  - `Load saved layout`
  - `Delete`
- Dashboard and single-view now surface guide context more consistently without assuming perfect EPG data.
- Quick channel switching is now available:
  - single-view via a searchable quick switch dialog and `Ctrl/Cmd + K`
  - multiview via focused-tile picker shortcuts and tile-level replace actions
- Current multiview shortcuts:
  - `[` / `]` focus previous/next tile
  - `M` toggle focused-tile audio ownership
  - `C` or `Ctrl/Cmd + K` open the focused tile picker
  - `F` fullscreen focused tile
  - `Delete` clear the focused tile
  - `Shift + 1-5` switch layout presets

## Remaining Limitations

- Guide data is still on-demand and source-backed, so partial or temporarily unavailable XMLTV sources can still leave some cards or tiles without now/next details.
- Drag-and-drop tile swapping is mouse-first today; there is not yet a full keyboard-only tile reordering flow.
- The quick switcher is local to the current page and does not yet expose cross-app command palette behavior.

## Proxy And EPG Foundation Summary

- Channels now support real playback mode and upstream request configuration:
  - `playbackMode`
  - `upstreamUserAgent`
  - `upstreamReferrer`
  - `upstreamHeaders`
- The backend now exposes a real stream proxy foundation:
  - `GET /api/streams/channels/:channelId/master`
  - `GET /api/streams/channels/:channelId/asset?token=...`
  - master playlists are rewritten to signed asset URLs
  - upstream request headers/referrer/user-agent are applied centrally
- Public channel payloads now hide the upstream URL when proxy mode is enabled, while admin config endpoints still expose the raw URL for diagnostics.
- TV-Dash now has first-class EPG source configuration plus channel-to-guide linking through `epgSourceId` and `epgChannelId`.
- The backend can preview XMLTV channel ids and serve real now/next responses from on-demand XMLTV fetches.
- Admin UI now includes:
  - expanded channel controls for proxy mode, upstream headers, and EPG mapping
  - a dedicated EPG source management page with XMLTV preview
- Tests now cover proxy rewriting/token behavior, XMLTV parsing, EPG routes, proxy routes, and frontend helper logic for the new contracts.

## Next Recommended Priorities

1. Add route-level React tests for multiview keyboard/reassignment flows plus dashboard and single-view quick-switch/guide orchestration.
2. Add a real background XMLTV ingestion/caching job so now/next and future guide views do not depend on on-demand source fetches.
3. Complete the next stream proxy milestone by switching asset delivery from buffered fetches to streaming passthrough and validating more HLS edge cases around large segment traffic.
4. Add isolated database-backed Fastify integration tests for channels, EPG sources, proxy routes, and saved layouts to complement the mocked route-contract coverage.
5. Add route-level lazy loading to reduce the large player bundle warning.

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

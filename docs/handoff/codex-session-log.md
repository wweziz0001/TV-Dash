# Codex Session Log

## `2026-04-02T23:27:35+03:00`

### Objective

Correct the oversized operator UI pass by reducing wasted margins, oversized controls, and chrome-heavy viewer layouts so TV-Dash behaves more like a live monitoring console.

### Work Completed

- created the requested working branch `006-fix-operator-ux-density-and-screen-usage`
- tightened shared operator UI density by:
  - shrinking shared button, badge, input, select, panel, and page-header sizing
  - narrowing the desktop app shell and reducing outer gutters while widening the usable workspace
  - making the desktop navigation rail smaller and sticky to free more horizontal space for content
- reworked the single-view watch page to be more video-first:
  - larger viewport-height player area
  - compact sticky side rail instead of a roomy secondary column
  - tighter playback, guide, and metadata panels
- reworked multiview to use screen space more efficiently:
  - wall moved higher on the page
  - focused-tile details and saved layouts moved into a narrow right rail
  - tile chrome compressed substantially so the stream remains dominant
  - tile controls now lean icon-first where repeated operator actions are obvious
- tightened browse/dashboard density with:
  - smaller filter controls
  - denser favorites strip
  - more aggressive large-screen channel grid usage
- tightened channel picker and guide cards so supporting UI no longer feels oversized beside the playback surfaces
- kept playback behavior unchanged while compacting `HlsPlayer` overlays and retry/error chrome

### Files Added Or Changed

- shared density and layout primitives:
  - `apps/web/src/components/ui/button.tsx`
  - `apps/web/src/components/ui/input.tsx`
  - `apps/web/src/components/ui/select.tsx`
  - `apps/web/src/components/ui/badge.tsx`
  - `apps/web/src/components/ui/panel.tsx`
  - `apps/web/src/components/layout/page-header.tsx`
  - `apps/web/src/components/layout/app-shell.tsx`
- operator-facing pages and supporting UI:
  - `apps/web/src/pages/channel-watch-page.tsx`
  - `apps/web/src/pages/multiview-page.tsx`
  - `apps/web/src/pages/dashboard-page.tsx`
  - `apps/web/src/components/channels/channel-card.tsx`
  - `apps/web/src/components/channels/channel-guide-card.tsx`
  - `apps/web/src/components/channels/channel-picker-dialog.tsx`
  - `apps/web/src/player/multiview-tile-card.tsx`
  - `apps/web/src/player/hls-player.tsx`
- docs:
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- The fastest way to correct the oversized feel was to tighten shared primitives first so the whole operator surface could converge on one density strategy.
- Viewer and multiview screens now explicitly prioritize stream area over decorative framing or large action clusters.
- Multiview keeps the same workflows from the previous milestone, but secondary information now lives in a compact right rail instead of pushing the live wall lower on the page.
- Icon-first controls are acceptable inside multiview tiles because those actions are repeated constantly and already have surrounding context.

### Verification Run

- `npm run lint -w apps/web`
- `npm run test -w apps/web`
- `npm run build -w apps/web`

### Remaining Risk

- There is still no route-level React coverage for the full watch and multiview pages, so the density/layout changes rely on manual structural review plus the existing helper/component tests.
- Admin screens still use the older roomier layout language in places and have not yet received the same density correction pass.
- The player chunk warning remains unchanged.

### Exact Suggested Next Task

Apply the same compact operator density system to the admin pages, then add route-level React coverage for the watch and multiview pages so future UX corrections can move faster with less regression risk.

---

## `2026-04-02T22:52:22+03:00`

### Objective

Improve operator UX, multiview workflows, and guide presentation so TV-Dash feels meaningfully faster and clearer for day-to-day monitoring work.

### Work Completed

- created the requested working branch `006-operator-ux-polish-and-guide-experience`
- reworked multiview around a focused-tile operator workflow with:
  - drag-to-swap tile reassignment
  - searchable tile replacement via a channel picker dialog
  - clearer focused, muted, loading, retrying, failed, and picker-selected tile treatment
  - a focused-tile side panel with now/next context and status detail
  - practical keyboard shortcuts for tile focus, audio ownership, picker open, fullscreen, clear, and layout switching
- improved saved layout ergonomics by separating:
  - `Save as new`
  - `Update selected`
  - `Load saved layout`
  - `Delete`
- improved guide presentation by surfacing resilient now/next context in:
  - dashboard channel cards
  - multiview tile cards and focused-tile panel
  - single-view now/next panel
- added a searchable quick channel switcher to single-view plus `Ctrl/Cmd + K`
- tightened shared UI support by forwarding refs through the shared `Input` component for picker focus management
- added frontend regression coverage for guide-state logic, picker search/selection behavior, multiview shortcut helpers, and tile swap metadata behavior

### Files Added Or Changed

- frontend operator workflow and guide UX:
  - `apps/web/src/pages/dashboard-page.tsx`
  - `apps/web/src/pages/channel-watch-page.tsx`
  - `apps/web/src/pages/multiview-page.tsx`
  - `apps/web/src/components/channels/channel-card.tsx`
  - `apps/web/src/components/channels/channel-guide-card.tsx`
  - `apps/web/src/components/channels/channel-guide-state.ts`
  - `apps/web/src/components/channels/channel-picker-dialog.tsx`
  - `apps/web/src/player/multiview-tile-card.tsx`
  - `apps/web/src/player/multiview-shortcuts.ts`
  - `apps/web/src/player/multiview-state.ts`
  - `apps/web/src/lib/keyboard.ts`
  - `apps/web/src/components/ui/input.tsx`
- tests:
  - `apps/web/src/components/channels/channel-guide-state.test.ts`
  - `apps/web/src/components/channels/channel-picker-dialog.test.tsx`
  - `apps/web/src/player/multiview-shortcuts.test.ts`
  - `apps/web/src/player/multiview-state.test.ts`
- docs:
  - `docs/architecture/player-architecture.md`
  - `docs/architecture/testing-strategy.md`
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- The cleanest reassign workflow for the current codebase is native drag-to-swap plus focused-tile quick replace, not a heavier drag-and-drop framework.
- Multi-view hotkeys stay intentionally small and page-local instead of growing into a global command system.
- Guide UI must stay useful when XMLTV is missing or temporarily unavailable, so every surface now renders deliberate fallback copy instead of blank space.
- Playback URL selection still belongs in the page/service seam; player-facing tile UI receives a final `src` instead of deciding proxy vs direct mode itself.

### Verification Run

- `npm run lint -w apps/web`
- `npm run test -w apps/web`

### Remaining Risk

- Full route-level React coverage for the multiview page still does not exist; the new tests focus on the most reusable workflow seams rather than the whole page orchestrator.
- Guide freshness still depends on on-demand XMLTV source reads and process-local caching.
- Keyboard support improves focus and assignment speed, but tile reordering is still mouse-first.

### Exact Suggested Next Task

Add route-level React coverage for multiview drag/swap and keyboard flows, then build a background XMLTV ingestion/cache layer so guide context is faster and more reliable across the dashboard and wall views.

---

## `2026-04-02T22:29:00+03:00`

### Objective

Add a real stream proxy/gateway foundation, support upstream request configuration, and lay the first production-ready XMLTV/EPG groundwork without destabilizing the current MVP.

### Work Completed

- created the requested working branch `005-stream-proxy-and-epg-foundation`
- extended the shared contracts and Prisma schema to support:
  - channel playback mode
  - upstream user-agent/referrer/header configuration
  - EPG source configuration
  - channel-to-EPG mapping
- added a stream proxy foundation with:
  - `/api/streams/channels/:channelId/master`
  - `/api/streams/channels/:channelId/asset?token=...`
  - upstream request header/referrer/user-agent application
  - playlist rewriting for nested playlists, keys, and segments
  - short-lived signed asset tokens
- added an `epg` backend module with:
  - EPG source CRUD
  - XMLTV preview endpoint
  - on-demand XMLTV fetch and in-memory cache
  - now/next lookup endpoint
- updated public/admin channel mapping so proxy-mode channels hide raw upstream URLs from public responses while admin config endpoints still expose them
- extended the admin channel UI for playback mode, upstream request configuration, and EPG mapping
- added a dedicated admin EPG source page with XMLTV preview
- updated single-view and multi-view playback to use proxy-aware playback URL resolution
- added migration, seed updates, backend tests, and frontend helper tests for the new platform foundation

### Files Added Or Changed

- shared/API contracts:
  - `packages/shared/src/index.ts`
  - `apps/web/src/types/api.ts`
  - `apps/web/src/services/api.ts`
- database:
  - `apps/api/prisma/schema.prisma`
  - `apps/api/prisma/migrations/202604020002_stream_proxy_and_epg_foundation/migration.sql`
  - `apps/api/prisma/seed.ts`
- backend proxy/epg foundation:
  - `apps/api/src/app/upstream-request.ts`
  - `apps/api/src/modules/channels/*`
  - `apps/api/src/modules/streams/*`
  - `apps/api/src/modules/epg/*`
  - `apps/api/src/app/build-server.ts`
- frontend admin/playback integration:
  - `apps/web/src/components/channels/channel-admin-form.tsx`
  - `apps/web/src/pages/admin-channels-page.tsx`
  - `apps/web/src/pages/admin-epg-sources-page.tsx`
  - `apps/web/src/pages/channel-watch-page.tsx`
  - `apps/web/src/pages/multiview-page.tsx`
  - `apps/web/src/app/router.tsx`
  - `apps/web/src/components/layout/app-shell.tsx`
- tests:
  - `apps/api/src/modules/channels/channel.routes.test.ts`
  - `apps/api/src/modules/streams/playlist-rewrite.test.ts`
  - `apps/api/src/modules/streams/proxy-token.test.ts`
  - `apps/api/src/modules/streams/stream.routes.test.ts`
  - `apps/api/src/modules/epg/xmltv-parser.test.ts`
  - `apps/api/src/modules/epg/epg.routes.test.ts`
  - `apps/web/src/components/channels/channel-admin-form.test.ts`
  - `apps/web/src/services/api.test.ts`
- docs:
  - `docs/architecture/player-architecture.md`
  - `docs/architecture/api-boundaries.md`
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- Proxy mode is now a real channel-level contract, not a UI-only flag.
- Public channel payloads intentionally hide `masterHlsUrl` when proxy mode is enabled.
- Stream proxy asset URLs are signed and short-lived to avoid exposing arbitrary upstream fetching.
- Upstream request headers are normalized in one shared helper and reused by both streams and XMLTV fetching.
- XMLTV support is intentionally phased:
  - source config and channel mapping are first-class now
  - now/next works from on-demand fetch plus in-memory cache
  - durable programme ingestion remains future work

### Verification Run

- `npm run lint -w apps/api`
- `npm run test -w apps/api`
- `npm run lint -w apps/web`
- `npm run test -w apps/web`

### Remaining Risk

- The proxy foundation still buffers upstream asset bodies in memory instead of true streaming passthrough.
- XMLTV data is not persisted yet; guide lookups still depend on on-demand upstream access and process-local cache.
- Frontend route-level tests for admin channel and EPG workflows are still missing.
- Full database-backed integration coverage for the new backend modules is still missing.

### Exact Suggested Next Task

Implement true streaming passthrough for proxied HLS assets, then add a background XMLTV ingestion/cache pipeline so now/next and future guide screens do not depend on live upstream fetches.

---

## `2026-04-02T21:45:25+03:00`

### Objective

Harden playback reliability, stabilize multi-view lifecycle behavior, tighten touched API contract validation, and add regression coverage for the most failure-prone paths.

### Work Completed

- created the requested working branch `004-hardening-playback-multiview-and-tests`
- hardened `HlsPlayer` retry handling with bounded network reconnects, single media recovery, clearer buffering/retrying/error states, and stale-timer cleanup on source replacement
- normalized quality option handling to drop malformed levels, deduplicate identical variants, and support explicit highest/lowest resolution requests safely
- added multiview state helpers for layout serialization, hydration, tile-channel replacement, and pruning tile-scoped UI state when layouts shrink
- updated the multiview page to reset stale per-tile quality metadata on channel changes, persist focused-tile state, surface tile playback status more clearly, and key player instances safely by tile/source
- tightened touched API routes with route-edge validation for ids and channel list filters plus deliberate `404`/`409` mappings for common Prisma write failures
- added Fastify inject regression tests for channel/group/favorite/layout/stream contract behavior and jsdom component tests for HlsPlayer retry/cleanup behavior
- updated player/testing architecture docs and the handoff summary to reflect the new hardening rules

### Files Added Or Changed

- frontend player hardening:
  - `apps/web/src/player/hls-player.tsx`
  - `apps/web/src/player/playback-recovery.ts`
  - `apps/web/src/player/quality-options.ts`
  - `apps/web/src/player/multiview-layout.ts`
  - `apps/web/src/player/multiview-state.ts`
  - `apps/web/src/pages/channel-watch-page.tsx`
  - `apps/web/src/pages/multiview-page.tsx`
- frontend regression tests:
  - `apps/web/src/player/*.test.ts[x]`
  - `apps/web/src/test/setup.ts`
  - `apps/web/vite.config.ts`
- backend validation and tests:
  - `apps/api/src/app/prisma-errors.ts`
  - `apps/api/src/app/request-schemas.ts`
  - `apps/api/src/app/test-support.ts`
  - `apps/api/src/modules/*/*.routes.ts`
  - `apps/api/src/modules/*/*.routes.test.ts`
- docs:
  - `docs/architecture/player-architecture.md`
  - `docs/architecture/testing-strategy.md`
  - `docs/standards/player-hls-standards.md`
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- TV-Dash now uses a bounded fatal recovery policy of `3` network retries and `1` media recovery attempt before surfacing a retry UI.
- Multi-view source changes reset background-tile quality bias back to `LOWEST` unless the operator explicitly reselects a manual level.
- Saved layout config now intentionally stores focused-tile metadata alongside active audio ownership so operational context survives layout saves.
- Touched CRUD routes now validate ids/query parameters at the route edge instead of copying legacy casts forward.

### Verification Run

- `npm run lint -w apps/web`
- `npm run test -w apps/web`
- `npm run lint -w apps/api`
- `npm run test -w apps/api`

### Remaining Risk

- Full database-backed CRUD integration coverage is still missing; the new API tests validate contracts with mocked persistence, not real Prisma/database behavior.
- Route-level UI regression coverage for favorites toggling and saved-layout application is still missing.
- The player bundle warning remains; lazy loading is still the next performance-focused frontend task.

### Exact Suggested Next Task

Add isolated database-backed Fastify integration tests for auth/channels/groups/favorites/layouts, then add route-level React tests for saved-layout application and favorites toggling so the most important operator flows are covered end-to-end at the page boundary.

---

## `2026-04-02T21:21:28+03:00`

### Objective

Define permanent coding standards, naming conventions, and engineering rules for TV-Dash, then align the current codebase to those rules with a low-risk refactor.

### Work Completed

- created the requested working branch `003-docs-coding-standards-and-engineering-rules`
- added a repository-specific standards rulebook under `docs/standards`
- documented rules for code style, naming, React, TypeScript, backend/API, Prisma, player/HLS, and testing
- tightened shared/frontend/backend typing around request DTOs and saved-layout JSON config
- removed a UI-side `LayoutType` cast in the multi-view page by narrowing from known layout definitions
- updated handoff docs to point future sessions at the new standards

### Files Added Or Changed

- docs:
  - `docs/standards/*`
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`
- shared contracts:
  - `packages/shared/src/index.ts`
- frontend alignment:
  - `apps/web/src/services/api.ts`
  - `apps/web/src/types/api.ts`
  - `apps/web/src/pages/multiview-page.tsx`
- backend alignment:
  - `apps/api/src/modules/channels/channel.repository.ts`
  - `apps/api/src/modules/groups/group.repository.ts`

### Key Decisions

- TV-Dash now treats `docs/standards/*.md` as the active engineering rulebook, not optional reference material.
- Shared request payloads must use DTO types from `packages/shared`.
- Saved layout config is modeled as real JSON instead of `z.any()`-backed records.
- Existing large files were documented as nearing the complexity ceiling, but were not cosmetically split without a stronger product reason.

### Verification Run

- `npm run lint`
- `npm run test`
- `npm run build`

All passed on `2026-04-02`.

### Remaining Risk

- Vite still warns that the player bundle chunk is large.
- CRUD-heavy API integration tests are still missing.
- Player component-level retry/error UI tests are still missing.
- Several backend routes still use simple param/query casts and should be upgraded when those modules are next touched.

### Exact Suggested Next Task

Add Fastify integration tests for auth, channels, favorites, and layouts with isolated test data, then start upgrading touched routes from simple param/query casts to route-edge validation schemas.

---

## `2026-04-02T21:04:37+03:00`

### Previous Session Summary

- established repository governance, architecture policy, testing strategy, and handoff discipline
- refactored the API into explicit `app`, `config`, `db`, and `modules/*/{routes,service,repository}` boundaries
- moved frontend request logic into `src/services`
- moved frontend player and multiview logic into `src/player`
- added Vitest foundations and representative backend/frontend tests

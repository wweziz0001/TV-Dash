# Codex Session Log

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

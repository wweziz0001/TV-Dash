# Codex Session Log

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

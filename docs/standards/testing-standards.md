# TV-Dash Testing Standards

## Purpose

This document defines a practical testing bar for TV-Dash. The goal is confidence in the highest-risk operator flows without creating an unrealistic test burden for every change.

## Current Baseline

Current automated coverage already exists for:

- Fastify boot and health wiring
- HLS master playlist parsing and synthetic master generation
- runtime diagnostics snapshots and stream/EPG failure classification helpers
- quality option resolution
- player diagnostics mapping for loading, retrying, buffering, failed, and recovered states
- multi-view tile defaulting and single-audio behavior

Mandatory workspace verification remains:

- `npm run lint`
- `npm run test`
- `npm run build`

Use `npm run smoke:test` for release candidates or risky API/player changes when a running API is available.

## Test Placement

| Scope | Location |
| --- | --- |
| API unit and small integration tests | `apps/api/src/**/*.test.ts` |
| Web unit and component tests | `apps/web/src/**/*.test.ts[x]` |
| Shared package tests | `packages/shared/src/**/*.test.ts` |
| Cross-workspace regression tests | `tests/` |

## Required Test Rules

### Unit Tests

Required for:

- pure player helpers
- diagnostics mapping and failure classification helpers
- parsing logic
- mappers and transformers
- schema helpers with branching logic
- non-trivial filtering or ordering policy

### Backend Integration Tests

Required for new or changed backend behavior when:

- an endpoint contract changes
- auth or ownership behavior changes
- persistence behavior spans route, service, and repository layers
- admin governance or audit behavior changes

Preferred approach:

- Fastify `inject`
- isolated test data
- focused coverage per module instead of one giant end-to-end API file

### Component Tests

Add component tests when the risk is UI behavior, not static rendering.

Examples:

- player retry overlay behavior
- quality selector reacting to player callbacks
- admin form loading, save, and delete states
- multi-view tile mute/fullscreen controls
- responsive picker, drawer, or fullscreen state behavior when layout mode changes are driven by explicit component logic

Do not spend time snapshot-testing Tailwind markup that has no behavior risk.

## Critical Regression Areas

These areas are release-critical and should gain or maintain automated coverage as the repo matures:

- channel CRUD
- group CRUD
- favorites add/remove
- saved layouts create/update/delete/apply
- quality switching logic
- multi-view layout resizing and audio ownership
- device-aware multi-view layout fallback and viewport policy
- player error and retry behavior
- schema validation boundaries

## Staged Enforcement Strategy

### Stage 1: Always Required Now

- lint, build, and existing tests pass
- new pure logic includes unit tests
- bug fixes add a regression test when feasible

### Stage 2: Required For Changed API Surfaces

- Fastify integration tests for changed CRUD or auth behavior
- validation and ownership checks covered at the route edge

### Stage 3: Required For Higher-Risk Player And UI Work

- component or integration coverage for player cleanup, retry UI, and critical admin flows

## What Must Be Tested For These Domains

### Channels

- create, update, delete
- sort order changes
- slug lookup
- active/inactive filtering when introduced or changed

### Groups

- create, update, delete
- channel counts when group listing behavior changes

### Favorites

- add and remove favorite
- favorites list reflects persisted membership

### Layouts

- save and update layout payload shape
- item ordering by `tileIndex`
- applying a saved layout restores tile state correctly

### Player

- quality options derived from manifest levels
- `AUTO` remains available
- `LOWEST` resolves correctly for background tiles
- single active audio enforcement
- retryable vs terminal error handling
- operator-facing diagnostics state mapping for failed, retrying, buffering, and recovered playback

### Diagnostics

- health-state aggregation from real runtime observations
- channel and EPG diagnostics response behavior for changed admin inspection endpoints
- failure classification helpers for stream and XMLTV errors
- playback session tracking, stale-session cleanup, and per-channel viewer-count aggregation when monitoring behavior changes
- structured-log filtering behavior when the admin logs viewer contract changes

### Auth And Governance

- login, logout, and `me` flows when session lifecycle behavior changes
- stale or revoked session rejection for protected endpoints
- admin-only endpoint rejection for non-admin/operator users
- durable audit event creation for sensitive admin mutations
- audit-event listing behavior when the admin observability contract changes

## Deferral Rule

If a critical regression area is touched and the needed automated coverage still does not exist, do one of these before closing the task:

- add the missing test
- document why it was deferred and what risk remains in `docs/handoff/codex-session-log.md`

## Review Checklist

- Did the change touch a critical regression area?
- Are tests placed in the owning app or module?
- Are we testing behavior rather than implementation trivia?
- If coverage was deferred, is the risk documented?

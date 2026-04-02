# TV-Dash Testing Strategy

## Current Testing Baseline

As of `2026-04-02`, TV-Dash has:

- backend unit/integration foundation with Vitest
- frontend unit and component test foundation with Vitest + jsdom
- representative tests for:
  - API health server boot path
  - channel, group, favorite, layout, and stream route validation/contract behavior via Fastify `inject`
  - HLS master playlist parsing
  - player retry timer cleanup and source replacement behavior
  - quality option resolution
  - multi-view tile defaults, audio ownership, layout hydration, and tile-state pruning
  - multiview tile swapping and keyboard shortcut helpers
  - guide state rendering logic and channel-picker search/selection behavior
- workspace verification via `npm run lint`, `npm run test`, `npm run build`
- smoke validation via `npm run smoke:test`

## Test Placement Rules

| Scope | Location |
| --- | --- |
| API unit and small server integration tests | `apps/api/src/**/*.test.ts` |
| Web unit tests for player/layout/services/helpers | `apps/web/src/**/*.test.ts` |
| Shared package tests | `packages/shared/src/**/*.test.ts` when needed |
| Cross-workspace regression or E2E suites | `tests/` |

## Minimum Expectations For New Work

- New pure logic: add unit tests.
- New API endpoint or changed route contract: add route/service/repository tests or server injection coverage.
- New player behavior: add helper tests immediately and component/integration coverage when UI coupling is meaningful.
- Bug fix: add at least one regression-oriented test when feasible.

## Test Types

## Unit Tests

Required for:

- validation logic
- stream/playlist parsing
- quality selection logic
- layout/tile state helpers
- mapping and transformation logic
- utility functions with branching behavior

## Integration Tests

Target next phase:

- auth login/me against isolated data
- database-backed channel/group/favorite/layout flows instead of mocked persistence
- stream test endpoint behavior against controlled upstream fixtures

Preferred approach:

- use Fastify `inject` for HTTP-level behavior
- use isolated test database setup before introducing broad CRUD suites
- keep repository tests focused when HTTP setup is not required

## UI / Component Tests

Target next phase:

- saved layout apply flows at the page level
- admin form loading/error states
- favorites UI toggling in the single-view page
- multi-view tile control behavior beyond helper-level state coverage

Use component tests only where page-level orchestration or player UI behavior is the risk. Do not over-test styling.

## Regression Expectations

No feature PR should break:

- channel playback
- quality selection
- multi-view layout rendering
- channel CRUD
- saved layout loading

If a change touches one of those flows and no automated regression exists yet, either add one or document why it was deferred.

## Phased Plan

### Phase 1: Foundation

- complete now
- helper and server boot coverage
- lint/build/smoke remain mandatory

### Phase 2: Backend API Confidence

- route-edge contract and validation coverage complete for channels, groups, favorites, layouts, and streams
- next step is database-backed Fastify integration coverage for auth, channels, groups, layouts, favorites, and streams
- introduce isolated database strategy for tests

### Phase 3: Frontend Interaction Confidence

- player lifecycle cleanup and retry component coverage now exists
- guide-state and channel-picker component coverage now exists for operator workflow seams
- next step is adding React route-level coverage for multi-view keyboard/reassignment flows plus dashboard/watch now-next orchestration
- add route-level regression coverage for critical operator flows

### Phase 4: Cross-App Regression

- add `tests/` suites for end-to-end operator journeys and release gating

## Required Commands

- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run smoke:test` against a running API for release candidates or risky API/player changes

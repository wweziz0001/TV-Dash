# TV-Dash Development Policy

## Core Rule

Every change must preserve repository clarity. New functionality is only complete when it lands in the correct layer, has the right test coverage for its risk, and updates the docs/runbooks/handoff if repository behavior changed.

## Feature Delivery Rules

1. Start by locating the owning module or page.
2. Add or update shared contract schemas in `packages/shared` when an API contract changes.
3. Keep backend work split across route, service, and repository boundaries.
4. Keep frontend work split across page orchestration, player modules, services, and shared UI.
5. Add or update tests for the changed behavior before closing the task.
6. Update handoff/session docs when the repository operating model changes.

## Refactor Rules

- Refactor in small, behavior-preserving steps.
- Do not mix a wide architectural cleanup with unrelated feature additions.
- If a refactor changes folder ownership or conventions, update `docs/architecture` in the same branch.
- If a refactor is dangerous, stage it as:
  1. extract pure helpers or seams
  2. move call sites
  3. remove old paths
  4. run lint/tests/build

## Bug Fix Rules

- Fix the narrowest failing layer first.
- Add a regression test where practical for the observed failure mode.
- Document unresolved follow-up risk in `docs/handoff/codex-session-log.md`.

## Backend Change Rules

- New endpoint:
  - add/update shared schema in `packages/shared` if request/response contracts changed
  - add `*.routes.ts`, `*.service.ts`, and `*.repository.ts` changes in the owning module
  - validation happens at the route edge
  - persistence happens in repositories only
- Migration:
  - update `apps/api/prisma/schema.prisma`
  - create a Prisma migration
  - update `.env.example` only if environment inputs changed
  - update handoff docs if data model or seed expectations changed

## Frontend Change Rules

- New route screen belongs in `pages/`.
- Shared request logic belongs in `services/`.
- Shared non-player UI belongs in `components/`.
- HLS, quality, tile state, and wall behavior belong in `player/`.
- Avoid pushing business behavior into `hooks/` until there is clear repeated reuse.

## Player Extension Rules

- Extend HLS behavior in `apps/web/src/player`, not inside pages.
- Add pure helpers for layout or quality policy before modifying React components when possible.
- One multi-view tile may own audio at a time unless an intentional product decision changes that rule.
- Any new retry, reconnect, or autoplay logic must document browser behavior and test coverage expectations in `player-architecture.md`.

## UI Review Rules

- Review route pages for orchestration bloat.
- Review components for hidden network calls.
- Review player changes for cleanup, memory, and concurrency safety.
- Review admin changes for validation, loading, and error states.

## Documentation Rules

Update documentation in the same branch when any of the following changes:

- project structure
- development flow
- environment variables
- testing commands or expectations
- player behavior or known constraints
- release or local-development workflow

## Git and Delivery Rules

- Branch from the current working branch for a single coherent objective.
- Use logical commits with conventional prefixes such as `docs:`, `refactor:`, `test:`, `fix:`.
- Keep each commit reviewable on its own.
- Final delivery for any substantial session must include:
  - verification run summary
  - known unresolved risks
  - updated handoff/session docs

## Scope Control Rules

- Do not rewrite working MVP code just to match an abstract pattern.
- Do not create folders without a concrete ownership rule.
- Prefer structure that makes the next five changes safer, not structure that looks bigger.

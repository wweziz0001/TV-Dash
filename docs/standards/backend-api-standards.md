# TV-Dash Backend And API Standards

## Purpose

This document defines backend layering, validation boundaries, response rules, error handling, and module ownership for `apps/api`.

## Layering Rule

Backend code follows:

```text
routes -> services -> repositories -> prisma
```

Dependency direction must not reverse.

## Route Rules

Routes own transport concerns only.

Routes may:

- register Fastify endpoints
- run auth or admin guards
- validate body, params, and query input
- map service outcomes to HTTP status codes

Routes must not:

- create Prisma queries
- embed ownership or business rules that belong in services
- build complex DTO transformation logic inline

Validation rule:

- all new or changed request bodies must be validated at the route edge
- all new or changed params/query inputs should be validated at the route edge when they influence lookup or behavior
- simple legacy casts may remain until the route is otherwise touched, but touched routes should be upgraded rather than copied

## Service Rules

Services own domain behavior.

Services may:

- coordinate multiple repositories
- perform ownership checks
- decide when to create, update, or reject work
- call non-database helpers for domain behavior

Services must not:

- depend on `FastifyRequest` or `FastifyReply` unless absolutely unavoidable
- return transport-specific wording when a domain result would suffice
- hide Prisma include/select details that belong in repositories

## Repository Rules

Repositories own Prisma and persistence shape.

Repositories may:

- import the Prisma client from `db/prisma.ts`
- define `where`, `include`, `select`, and `orderBy`
- encapsulate query patterns for their domain

Repositories must not:

- read env variables
- parse HTTP input
- construct JWTs
- choose toast or UI wording

Repository input rule:

- use shared DTO types or explicit repository-specific input types
- do not accept broad Prisma unchecked inputs unless the repository truly needs fields beyond the API contract

## Module Ownership

Current stable module ownership:

- `auth`: login and authenticated-user lookup
- `channels`: logical channel catalog CRUD and browse lookups
- `groups`: channel group CRUD and counts
- `favorites`: per-user favorite channel membership
- `layouts`: per-user saved multiview walls
- `diagnostics`: runtime observability snapshots and admin inspection endpoints
- `streams`: stream inspection, metadata, and upstream test behavior
- `health`: readiness endpoint

If a new backend capability does not fit one of these modules, create a new domain module instead of expanding an unrelated one.

## API Contract Rules

- Shared request contracts belong in `packages/shared`.
- If a request body changes, update:
  - the shared schema/type
  - the route validation
  - the service usage
  - the frontend caller
  - the relevant tests
- Keep response shapes stable and explicit.

Preferred response shape:

- one top-level resource or result key
- `message` only for errors or intentionally message-oriented endpoints

Examples:

- `{ channel }`
- `{ channels }`
- `{ result }`

## Error Handling Rules

Use stable mappings:

- validation failure -> `400`
- unauthenticated -> `401`
- forbidden/admin-only -> `403`
- missing resource or non-owned resource -> `404`
- expected conflict or duplicate constraint -> `409`
- upstream stream inspection failure -> `502`
- unexpected internal error -> `500`

Rules:

- do not leak raw Prisma or upstream stack traces to clients
- log unexpected server errors with enough context for debugging
- keep client-facing messages concise and actionable

## Observability Rules

- Prefer structured logs with stable `event` names and typed detail fields over ad-hoc string logs.
- Do not log raw bearer tokens, upstream header values, or full query-string URLs.
- For upstream failures, classify the failure before logging or returning it when practical.
- Runtime diagnostics are allowed to stay in-memory for now, but they must summarize real observations instead of decorative placeholder states.
- High-volume success paths such as proxied asset delivery should record lightweight diagnostics without emitting noisy success logs on every request.

## Env And Config Rules

- Environment parsing belongs in `apps/api/src/config/env.ts`.
- Other modules import parsed config, not `process.env`.
- New env vars must be added to:
  - `.env.example`
  - `config/env.ts`
  - the relevant runbook or handoff docs if operational behavior changes

## New Endpoint Checklist

1. Decide the owning module.
2. Add or update the shared request schema in `packages/shared` if the contract crosses app boundaries.
3. Add the route handler with validation and auth guard decisions.
4. Add or update service orchestration.
5. Add or update repository queries.
6. Add tests for the changed behavior.
7. Update standards or handoff docs if the operating model changed.

## Stability Rules

- Do not break existing admin flows by casually renaming response keys.
- Do not introduce action-style endpoints when CRUD or read-oriented resource paths would be clearer.
- Keep route registration explicit in `app/build-server.ts`; do not auto-load modules through filesystem magic.

## Review Checklist

- Is validation at the route edge?
- Is business behavior in the service layer?
- Is all Prisma access inside repositories?
- Does the response shape stay stable?
- Are errors mapped deliberately instead of whatever fell through?

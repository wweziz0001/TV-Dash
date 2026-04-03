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
- run auth, permission, or admin guards
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
- `audit`: durable admin governance events and audit listing
- `channels`: logical channel catalog CRUD, browse lookups, ingest-mode metadata, manual quality variants, playback-mode metadata, and playback-facing guide hints
- `epg`: EPG source CRUD, XMLTV import orchestration, source-channel discovery, channel mapping, manual program CRUD, guide resolution, and now/next lookup
- `groups`: channel group CRUD and counts
- `favorites`: per-user favorite channel membership
- `layouts`: per-user saved multiview walls
- `diagnostics`: runtime observability snapshots, playback session tracking, and admin inspection endpoints
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

Guide-specific expectations:

- XMLTV URL or file import failures should map to `502` when the upstream/read/parse work fails after validation succeeds
- manual guide overlap conflicts should map to `409`
- missing source, channel, mapping, or manual program resources should map to `404`

## Access Control Rules

- Prefer explicit permission guards for protected routes over inline `request.user.role` checks.
- Protected routes must resolve the current authenticated user when session freshness matters; do not trust stale role claims in a token forever.
- Admin-only endpoints that accept operationally dangerous inputs, such as arbitrary upstream URLs or request-header overrides, must stay admin-only on the server even if the frontend route is already admin-gated.
- Logout should invalidate current authenticated sessions server-side, not only clear client storage.

## Audit Rules

- Sensitive admin mutations should create a durable audit event with sanitized metadata.
- Audit payloads may include:
  - mode changes
  - boolean flags
  - counts
  - safe ids or slugs
- Audit payloads must not include:
  - raw bearer tokens
  - raw upstream header values
  - full sensitive operational URLs

Guide-management additions:

- EPG source create, update, delete, and import operations should create sanitized audit events.
- Channel-to-guide mapping changes and manual program mutations should also create durable audit events when they materially change operator-visible guide behavior.

## Guide Management Rules

- Guide source import must remain inside the `epg` module even when routes upload files or trigger URL refresh actions.
- Channels should not own imported programme payloads directly; use dedicated mapping and program entities instead of mutating `Channel` with guide blobs.
- Manual program precedence rules must be explicit, documented, and shared by:
  - now/next endpoints
  - future channel guide endpoints
  - admin preview or diagnostics flows
- Admin EPG APIs should return useful operational status, including import timestamps, result state, counts, and failure messages, without exposing raw upstream secrets.

## Observability Rules

- Prefer structured logs with stable `event` names and typed detail fields over ad-hoc string logs.
- Do not log raw bearer tokens, upstream header values, or full query-string URLs.
- Playback session heartbeats must represent real active player surfaces, not synthetic counters or decorative analytics.
- High-volume heartbeat updates should update session state without emitting a new structured log on every refresh.
- Session lifecycle logs should stay focused on useful state changes such as started, failed, recovered, and ended.
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

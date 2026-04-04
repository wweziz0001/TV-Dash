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
- `recordings`: immediate/timed/scheduled jobs, guide-program recording, recurring rules, execution runs, library listing, playback access, and storage-backed media lifecycle
- `diagnostics`: runtime observability snapshots, playback session tracking, and admin inspection endpoints
- `streams`: stream inspection, metadata, upstream test behavior, proxy delivery, and retained live-timeshift window management
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

Recording-specific expectations:

- missing owned recording job or asset should map to `404`
- editing/canceling/stopping a job in the wrong lifecycle state should map to `409`
- invalid or expired recording playback tokens should fail as missing media instead of leaking internal path details

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

Recording additions:

- admin-triggered recording create, update, cancel, stop, and delete actions should create sanitized audit events.
- admin-triggered recording protection or keep-forever changes should also create sanitized audit events.
- recording logs may include safe ids, channel slugs, durations, and ffmpeg exit outcomes, but they must not log raw filesystem roots outside the already configured relative storage key.

## Guide Management Rules

- Guide source import must remain inside the `epg` module even when routes upload files or trigger URL refresh actions.
- Channels should not own imported programme payloads directly; use dedicated mapping and program entities instead of mutating `Channel` with guide blobs.
- Manual program precedence rules must be explicit, documented, and shared by:
  - now/next endpoints
  - future channel guide endpoints
  - admin preview or diagnostics flows
- Admin EPG APIs should return useful operational status, including import timestamps, result state, counts, and failure messages, without exposing raw upstream secrets.

## Recording Rules

- The capture path should reuse the owned stream/channel foundation instead of bypassing it with ad-hoc upstream fetch logic.
- Scheduled recording status transitions must stay explicit:
  - `PENDING`
  - `SCHEDULED`
  - `RECORDING`
  - `COMPLETED`
  - `FAILED`
  - `CANCELED`
- Recording media playback should use short-lived playback access URLs or equivalent signed access, not long-lived bearer tokens in query strings.
- Recording file delivery must keep storage-root resolution server-side and must support practical browser playback behavior such as byte-range requests.
- Recording thumbnails may use the same short-lived signed-access foundation as playback media, but thumbnail extraction/generation still belongs in the recording module.
- Retention settings should stay explicit and bounded:
  - global/default storage policy in env/config for now
  - per-recording operator override via a protected/keep-forever flag
  - cleanup logic in recording services/runtime helpers rather than ad-hoc route handlers

## Live Timeshift Rules

- Proxy playback alone does not count as DVR or timeshift.
- Shared local delivery also counts as TV-Dash-managed delivery, but only when the backend really owns the retained buffer and serving path.
- Live pause, rewind, timeline seek, and jump-to-live behavior must only be exposed when the backend owns a real retained live buffer.
- Timeshift retention, eviction, manifest generation, and asset storage belong in the `streams` module, not in pages or generic helpers.
- Channel-level timeshift enablement must stay explicit in the channel contract and must reject unsupported combinations such as direct-playback-only live rewind.
- Timeshift env/config must stay explicit and centralized in `config/env.ts`, including:
  - global enable/disable
  - storage root
  - default retention window
  - minimum available window threshold
  - polling cadence and idle cleanup timing
- First-version timeshift implementations may be single-process and channel-local, but the limitation must be documented instead of hidden behind a fake DVR UI.

## Shared Stream Delivery Rules

- `SHARED` delivery must mean more than a renamed proxy URL.
- Shared delivery belongs in the `streams` module and must provide real reuse through one or both of:
  - channel-local shared upstream session state
  - channel-local manifest/segment edge caching with in-flight request deduping
- Shared-delivery routes should behave like a small local origin for repeated LAN/local viewer requests, while staying explicit about first-version limits.
- Shared-session lifecycle must stay bounded:
  - start on first local viewer request
  - expose idle expiry timing
  - clean up stale cache state after inactivity
- Shared-delivery observability must expose enough truth for operators to answer:
  - whether a shared session exists
  - whether it is active, starting, or erroring
  - whether local viewers are attached
  - whether cache hits are actually happening

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

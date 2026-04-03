# TV-Dash API Boundaries

## API Layering Rule

Each backend domain module follows:

```text
routes -> services -> repositories -> prisma
```

## Route Responsibilities

Routes may:

- register endpoints
- parse and validate request input
- apply auth/admin guards
- map service results to HTTP status codes

Routes must not:

- build Prisma queries inline
- contain cross-entity business rules
- hide reusable validation or mapping logic in anonymous callbacks

## Service Responsibilities

Services may:

- own business behavior
- perform ownership checks
- coordinate multiple repositories
- encapsulate non-HTTP orchestration

Services must not:

- depend on Fastify request/reply objects unless there is no better seam
- duplicate schema validation already handled at the route edge
- leak raw transport concerns back into repositories

## Repository Responsibilities

Repositories may:

- talk to Prisma
- define include/select/order/filter shapes
- map persistence-specific query behavior

Repositories must not:

- read request objects
- generate JWTs
- own UI-facing wording

## Validation Rules

- Shared request schemas belong in `packages/shared`.
- Route handlers use `parseWithSchema` as the validation boundary.
- If only one app needs a type and it is not part of the API contract, keep it local instead of polluting `packages/shared`.

## Contract Stability Rules

- Request/response contract changes require:
  - schema update in `packages/shared`
  - API implementation update
  - frontend service/type update
  - testing update
  - handoff documentation update when behavior materially changes

## Database Access Rules

- Prisma client is owned by `apps/api/src/db/prisma.ts`.
- Only repositories should import Prisma for data access.
- Prisma schema, migrations, and seed data remain under `apps/api/prisma` until more than one backend runtime needs direct ownership.

## Module Ownership

- `auth`
  - login and current-user session lookup
- `channels`
  - logical channel catalog CRUD, browse lookups, channel ingest-mode metadata, manual quality variants, proxy-mode metadata, and channel-to-EPG mapping fields
- `groups`
  - channel grouping/catalog structure
- `epg`
  - EPG source CRUD, XMLTV preview/lookup orchestration, and now/next response assembly
- `favorites`
  - per-user pinned channels
- `layouts`
  - per-user saved multiview walls
- `diagnostics`
  - runtime observability snapshots, failure classification, channel/EPG health summaries, and admin inspection endpoints
- `streams`
  - stream inspection, proxy master/asset delivery, and upstream request behavior
- `health`
  - operational readiness endpoint

## Stream Proxy Foundation Rules

- Public playback uses one of two contracts:
  - direct master: the channel response may expose `masterHlsUrl`
  - generated/proxy master: the player uses a stable API playback path instead of the upstream URL
- Stream proxy routes currently own:
  - channel master playlist lookup
  - synthetic master playlist generation for manual-variant channels
  - upstream request header/referrer/user-agent application
  - playlist rewriting for nested playlists, key URIs, and segments
  - short-lived signed asset tokens
- Stream routes must not embed channel query logic inline; they depend on the channel service for stream configuration lookup.
- Invalid or expired proxy asset tokens should fail with `400`, not a fake upstream error.
- This milestone uses buffered upstream responses as a practical foundation. If future work adds streaming passthrough, that belongs inside the `streams` module rather than pages or generic app utilities.

## EPG Foundation Rules

- EPG source configuration is a first-class backend domain, not a JSON blob hidden inside channel records.
- XMLTV fetch/parsing orchestration belongs in the `epg` service layer.
- Channels only store linkable EPG metadata:
  - `epgSourceId`
  - `epgChannelId`
- Guide payload parsing, cache policy, and now/next assembly live behind the `epg` module boundary.
- This milestone uses on-demand XMLTV fetch plus in-memory cache. Durable storage/background ingestion remains future work and should be added inside the `epg` module, not bolted onto route handlers.

## Error Handling Rules

- validation failure: `400`
- unauthenticated: `401`
- forbidden/admin-only: `403`
- missing owned resource: `404`
- invalid or expired proxy token: `400`
- upstream stream test failures: `502`
- XMLTV upstream preview/fetch failures: `502`

Keep those mappings stable unless the contract explicitly changes.

## Diagnostics Foundation Rules

- Runtime diagnostics are currently process-local and in-memory; they summarize real playback, proxy, and EPG observations but do not persist across restarts yet.
- Channel diagnostics may aggregate:
  - proxy master and asset results
  - synthetic master generation outcomes
  - stream inspection outcomes
  - last known guide lookup state
- EPG diagnostics may aggregate:
  - XMLTV fetch outcomes
  - XMLTV parse outcomes
  - cache freshness plus loaded channel/programme counts
- Admin diagnostics routes belong in the `diagnostics` module, but they compose current channel/source configuration from the owning domain modules rather than duplicating repositories.
- Failure classification should distinguish at least:
  - `network`
  - `playlist-fetch`
  - `invalid-playlist`
  - `proxy-forwarding`
  - `epg-fetch`
  - `epg-parse`
  - `misconfiguration`
  - `unsupported-stream`
  - `synthetic-master`

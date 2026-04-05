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
  - login, logout, current-user session lookup, and session-version validation
- `audit`
  - durable admin governance events for sensitive operational actions
- `alerts`
  - persisted operational alerts, in-app notification center state, alert deduplication, and active vs historical alert lifecycle
- `channels`
  - logical channel catalog CRUD, browse lookups, channel ingest-mode metadata, manual quality variants, proxy-mode metadata, and playback-facing guide hints
- `groups`
  - channel grouping/catalog structure
- `epg`
  - EPG source CRUD, XMLTV import orchestration, source-channel discovery, channel mapping, manual program CRUD, guide resolution, now/next response assembly, catch-up availability resolution, and guide-program playback selection
- `favorites`
  - per-user pinned channels
- `layouts`
  - per-user saved multiview walls
- `recordings`
  - recording job CRUD, guide-program recording, recurring recording rules, real ffmpeg-backed capture orchestration, recording-run status, library listing, playback access tokens, and storage-backed recorded media lifecycle
- `diagnostics`
  - runtime observability snapshots, structured log retention, playback session tracking, channel/EPG health summaries, and admin inspection endpoints
- `streams`
  - stream inspection, proxy master/asset delivery, upstream request behavior, and retained live-timeshift/DVR window delivery
- `health`
  - operational readiness endpoint

## Stream Proxy Foundation Rules

- Public playback uses one of two contracts:
  - direct master: the channel response may expose `masterHlsUrl`
  - generated TV-Dash master: the player uses a stable API playback path instead of the upstream URL
- Stream proxy routes currently own:
  - channel master playlist lookup
  - synthetic master playlist generation for manual-variant channels
  - upstream request header/referrer/user-agent application
  - playlist rewriting for nested playlists, key URIs, and segments
  - short-lived signed asset tokens
- Shared-delivery routes now also own:
  - per-channel shared session startup on first local viewer request
  - channel-local HLS manifest and segment cache reuse for repeated local requests
  - in-flight upstream fetch deduping for concurrent local viewers on the same channel
  - shared-session idle expiry and cache cleanup after inactivity
- Timeshift routes currently own:
  - retained live segment polling and local buffer storage
  - per-channel rolling DVR window retention and eviction
  - synthetic timeshift master and variant-manifest delivery
  - timeshift capability/status reporting for the frontend
- The integrated stream-session layer now also owns:
  - channel-level composition of shared relay state plus timeshift state
  - explicit live-edge path vs buffered path exposure through `/api/streams/channels/:id/session/status`
  - honest distinction between relay-only sessions and relay-plus-DVR sessions
  - explicit viewer-policy metadata describing per-viewer playback-position semantics for shared DVR sessions
  - shared-session-backed acquisition reuse for retained buffers on `SHARED` channels
- Stream routes must not embed channel query logic inline; they depend on the channel service for stream configuration lookup.
- Invalid or expired proxy asset tokens should fail with `400`, not a fake upstream error.
- This milestone uses buffered upstream responses as a practical foundation. If future work adds streaming passthrough, that belongs inside the `streams` module rather than pages or generic app utilities.
- First-version timeshift state is process-local orchestration backed by disk-retained HLS assets under the configured storage root. If future work adds multi-process leasing or durable manifest indexes, that still belongs inside `streams`.
- First-version shared delivery is also process-local orchestration. It reduces redundant upstream fetches for local viewers through shared channel sessions plus short-lived edge caching, but it does not yet guarantee exactly one upstream request per asset across process restarts or multi-node deployments.
- The integrated shared-timeshift model is still process-local too. One channel session can back both relay/cache reuse and a retained DVR window, but that guarantee only holds inside the active API process.

## EPG Foundation Rules

- EPG source configuration is a first-class backend domain, not a JSON blob hidden inside channel records.
- XMLTV fetch/parsing orchestration belongs in the `epg` service layer.
- Imported source channels belong in dedicated `EpgSourceChannel` records, not duplicated across channels.
- Channel-to-guide linking belongs in dedicated `EpgChannelMapping` records, not direct mutable guide blobs on `Channel`.
- Imported and manual guide rows belong in durable `ProgramEntry` records.
- Manual guide rows may override imported rows, but that precedence rule must be resolved inside the `epg` module rather than inside pages or channel repositories.
- Guide import, mapping, and now/next assembly live behind the `epg` module boundary.
- Catch-up availability and programme-to-playback resolution also live behind the `epg` module boundary:
  - guide rows may expose explicit catch-up metadata
  - guide rows may also expose explicit archive-status metadata so the frontend does not infer whether a previous programme is recorded, catch-up-playable, or unavailable
  - programme playback resolution must return only real playable sources
  - routes must not assemble recording or retained-window playback URLs inline
- Current catch-up source policy is backend-owned:
  - linked recording match first
  - otherwise sufficiently overlapping recording coverage
  - otherwise retained DVR-window coverage
  - recording-backed playback is preferred over retained-window playback when both exist
  - current-program `Watch from start` is only valid when the retained DVR window honestly covers the programme start
- Previous programmes with no real source must fail explicitly instead of returning synthetic archive playback.
- This milestone uses explicit admin-triggered imports plus durable storage. Background refresh scheduling remains future work and should be added inside the `epg` module, not bolted onto route handlers.

## Recording Foundation Rules

- Recording scheduling, execution, storage, and playback access belong inside the `recordings` module.
- Real capture orchestration should use the existing channel/stream foundation instead of duplicating upstream request logic in route handlers.
- Recording routes may expose:
  - job CRUD and status listing
  - stop/cancel actions
  - playback-access token issuance
  - storage-backed media delivery
  - retention/protection updates for library items
  - thumbnail delivery for recorded media previews
  - program-aware archive context that links a recording back to a channel/programme history view when that context can be resolved honestly
- Recording execution state belongs in dedicated recording entities such as:
  - `RecordingJob`
  - `RecordingRule`
  - `RecordingRun`
  - `RecordingAsset`
- Routes must not spawn ffmpeg directly; process lifecycle belongs in recording runtime helpers behind the service/repository boundary.
- Storage paths must stay relative to the configured recordings root and be resolved safely inside the backend before file IO happens.
- Thumbnail extraction belongs to recording-runtime helpers or recording-specific services, not generic stream routes or frontend pages.
- Retention policy evaluation belongs inside the `recordings` module and must exclude explicitly protected recordings before deleting media or job history.

## Error Handling Rules

- validation failure: `400`
- unauthenticated: `401`
- forbidden/admin-only: `403`
- missing owned resource: `404`
- invalid or expired proxy token: `400`
- upstream stream test failures: `502`
- XMLTV upstream fetch/import failures: `502`

Keep those mappings stable unless the contract explicitly changes.

## Auth And Access Boundary Rules

- Protected routes must verify more than JWT signature alone:
  - validate the token
  - resolve the current user from persistence
  - reject stale or revoked sessions when the stored `sessionVersion` no longer matches
- Server-side permission checks are the source of truth for admin boundaries.
- Frontend route guards may improve UX, but they must never be the only protection for admin pages or operational APIs.
- Current role foundation:
  - `ADMIN`
    - has `admin:access` plus operational permissions such as `channels:manage`, `groups:manage`, `epg:manage`, `diagnostics:read`, `audit:read`, and `streams:inspect`
  - `USER`
    - has operator permissions such as `channels:read`, `epg:read`, `favorites:manage-own`, and `layouts:manage-own`
- New protected endpoints should use explicit permission guards where practical instead of ad-hoc inline role comparisons.

## Admin Governance Rules

- Sensitive admin mutations must create a durable audit event with sanitized metadata.
- Audit records must not store raw bearer tokens, raw upstream header values, or full sensitive operational URLs.
- Stream inspection endpoints that accept arbitrary upstream URLs or request-header overrides are admin-only surfaces, even if the UI already lives inside an admin page.

## Diagnostics Foundation Rules

- Runtime diagnostics remain cross-cutting and live inside the `diagnostics` module.
- Playback session tracking is now a real persisted foundation:
  - player surfaces send authenticated heartbeat updates
  - every heartbeat now carries a stable per-page `surfaceId` plus explicit per-viewer playback-position state
  - session cleanup expires stale sessions
  - admin monitoring reads live sessions and per-channel viewer counts from real session rows
  - shared relay state and retained DVR state remain channel-scoped, while live-edge vs behind-live position remains viewer-scoped
- Structured admin log viewing is currently process-local and in-memory:
  - logs are retained from real structured events emitted by the running API process
  - process restart still clears the retained log history
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
- Admin monitoring endpoints may include:
  - monitoring snapshot summaries
  - current playback sessions
  - per-channel viewer counts
  - filterable structured logs
- Failure classification should distinguish at least:

## Alerts Foundation Rules

- Operational alerts are not the same thing as structured logs:
  - logs keep raw runtime event history
  - alerts keep operator-facing, deduplicated issue state and high-value notifications
- Alert persistence belongs in the `alerts` module, not inside diagnostics routes, pages, or ad-hoc in-memory maps.
- Alert creation may be triggered by recordings, EPG import flows, stream/proxy delivery, or playback monitoring, but those domains should call into the `alerts` service instead of writing alert rows directly.
- Active-vs-historical behavior must stay explicit:
  - active alerts represent unresolved issues
  - resolved, dismissed, and success/info notifications remain historical records
- Recovery events should resolve the matching active alert when the owning subsystem can do so honestly.
- Repeated identical operational failures should dedupe on a stable key rather than creating one row per retry or per segment fetch.
  - `network`
  - `playlist-fetch`
  - `invalid-playlist`
  - `proxy-forwarding`
  - `epg-fetch`
  - `epg-parse`
  - `misconfiguration`
  - `unsupported-stream`
  - `synthetic-master`

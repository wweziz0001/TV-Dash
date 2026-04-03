# Codex Handoff

## Project Purpose

TV-Dash is a self-hosted IPTV/Web TV operations platform. Operators manage logical channels backed by either real HLS master playlists or manually entered quality variants, watch single feeds, compose multi-view walls, favorite channels, and save layouts.

The current operator milestone also adds:

- drag-to-swap multi-view tile reassignment
- focused-tile quick actions and keyboard shortcuts
- searchable quick channel switching in single-view and multiview
- now/next guide context on dashboard cards, multiview tiles, and single-view detail panels
- durable EPG source import, channel mapping, and manual guide management
- clearer saved-layout save/update/load ergonomics
- a denser operator layout pass that reduces oversized chrome and gives viewer surfaces more screen space
- a compact manual quality-variant admin workflow with presets, normalization helpers, inline row validation, and faster repetitive entry controls
- a first real recording system with immediate capture, timed/scheduled recording jobs, recordings library management, and recorded-media playback
- a first real observability layer with runtime stream/channel diagnostics, EPG diagnostics, structured backend event logs, and clearer playback-state reporting
- a dedicated admin observability area with live viewer sessions, per-channel current viewer counts, recent failures, and a filterable logs viewer
- a hardened auth/access baseline with session-version invalidation, explicit permission guards, admin-only stream inspection, and a durable admin audit trail
- a device-ux pass that makes mobile browsing practical, improves tablet watch/multiview behavior, and gives large-screen walls clearer layout policy

## Current Architecture Summary

- Monorepo with `apps/api`, `apps/web`, and `packages/shared`
- Backend now follows explicit `routes -> services -> repositories -> prisma` boundaries inside `apps/api/src/modules`
- Backend auth now resolves the current user for protected requests so stale or revoked sessions fail server-side instead of trusting old token claims indefinitely
- Backend observability now includes a dedicated `diagnostics` module for admin inspection endpoints plus shared structured-log helpers
- Backend governance now also includes an `audit` module for durable admin action records with sanitized detail fields
- Backend now also includes a `recordings` module for real ffmpeg-backed capture, scheduling, storage-backed media assets, and playback access tokens
- Playback session tracking now persists real active player heartbeats in PostgreSQL so admin monitoring pages can show who is watching what now
- Guide source imports, source-channel discovery, channel mappings, and persisted programme rows now also live in PostgreSQL
- Frontend keeps app bootstrap in `app`, route screens in `pages`, shared UI in `components`, auth in `features`, request logic in `services`, and player-specific code in `player`
- Shared API validation contracts live in `packages/shared`

## Standards Rulebook

Repository-specific engineering standards now live under `docs/standards/`.

Key references:

- `docs/standards/coding-standards.md`
- `docs/standards/naming-conventions.md`
- `docs/standards/react-typescript-standards.md`
- `docs/standards/backend-api-standards.md`
- `docs/standards/prisma-database-standards.md`
- `docs/standards/player-hls-standards.md`
- `docs/standards/testing-standards.md`

Future sessions should read those before making structural, player, API, or naming changes. They are the active engineering rulebook for TV-Dash.

## Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS, React Query, HLS.js
- Backend: Node.js, Fastify, Prisma, Zod, JWT auth
- Database: PostgreSQL
- Tests: Vitest in `apps/api` and `apps/web`

## Folder Structure

```text
docs/
  architecture/
  decisions/
  runbooks/
  handoff/
apps/
  api/
    prisma/
    src/
      app/
      config/
      db/
      modules/
  web/
    src/
      app/
      components/
      features/
      pages/
      player/
      services/
      styles/
      types/
packages/
  shared/
scripts/
tests/
```

## Key Backend Modules

- `auth`: login and current user lookup
- `audit`: durable admin governance events and audit listing
- `channels`: logical channel catalog CRUD, browse lookups, ingest-mode metadata, manual quality variants, playback-mode metadata, and playback-facing guide hints
- `epg`: EPG source CRUD, XMLTV import, source-channel discovery, channel mapping, manual program entry, resolved guide windows, and now/next lookup
- `groups`: category/group CRUD
- `favorites`: per-user pinned channels
- `layouts`: saved multi-view walls
- `recordings`: recording jobs, execution runs, storage-backed assets, playback access, and recordings-library responses
- `diagnostics`: runtime observability snapshots, playback session tracking, structured log retention, and admin monitoring endpoints
- `streams`: HLS metadata, stream test endpoints, and proxy gateway foundation
- `health`: readiness endpoint

## Database Overview

Prisma schema lives in `apps/api/prisma/schema.prisma`.

Main models:

- `User`
- `AuditEvent`
- `ChannelGroup`
- `Channel`
- `ChannelQualityVariant`
- `EpgSource`
- `EpgSourceChannel`
- `EpgChannelMapping`
- `ProgramEntry`
- `RecordingJob`
- `RecordingRun`
- `RecordingAsset`
- `Favorite`
- `SavedLayout`
- `SavedLayoutItem`

Key relationship rules:

- a channel optionally belongs to a group
- a channel may optionally have one `EpgChannelMapping`
- a channel may be configured in `MASTER_PLAYLIST` or `MANUAL_VARIANTS` source mode
- manual-variant channels store ordered `ChannelQualityVariant` rows instead of one upstream master URL
- an EPG source may be `XMLTV_URL` or `XMLTV_FILE`
- imported XMLTV channel identities live in `EpgSourceChannel`
- imported and manual guide rows live in `ProgramEntry`
- manual guide rows belong to channels directly and take precedence over overlapping imported rows when guide windows are resolved
- recording jobs store scheduling intent plus channel/title snapshots so history survives later channel edits or channel deletion
- recording runs store one concrete ffmpeg execution attempt with process/result metadata
- recording assets store finalized playable media metadata and relative storage keys under the configured recordings root
- channels may play either in `DIRECT` or `PROXY` mode
- favorites are per-user per-channel
- saved layouts are per-user and contain ordered tile items
- each logical channel resolves to one player-facing master source plus optional upstream request metadata
- users now carry a `sessionVersion` field so logout and future auth-sensitive changes can invalidate stale JWT-backed sessions server-side

## Player Architecture Overview

- `player/hls-player.tsx` owns one video element and one HLS.js instance
- `player/playback-recovery.ts` owns bounded fatal error recovery decisions
- `player/playback-diagnostics.ts` maps raw lifecycle state into operator-facing labels, summaries, recovery state, and failure-class hints
- quality options and preference resolution live in `player/quality-options.ts`
- manual-variant channels reach the player through a backend-generated synthetic master playlist, not duplicated channel rows
- supported multi-view layouts live in `player/layouts.ts`
- tile defaults and one-active-audio rules live in `player/multiview-layout.ts`
- saved multi-view serialization/hydration helpers live in `player/multiview-state.ts`
- focused-tile keyboard navigation lives in `player/multiview-shortcuts.ts`
- multiview tile chrome, quick actions, and drag/swap affordances live in `player/multiview-tile-card.tsx`
- device-aware multiview layout policy now lives in `player/multiview-viewport.ts`
- multiview audio handoff now stays inside control-state synchronization only:
  - root cause was `HlsPlayer` treating `initialBias` as a source-lifecycle dependency, so mute/unmute handoff tore down HLS and re-requested manifests
  - `HlsPlayer` now rebuilds playback only for real source changes or explicit retries, while mute state and preferred-quality updates sync separately
  - `MultiviewTileCard` no longer keys `HlsPlayer` by `tileIndex:channelId`, so same-source focus/metadata changes do not force React remounts

## Device Experience Overview

- Mobile:
  - app shell navigation now stays usable without a tall desktop-only sidebar block
  - small-screen buttons, inputs, and selects now use larger touch targets while desktop keeps compact sizing
  - single-view now uses an aspect-ratio-first player frame instead of a viewport-locked desktop height, and it adds an explicit fullscreen action
  - quick channel switching now opens in a more phone-friendly sheet with scroll locking
- Tablet / mid-size:
  - dashboard and watch filters/panels now reuse horizontal space sooner instead of stacking blindly until desktop breakpoints
  - single-view side panels now fan into a two-column support grid when the player stays primary
  - multi-view supports `1x1`, `1+2`, and `2x2` layouts only
- Desktop / large screen:
  - the shell max width is wider so operator layouts waste less space on large monitors
  - multi-view tile minimum sizes and focus layouts scale up more deliberately for wall-style monitoring
  - large-screen / TV-like viewports unlock dense `3x3` monitoring again

## Intentional Device Limits

- Phones intentionally do not expose `2x2`, `1+4`, or `3x3` multi-view walls because those tiles stop being monitor-usable at that size.
- Tablets intentionally stop at `2x2`; denser walls remain desktop / TV work.
- Touch-first devices intentionally disable drag-swap affordances for tiles; the supported workflows there are assign/replace, focus, fullscreen, and saved-layout application.
- Saved layouts can load into a smaller supported fallback layout on smaller devices; the page now prefers legibility over forcing every saved wall unchanged.

## Important Conventions

- Backend routes validate and translate HTTP only.
- Backend repositories are the only place Prisma queries belong.
- Frontend pages orchestrate; they do not become dumping grounds for reusable logic.
- Frontend services own HTTP requests.
- Frontend player behavior stays inside `src/player`.
- Cross-app contracts go in `packages/shared`; app-local types stay local.
- Frontend request payloads should use shared DTO types instead of `unknown` or ad-hoc object shapes.
- Role and permission checks now have a shared foundation in `packages/shared`, with backend permission guards as the source of truth for protected APIs.
- Saved layout config is now modeled as real JSON in shared contracts, not as an unbounded `any` record.
- Proxy playback URL selection happens in frontend service helpers, not inside the player lifecycle code.
- Manual-variant channels must resolve through the backend stream master path so HLS.js receives one logical manifest.
- Public channel responses may intentionally hide raw upstream stream URLs when proxy mode is enabled.
- Guide mapping and manual programme management belong to the `epg` module and admin EPG screen, not to channel CRUD routes.
- Guide resolution follows one practical precedence rule:
  - manual program entries override overlapping imported rows for the same channel
  - imported rows are still used for uncovered gaps before and after the manual window
- Runtime diagnostics and log viewing are currently split:
  - stream proxy, synthetic master, and XMLTV flows record live observations
  - admin diagnostics and observability pages read those snapshots through `/api/diagnostics/...`
  - structured logs are retained in memory per API process and clear on restart
- Active playback sessions are now persisted:
  - single-view and multiview surfaces send authenticated heartbeats
  - stale sessions expire after a bounded inactivity window
  - per-channel viewer counts are aggregated from non-stale, non-ended playback sessions
- Player state should flow upward through diagnostics callbacks for operator-facing surfaces instead of pages inferring status from raw HLS events.
- Stream inspection endpoints (`/api/streams/test` and `/api/streams/metadata`) are now explicitly admin-only because they accept arbitrary upstream URLs plus request-header overrides.
- Important admin mutations now create durable `AuditEvent` rows with sanitized details such as mode changes, booleans, ids, and counts instead of raw sensitive config values.
- Recording capture now uses the existing `/api/streams/channels/:id/master` path internally so request headers, proxy mode, and manual-variant synthetic masters stay owned by the stream/channel foundation instead of being reimplemented in the recorder.
- Recorded media is stored under `RECORDINGS_STORAGE_DIR` as relative dated paths and served back through signed playback URLs plus byte-range support for browser playback.

## Recording Modes And Library

- Current recording modes:
  - `IMMEDIATE`: starts now and runs until an operator stops it
  - `TIMED`: records for an explicit start/end window
  - `SCHEDULED`: future-only scheduled window that stays visible in the upcoming-jobs list
  - `EPG`: reserved in the schema/contracts for future “record this program” flows
- Current operator entry points:
  - watch page quick `Record now` / `Stop recording`
  - multiview tile `REC` / `Stop`
  - `/recordings` workspace for create, edit, cancel, stop, browse, search, and delete flows
- Recordings library capabilities:
  - filter/search recorded jobs
  - distinguish `COMPLETED`, `FAILED`, `CANCELED`, `PENDING`, `SCHEDULED`, and `RECORDING`
  - open completed media on `/recordings/:id`
  - delete library items and underlying stored files
- Current first-version storage/runtime limitations:
  - one API process owns the scheduler/runtime today
  - active recordings interrupted by process restart are marked failed instead of resumed
  - playback currently assumes browser-playable MP4 output from the captured stream path

## Testing Status

Current automated coverage includes:

- API health boot/injection test
- Fastify inject coverage for channels, groups, favorites, layouts, streams, and EPG route contracts
- Fastify inject coverage for auth login/me/logout session-version behavior and admin audit-event listing
- HLS master playlist parsing and synthetic master generation tests
- HLS playlist rewrite and proxy token tests
- XMLTV parser, guide resolver, manual-program validation, and now/next lookup tests
- HlsPlayer component coverage for bounded retry timers and source replacement cleanup
- diagnostics service, diagnostics route, and stream/XMLTV failure classification coverage
- structured-log filtering coverage
- playback session lifecycle, monitoring aggregation, and admin monitoring route coverage
- playback diagnostics helper coverage for recovered vs failed state mapping
- HlsPlayer regression coverage confirming multiview mute/unmute handoff does not recreate playback or request the source again
- player quality option resolution tests
- multi-view tile default/audio ownership tests
- multi-view layout serialization, hydration, and tile-scoped state reset tests
- multi-view tile swapping and keyboard shortcut helper tests
- device-aware multi-view viewport policy tests
- multiview tile-card regression coverage confirming focus/metadata changes do not remount the player when the source is unchanged
- channel-picker component coverage for scroll locking while the dialog is open
- guide-state display logic and channel-picker component tests
- channel admin form and playback URL helper tests
- compact manual quality-variant admin workflow coverage for presets, duplication, sorting, normalization, and inline validation

Mandatory verification commands:

- `npm run lint`
- `npm run test`
- `npm run build`

Optional but recommended for risky changes:

- `npm run smoke:test`

## Known Issues

- Vite still warns that the player chunk is large; route-level lazy loading is the next high-value frontend optimization.
- Fastify route tests still mock persistence; isolated database-backed CRUD coverage is the next backend confidence step.
- Route-level UI regression coverage for favorites and saved-layout application is still missing on the frontend.
- Logout currently invalidates all sessions for the current user via `sessionVersion`; per-device or per-session revocation is still future work.
- Admin reorder remains sort-order based rather than drag-and-drop.
- Manual variant rows now support presets, duplication, and auto-sort, but they still use button-driven ordering rather than drag-and-drop.
- The proxy foundation currently buffers upstream asset bodies in memory instead of true streaming passthrough.
- There is still no background import scheduler yet; XMLTV URL and file ingestion currently run from explicit admin actions.
- There is no full time-grid guide UI yet; the current milestone focuses on source management, mapping, manual entry, and now/next foundations.
- Imported programme rows are replaced per source import rather than versioned historically, so rollback and audit-by-program are still future work.
- Channel and EPG runtime diagnostics are still partly process-memory oriented right now; restarts clear transient diagnostic history even though source import status and guide rows are persisted.
- Structured admin logs are also process-memory only right now; restarts clear the log viewer history and there is no durable event sink yet.
- Proxy playback is intentionally exposed through unauthenticated asset paths because the current HLS client stack does not inject bearer headers into playlist/segment requests.
- Audit events are durable and queryable, but they currently store sanitized summaries rather than before/after diffs for every admin change.
- Manual-variant channels in `DIRECT` playback mode still rely on browser access to each upstream variant playlist and segment URL, so providers that require custom headers should use `PROXY` mode.
- The admin form shows the intended synthetic master order and row-level validation state, but it still does not render a full unsaved master-playlist preview.
- route-level React coverage for the full multiview page is still missing; current frontend regression coverage focuses on the new workflow helpers and picker component seams.
- responsive behavior is now much better on phones and tablets, but there is still no route-level viewport regression coverage for the full dashboard, single-view, or multi-view pages.
- drag-swap still reloads the affected positions because tile positions remain the player-instance boundary and the swap is a real source move across slots; this branch intentionally only fixes mute/unmute audio handoff reloads.
- touch-first multi-view intentionally disables tile drag-swap; a future branch could add a dedicated touch-safe reorder flow if operators need it often.
- `admin-channels-page.tsx`, `admin-epg-sources-page.tsx`, `multiview-page.tsx`, and `player/hls-player.tsx` are still valid but near the current complexity ceiling defined in the standards docs.

## Recommended Next Task

Add a scheduled EPG refresh worker plus a first full channel guide page so persisted programme data can stay fresh automatically and the new guide foundation can be used beyond now/next.

## Observability Milestone Summary

- Backend observability now records structured, real runtime observations for:
  - auth login success/failure
  - channel admin operations that affect playback behavior
  - proxy master and proxy asset failures
  - synthetic master generation
  - XMLTV fetch and parse behavior
  - guide lookup state
- Channel diagnostics now expose:
  - `healthy`, `degraded`, `failing`, or `unknown` health state
  - reachability
  - last success/failure times
  - last failure reason and class
  - current source/proxy mode
  - synthetic master expectation
  - last known guide integration state
- EPG diagnostics now expose:
  - fetch and parse summaries
  - last XMLTV failure class
  - cache freshness plus loaded channel/programme counts
- Frontend playback surfaces now distinguish:
  - loading
  - buffering
  - retrying
  - failed
  - recovered
  - muted/audio-owner state
  - current quality mode
- Admin inspection flows now exist in:
  - channel admin diagnostics panel
  - EPG source diagnostics panel
- Admin observability now also includes:
  - `/admin/observability` with live playback sessions
  - current per-channel viewer counts with watcher lists
  - recent failure/warning panels backed by structured logs
  - a filterable logs viewer segmented by severity and category
- Active session tracking works like this:
  - `ChannelWatchPage` and `MultiViewPage` send authenticated playback heartbeat payloads
  - each live player surface owns a stable playback session id
  - sessions store user, channel, session type, playback state, quality, mute state, tile index, and timestamps
  - admin monitoring excludes stale sessions by expiring rows whose heartbeat has gone quiet

## Security And Governance Milestone Summary

- JWT-backed sessions now include a persisted `sessionVersion`, and protected backend routes resolve the current user before trusting access.
- `/api/auth/logout` now invalidates active sessions server-side instead of only clearing client storage.
- Shared access permissions now define the current foundation for:
  - `ADMIN`
    - admin surface access plus channel, group, EPG, diagnostics, audit, and stream-inspection permissions
  - `USER`
    - operator-facing read access plus favorites/layout ownership actions
- Sensitive admin inputs now reject:
  - reserved upstream headers such as `authorization`, `cookie`, and proxy-forwarding headers
  - control characters in operational header or user-agent values
  - URLs with non-HTTP(S) schemes, embedded credentials, or fragments
- Durable audit records now exist for:
  - admin login/logout
  - channel create/update/delete/sort-order changes
  - group create/update/delete changes
  - EPG source create/update/delete changes
- Frontend auth UX now handles:
  - expired or revoked sessions with a clearer sign-in notice
  - denied admin access with a dedicated forbidden page instead of a silent redirect

## Operator UX Milestone Summary

- Multi-view now centers on a focused tile workflow with:
  - drag-to-swap tile reassignment
  - searchable tile replacement instead of only large in-tile dropdowns
  - clearer focused, muted, loading, retrying, and failed visual states
  - a dedicated focused-tile panel with now/next context and operator shortcuts
- Saved layouts now distinguish:
  - `Save as new`
  - `Update selected`
  - `Load saved layout`
  - `Delete`
- Dashboard and single-view now surface guide context more consistently without assuming perfect EPG data.
- Quick channel switching is now available:
  - single-view via a searchable quick switch dialog and `Ctrl/Cmd + K`
  - multiview via focused-tile picker shortcuts and tile-level replace actions
- Current multiview shortcuts:
  - `[` / `]` focus previous/next tile
  - `M` toggle focused-tile audio ownership
  - `C` or `Ctrl/Cmd + K` open the focused tile picker
  - `F` fullscreen focused tile
  - `Delete` clear the focused tile
  - `Shift + 1-5` switch layout presets

## Manual Variant Admin UX

- The channel admin form now treats manual quality entry like a compact ingest table instead of stacked mini-cards.
- Manual-variant operators can now:
  - add preset rows for `1080p`, `720p`, `480p`, or a `low/medium/high` ladder
  - duplicate an existing row without creating an immediate duplicate URL conflict
  - auto-sort known qualities low-to-high and re-number the synthetic master order
  - rely on label normalization for common synonyms such as `720`, `FULL HD`, or `med`
  - let blank labels pick up safe suggestions from URL patterns or entered resolution metadata
- Validation UX is denser and more operational:
  - source mode summary pills show whether the current manual set looks complete
  - each row surfaces its own ready/incomplete/error state inline
  - duplicate labels, duplicate sort orders, missing URLs, and invalid URLs now show as practical inline messages before save
  - manual direct-playback mode with custom upstream request settings now warns that headers/referrer only apply to the synthesized master request unless proxy mode is used
- Current future-work boundary:
  - no drag-and-drop row ordering yet
  - no unsaved synthetic master manifest preview yet
  - no bulk paste parser for importing many manual rows from text in one action

## Operator Density Corrections

- Oversized UI problems corrected:
  - oversized primary/secondary buttons were reduced through shared compact button sizing
  - input/select controls were tightened for operator toolbars and pickers
  - panel/header padding and rounded chrome were reduced across viewer-facing pages
  - multiview tile chrome, badges, picker rows, and player overlays were compressed so streams stay dominant
- Layout and container rules changed:
  - `AppShell` now uses a wider `max-w-[2048px]` workspace with smaller outer gutters
  - the left navigation rail is narrower and sticky on desktop so more width stays with the main content
  - `PageHeader` and `Panel` now support denser operator usage patterns instead of only roomy dashboard spacing
  - viewer-focused pages now prefer main-content-first wide layouts with compact side rails instead of evenly weighted columns
- Pages that gained more usable video or content space:
  - single-view watch page now gives the player a larger viewport-height footprint with a compact sticky side rail
  - multiview now puts the wall up higher on the page and moves focused-tile/saved-layout controls into a narrow right rail
  - dashboard/browse now uses tighter filters, denser favorites, and four-column large-screen browsing where space allows
- Density strategy adopted:
  - compact but readable controls
  - smaller gutters and less decorative padding
  - icon-first controls inside multiview where repeated actions are obvious
  - stronger separation between primary video surfaces and secondary metadata/toolbars
- Remaining UX refinement opportunities:
  - admin screens still use the older roomy density in places and should get the same operator-first pass later
  - multiview tile reordering is still mouse-first even though the rest of the tile workflow is denser and faster
  - route-level visual regression coverage for the full watch and multiview pages is still missing

## Remaining Limitations

- Guide data is still on-demand and source-backed, so partial or temporarily unavailable XMLTV sources can still leave some cards or tiles without now/next details.
- Drag-and-drop tile swapping is mouse-first today; there is not yet a full keyboard-only tile reordering flow.
- The quick switcher is local to the current page and does not yet expose cross-app command palette behavior.
- The player bundle warning remains; density corrections did not address route-level code splitting yet.

## Proxy And Guide Foundation Summary

- Channels now support real playback mode and upstream request configuration:
  - `playbackMode`
  - `upstreamUserAgent`
  - `upstreamReferrer`
  - `upstreamHeaders`
- The backend now exposes a real stream proxy foundation:
  - `GET /api/streams/channels/:channelId/master`
  - `GET /api/streams/channels/:channelId/asset?token=...`
  - master playlists are rewritten to signed asset URLs
  - upstream request headers/referrer/user-agent are applied centrally
- Public channel payloads now hide the upstream URL when proxy mode is enabled, while admin config endpoints still expose the raw URL for diagnostics.
- TV-Dash now has first-class guide management with three real source paths:
  - XMLTV import from URL
  - XMLTV import from uploaded file
  - manual programme entry from the admin UI
- Guide import works like this:
  - admins create an `EpgSource`
  - URL sources fetch XMLTV from the configured upstream
  - file sources accept uploaded XMLTV content during import
  - source channels are normalized into `EpgSourceChannel`
  - source imports replace that source's previously imported `ProgramEntry` rows
  - import status, counts, timestamps, and failure messages are stored on the source
- Channel mapping now works like this:
  - imported XMLTV channel ids are not stored directly on `Channel`
  - `EpgChannelMapping` links one TV-Dash channel to one imported source channel
  - the admin EPG page manages those mappings per source
- Manual program entry now works like this:
  - the real admin-facing workflow lives on `/admin/epg-sources` in `apps/web/src/pages/admin-epg-sources-page.tsx`
  - the dedicated per-channel schedule manager UI is implemented in `apps/web/src/components/epg/channel-manual-program-manager.tsx`
  - admins can select a channel and directly create, edit, browse, and delete manual `ProgramEntry` rows for that channel
  - the form supports:
    - single-entry mode with one start date/time and one end date/time
    - recurring generation mode with repeat start date, repeat end date, start time, end time, and selected weekdays
    - optional description, optional category/type, optional subtitle, and optional image URL
  - recurring saves generate multiple durable manual programme rows automatically so operators do not need to enter daily shows one day at a time
  - manual rows validate missing title, missing start/end, malformed local datetime input, malformed repeat ranges, missing repeat days, end-before-start, and overlapping manual entries on the same channel before save
  - backend validation still enforces the same overlap and DTO rules server-side
  - manual rows override imported rows when the resolved guide window is assembled
- Now/next resolution now works like this:
  - the backend resolves a channel guide window from mapped imported rows plus manual rows
  - overlapping manual windows trim imported coverage instead of duplicating entries
  - dashboard cards, multiview tiles, and the single-view watch page consume the same now/next contract
- Admin UI now includes:
  - expanded channel controls for proxy mode and upstream headers
  - a dedicated EPG management page with source CRUD, import actions, mapping tools, source diagnostics, and a real per-channel manual schedule manager
- Tests now cover proxy rewriting/token behavior, XMLTV parsing, guide resolution, EPG routes, proxy routes, and frontend helper logic for the new contracts.

## Flexible Channel Ingest Summary

- Channels now support two ingest modes:
  - `MASTER_PLAYLIST`: one upstream master playlist URL
  - `MANUAL_VARIANTS`: multiple manually entered variant playlist URLs
- Manual-variant channels are still exposed to end users as one logical channel only.
- The backend generates a real synthetic master playlist at `GET /api/streams/channels/:channelId/master` when a channel uses manual variants.
- Synthetic master generation rules:
  - one `#EXT-X-STREAM-INF` line per active manual variant
  - `BANDWIDTH` always present, using explicit metadata first and safe fallbacks second
  - `RESOLUTION` derived from explicit width/height, resolution-style labels like `720p`, or common low/medium/high mappings
  - `NAME` preserves admin-facing labels so HLS.js quality options can display clean names
- Playback behavior:
  - real-master channels keep the old behavior
  - manual-variant channels always use the backend master path so HLS.js sees one manifest
  - proxy playback mode rewrites manual variant URLs to signed proxy asset paths
  - direct playback mode leaves manual variant URLs upstream-facing after the synthetic master is generated
- Admin configuration behavior:
  - the channel form now has an explicit source-mode switch
  - master mode shows one master URL field
  - manual mode shows ordered variant rows with label, URL, status, sort order, and optional metadata
  - admins can add, remove, and reorder manual variant rows
- Remaining limitations:
  - new unsaved manual-variant channels cannot be previewed until they have a channel id because the synthetic master is generated server-side
  - if manual variants need custom headers or referrer handling during playback, `PROXY` mode should be used
  - synthetic metadata fallback is intentionally conservative and should be refined if provider-specific ladders need tighter control

## Next Recommended Priorities

1. Add route-level React tests for the denser watch and multiview layouts so critical operator surfaces have regression coverage beyond helper/component seams.
2. Add admin-side helper UX around manual variant metadata defaults and provider-specific ladder presets if operators start onboarding many non-master channels.
3. Add a real background XMLTV refresh scheduler plus import retention policy so sources can refresh automatically without manual admin action.
4. Complete the next stream proxy milestone by switching asset delivery from buffered fetches to streaming passthrough and validating more HLS edge cases around large segment traffic.
5. Add route-level lazy loading to reduce the large player bundle warning.

## Exact Local Commands

1. `cp .env.example .env`
2. `npm install`
3. `npm run db:generate`
4. `npm run db:deploy`
5. `npm run db:seed`
6. `npm run dev`
7. `npm run lint`
8. `npm run test`
9. `npm run build`
10. `npm run smoke:test`

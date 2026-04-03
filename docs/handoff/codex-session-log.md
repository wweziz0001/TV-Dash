# Codex Session Log

## `2026-04-04T09:30:00+03:00`

### Objective

Add real EPG-driven recording and recurring recording workflows to TV-Dash so operators can record a guide programme directly, manage recurring rules, and see how those jobs were created.

### Work Completed

- created the requested branch `017-epg-driven-and-recurring-recordings`
- extended the recording data model with:
  - guide-program snapshots and live `ProgramEntry` linkage on `RecordingJob`
  - per-job padding metadata
  - `RecordingRule` for recurring schedules
  - `RECURRING_RULE` and `EPG_PROGRAM` recording origins
- added the Prisma migration `20260404093000_epg_driven_and_recurring_recordings`
- implemented recurring rule support in the backend `recordings` module:
  - create, list, inspect, update, pause/resume, and delete recurring rules
  - daily recurrence
  - weekly recurrence
  - selected-weekday recurrence
  - timezone-aware recurrence projection with bounded lookahead
- implemented real recurring job generation:
  - the existing recording runtime now projects active recurring rules into concrete upcoming recording jobs
  - generated jobs keep rule linkage and rule snapshot context
  - rule edits/pauses remove future generated jobs before regeneration
- implemented real guide-program recording creation:
  - watch page now/next and upcoming-guide surfaces can create `Record this program` jobs directly
  - the backend derives the actual capture window from the selected `ProgramEntry` plus optional padding
  - created jobs retain programme linkage plus durable programme snapshots
- added a future-ready recurring foundation from guide context:
  - watch page programme actions can hand off into `/recordings` with a recurring-rule prefill
  - recurring rules can keep an originating programme snapshot plus optional future-program title matching
- expanded the `/recordings` workspace so operators can:
  - keep using immediate/timed/scheduled one-off recording flows
  - create and edit recurring rules
  - pause/resume recurring rules
  - delete recurring rules
  - see origin, padding, linked programme, and linked rule context for generated jobs
- added targeted tests for:
  - recurrence calculation
  - route-level EPG job creation
  - route-level recurring rule creation
  - recurring rule form validation
  - updated recording form state with padding

### Files Added Or Changed

- shared/API contracts:
  - `packages/shared/src/index.ts`
  - `apps/web/src/types/api.ts`
  - `apps/web/src/services/api.ts`
- Prisma and docs:
  - `apps/api/prisma/schema.prisma`
  - `apps/api/prisma/migrations/20260404093000_epg_driven_and_recurring_recordings/migration.sql`
  - `docs/architecture/api-boundaries.md`
  - `docs/standards/backend-api-standards.md`
  - `docs/standards/prisma-database-standards.md`
  - `docs/standards/testing-standards.md`
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`
- backend recordings/guide logic:
  - `apps/api/src/modules/epg/epg.repository.ts`
  - `apps/api/src/modules/epg/epg.service.ts`
  - `apps/api/src/modules/recordings/recording.repository.ts`
  - `apps/api/src/modules/recordings/recording.service.ts`
  - `apps/api/src/modules/recordings/recording.routes.ts`
  - `apps/api/src/modules/recordings/recording-runtime.ts`
  - `apps/api/src/modules/recordings/recording-recurrence.ts`
  - `apps/api/src/modules/recordings/recording-rule-sync.ts`
  - `apps/api/src/modules/recordings/recording-status.ts`
- frontend guide/recording UI:
  - `apps/web/src/pages/channel-watch-page.tsx`
  - `apps/web/src/pages/recordings-page.tsx`
  - `apps/web/src/components/channels/channel-program-list.tsx`
  - `apps/web/src/components/recordings/recording-form-state.ts`
  - `apps/web/src/components/recordings/recording-rule-form-state.ts`
  - `apps/web/src/components/recordings/recording-origin-badge.tsx`
  - `apps/web/src/pages/multiview-page.tsx`
- tests:
  - `apps/api/src/modules/recordings/recording-recurrence.test.ts`
  - `apps/api/src/modules/recordings/recording.routes.test.ts`
  - `apps/api/src/modules/recordings/recording-status.test.ts`
  - `apps/web/src/components/recordings/recording-form-state.test.ts`
  - `apps/web/src/components/recordings/recording-rule-form-state.test.ts`

### Key Decisions

- Kept recurrence inside the existing single-process recording runtime instead of introducing a second scheduler subsystem, because the current repo already has a real polling runtime and this branch needed practical functionality more than architectural expansion.
- Stored guide-program and recurring-rule snapshots on jobs in addition to optional live relations, because imported guide rows can be replaced on future XMLTV imports and history still needs to stay readable.
- Treated recurring rules as job generators rather than a placeholder schema: rules materialize concrete recording jobs inside a bounded lookahead window so operators can inspect and cancel upcoming occurrences.
- Blocked direct editing of generated recurring occurrences for now, because silently detaching or recreating them would be more confusing than asking operators to edit the rule or cancel the occurrence explicitly.
- Used guide-to-recurring-rule prefills on the watch page as the practical first series-like workflow, while keeping exact title matching on rules as the current future-program linkage seam.

### Verification Run

- `npm run db:generate -w apps/api`
- `npm run lint -w packages/shared`
- `npm run lint -w apps/api`
- `npm run lint -w apps/web`
- `npm run test -w apps/api -- recording-recurrence.test.ts recording-status.test.ts recording.routes.test.ts`
- `npm run test -w apps/web -- recording-form-state.test.ts recording-rule-form-state.test.ts`

### Remaining Risk

- The recording runtime is still single-process, so recurring-rule generation and due-job execution still need a shared lease/worker design before multi-replica deployment.
- Recurring rules currently project jobs only inside a bounded lookahead window; there is not yet a long-horizon DVR queue or retention policy.
- Future guide-program linkage for recurring rules currently depends on exact title matching when that match title is present; there is not yet a stronger series identifier strategy.
- Guide-program recording assumes the selected programme has an end time; open-ended programme rows still cannot become direct programme recordings.

### Exact Suggested Next Task

Move recurring job generation and due-job ownership into a lease-based worker, then add stronger series matching and skip/override handling for recurring rules.

## `2026-04-03T21:35:00+03:00`

### Objective

Add a real recording system to TV-Dash with immediate recording, timed/scheduled recording jobs, a recordings library, and playback of recorded media.

### Work Completed

- created the requested branch `016-scheduled-recording-and-recordings-library`
- added a dedicated backend `recordings` module with real recording lifecycle ownership:
  - `RecordingJob` for schedule intent and operator-facing status
  - `RecordingRun` for one concrete ffmpeg execution attempt
  - `RecordingAsset` for finalized playable recorded media
- added the Prisma migration `20260403180307_recording_workflows_foundation`
- added explicit recording env/config inputs:
  - `RECORDINGS_STORAGE_DIR`
  - `RECORDINGS_FFMPEG_PATH`
  - `RECORDINGS_POLL_INTERVAL_MS`
  - `RECORDING_PLAYBACK_TOKEN_TTL_SECONDS`
- implemented a real ffmpeg-based recording runtime that:
  - polls for due jobs
  - starts immediate and due-now jobs
  - stops recordings at the scheduled end time
  - supports manual stop from the API/UI
  - creates real `RecordingAsset` rows only when media output exists
  - marks interrupted runtime-owned recordings failed on process restart instead of pretending completion
- reused the existing `/api/streams/channels/:id/master` path as the recording input so recording still respects:
  - proxy playback mode
  - upstream request headers/referrer/user-agent
  - manual-variant synthetic master generation
- added backend recording APIs for:
  - create/list/get recording jobs
  - edit scheduled jobs
  - cancel scheduled jobs
  - stop active jobs
  - delete recordings
  - issue playback access URLs
  - stream recorded media with byte-range support
- added a new `/recordings` workspace in the web app that now supports:
  - immediate recording
  - timed recording creation
  - scheduled recording creation
  - editing/canceling upcoming jobs
  - monitoring active recordings
  - library search/filter
  - delete flows
- added `/recordings/:id` playback for completed recorded items
- added quick recording controls to:
  - single-view watch page
  - multiview tiles
- added targeted tests for:
  - recording status helpers
  - storage path safety
  - recording route contracts including playback access and ranged media delivery
  - recording form validation and payload building

### Files Added Or Changed

- shared/API contracts:
  - `packages/shared/src/index.ts`
  - `apps/web/src/types/api.ts`
  - `apps/web/src/services/api.ts`
- Prisma/config/runtime:
  - `apps/api/prisma/schema.prisma`
  - `apps/api/prisma/migrations/20260403180307_recording_workflows_foundation/migration.sql`
  - `.env.example`
  - `apps/api/src/config/env.ts`
  - `apps/api/src/server.ts`
- backend recordings module:
  - `apps/api/src/modules/recordings/recording.routes.ts`
  - `apps/api/src/modules/recordings/recording.service.ts`
  - `apps/api/src/modules/recordings/recording.repository.ts`
  - `apps/api/src/modules/recordings/recording-runtime.ts`
  - `apps/api/src/modules/recordings/recording-storage.ts`
  - `apps/api/src/modules/recordings/recording-playback-token.ts`
  - `apps/api/src/modules/recordings/recording-status.ts`
- web recordings UI:
  - `apps/web/src/pages/recordings-page.tsx`
  - `apps/web/src/pages/recording-playback-page.tsx`
  - `apps/web/src/components/recordings/recording-form-state.ts`
  - `apps/web/src/components/recordings/recording-status-badge.tsx`
  - `apps/web/src/pages/channel-watch-page.tsx`
  - `apps/web/src/pages/multiview-page.tsx`
  - `apps/web/src/player/multiview-tile-card.tsx`
  - `apps/web/src/app/router.tsx`
  - `apps/web/src/components/layout/app-shell.tsx`
- tests:
  - `apps/api/src/modules/recordings/recording-status.test.ts`
  - `apps/api/src/modules/recordings/recording-storage.test.ts`
  - `apps/api/src/modules/recordings/recording.routes.test.ts`
  - `apps/web/src/components/recordings/recording-form-state.test.ts`
  - `apps/web/src/services/api.test.ts`

### Key Decisions

- Reused the existing stream/channel playback foundation for recording input instead of building a second upstream-ingest stack, because the proxy/manual-variant/channel-request policy already lives there and should stay singular.
- Stored channel title/slug snapshots on recording jobs/assets so library history remains readable even if channel metadata changes later.
- Kept the first runtime deliberately single-process and explicit instead of introducing a broader job-queue subsystem in the same branch.
- Used signed playback URLs plus byte-range delivery for recorded media so native browser playback works without pushing long-lived auth tokens into video URLs.
- Treated `SCHEDULED` as a future-only operator workflow in the web form while still keeping `TIMED` available for explicit time-window capture.

### Verification Run

- `npm run db:generate -w apps/api`
- `npm run lint -w apps/api`
- `npm run lint -w apps/web`
- `npm run test -w apps/api -- recording-status.test.ts recording-storage.test.ts recording.routes.test.ts`
- `npm run test -w apps/web -- recording-form-state.test.ts api.test.ts multiview-tile-card.test.tsx`

### Remaining Risk

- The recording runtime is still single-process; horizontal API replicas would need a shared scheduler/lease model before concurrent production deployment.
- Interrupted in-progress recordings are marked failed on process restart instead of resuming.
- The current output path targets MP4 playback pragmatically; unusual upstream codec/container combinations may need future fallback/remux policy.
- There is not yet a full EPG “record this program” button even though the schema/contracts now have an `EPG` mode and `programEntryId` seam ready for it.

### Exact Suggested Next Task

Add EPG-driven “record this programme” entry points plus retention/cleanup policy, then evaluate whether the recording runtime should move to a dedicated worker when deployment moves beyond one API process.

## `2026-04-03T20:35:00+03:00`

### Objective

Strengthen the manual EPG/program-entry workflow so TV-Dash has a real per-channel admin scheduling UI instead of only backend/manual-entry foundations.

### Work Completed

- created the requested working branch `015-manual-epg-program-entry-admin-ui`
- kept the existing persisted manual-program backend and now/next integration intact, then hardened the operator workflow on top of it
- extracted manual programme scheduling into a dedicated admin component:
  - `apps/web/src/components/epg/channel-manual-program-manager.tsx`
  - `apps/web/src/components/epg/manual-program-form-state.ts`
- upgraded the admin EPG page so operators can now:
  - select one channel and immediately manage that channel's manual schedule
  - browse the stored schedule in a clear per-day list
  - see title, start time, end time, category, status, description, edit, and delete actions
  - add new manual rows and edit existing rows in a compact side-by-side workflow
  - generate repeated manual rows automatically by choosing repeat start date, repeat end date, start time, end time, and weekdays
- kept the form practical for repeated use by centering the required fields:
  - title
  - start date/time
  - end date/time
  - optional description
  - optional category/type
  - optional subtitle and image URL are still supported so existing data is not lost during edits
- added practical client-side validation before save:
  - missing channel
  - missing title
  - missing start or end time
  - malformed local datetime input
  - malformed repeat start/end dates
  - missing repeat days
  - end before start
  - overlap detection against existing manual rows on the selected channel
  - shared DTO validation for URL/length/schema rules before requests are sent
- added overlap feedback that shows the conflicting manual rows directly in the editor instead of only relying on backend rejection
- improved mutation invalidation so manual create/update/delete refreshes:
  - channel list data
  - manual-program queries
  - now/next consumer queries used by dashboard, watch, and multiview flows
- extended tests for:
  - manual form validation and overlap handling
  - admin create/edit/delete UI behavior
  - manual-program API list/update/delete behavior
  - manual-only now/next resolution

### Files Added Or Changed

- frontend manual-program admin workflow:
  - `apps/web/src/components/epg/channel-manual-program-manager.tsx`
  - `apps/web/src/components/epg/manual-program-form-state.ts`
  - `apps/web/src/pages/admin-epg-sources-page.tsx`
- frontend tests:
  - `apps/web/src/components/epg/channel-manual-program-manager.test.tsx`
  - `apps/web/src/components/epg/manual-program-form-state.test.ts`
- backend tests:
  - `apps/api/src/modules/epg/epg.routes.test.ts`
  - `apps/api/src/modules/epg/guide-resolver.test.ts`
- docs:
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- Kept manual scheduling inside the dedicated admin EPG page instead of moving it back into channel CRUD, because channel setup and ongoing schedule operations are still separate operator tasks.
- Removed the old all-channels flat list behavior from the primary manual-entry workflow and made it explicitly channel-first, because operators need to open one channel and manage its schedule directly.
- Added client-side overlap and datetime validation on top of the backend conflict checks, because operational users need immediate feedback before submitting repetitive schedule edits.
- Preserved optional subtitle and image support in the form so existing manual rows can still be edited without dropping data, even though the core workflow now emphasizes title/time/category/description.

### Verification Run

- `npm run test -w apps/web -- manual-program-form-state.test.ts channel-manual-program-manager.test.tsx`
- `npm run test -w apps/api -- epg.routes.test.ts guide-resolver.test.ts`
- `npm run lint -w apps/web`
- `npm run lint -w apps/api`

### Remaining Risk

- There is still no full time-grid guide editor yet; the current UI is a compact list-plus-form workflow rather than a drag/drop schedule canvas.
- There is still no background XMLTV refresh scheduler; imported sources remain explicitly admin-triggered.
- Manual schedule edits invalidate guide consumers in the current app session, but there is still no websocket/live-push mechanism for other active operator sessions.

### Exact Suggested Next Task

Add a first full channel guide grid or timeline view on top of the existing resolved guide APIs, then layer scheduled XMLTV refresh and multi-operator live refresh on top of that workflow.

## `2026-04-03T08:10:00+03:00`

### Objective

Add a real EPG/program guide management foundation to TV-Dash with XMLTV URL import, XMLTV file import, manual program entry, channel mapping, persisted now/next data, and an admin workflow that is practical for repeated operations.

### Work Completed

- created the requested working branch `014-epg-import-manual-entry-and-guide-management`
- replaced the old lightweight source-backed EPG foundation with durable guide persistence by adding:
  - `EpgSource` import status fields
  - `EpgSourceChannel` for imported XMLTV channel identities
  - `EpgChannelMapping` for normalized channel-to-guide linkage
  - `ProgramEntry` for imported and manual schedule rows
- added a migration that also backfills legacy direct channel guide linkage into the new normalized mapping tables before removing the old `Channel.epgSourceId` and `Channel.epgChannelId` storage
- upgraded the backend `epg` module to support:
  - EPG source create/update/delete
  - XMLTV import from URL
  - XMLTV import from uploaded file
  - source-channel discovery per source
  - channel mapping writes
  - manual program create/update/delete/list
  - resolved guide-window lookup per channel
  - persisted now/next lookup from imported plus manual data
- implemented one explicit guide precedence rule:
  - manual program entries override overlapping imported entries for the same channel
  - imported entries still fill uncovered gaps before and after the manual window
- added overlap handling for manual program entry so conflicting manual rows on the same channel are rejected intentionally instead of silently stacking
- updated channel-facing backend responses so existing player and browse surfaces still receive practical guide hints even though guide linkage now lives in dedicated EPG tables
- rewrote the admin EPG page into a real guide-operations workflow with:
  - source CRUD
  - URL refresh
  - XMLTV file upload/import
  - imported source-channel browsing
  - channel mapping controls
  - manual program create/edit/delete controls
  - source status, counts, timestamps, and failure feedback
- removed old channel-form EPG mapping responsibility so guide mapping and manual schedule work now live in the admin EPG surface instead of channel CRUD
- extended now/next consumers on dashboard/watch/multiview flows to handle the richer persisted guide foundation and the new `SOURCE_INACTIVE` state
- added or updated targeted tests for:
  - XMLTV parser normalization
  - guide-resolution precedence
  - EPG route contracts
  - diagnostics behavior affected by the new guide foundation
  - channel admin form compatibility with the shared DTO shape

### Files Added Or Changed

- shared contracts:
  - `packages/shared/src/index.ts`
- Prisma schema, migration, and seed:
  - `apps/api/prisma/schema.prisma`
  - `apps/api/prisma/migrations/20260403070000_epg_guide_management_foundation/migration.sql`
  - `apps/api/prisma/seed.ts`
- backend EPG/domain work:
  - `apps/api/src/modules/epg/epg.repository.ts`
  - `apps/api/src/modules/epg/epg.service.ts`
  - `apps/api/src/modules/epg/epg.routes.ts`
  - `apps/api/src/modules/epg/xmltv-parser.ts`
  - `apps/api/src/modules/epg/guide-resolver.ts`
  - `apps/api/src/app/request-schemas.ts`
  - `apps/api/src/modules/channels/channel.repository.ts`
  - `apps/api/src/modules/channels/channel-mappers.ts`
  - `apps/api/src/modules/diagnostics/diagnostic.service.ts`
  - `apps/api/src/modules/audit/audit.service.ts`
- frontend/admin and now-next consumers:
  - `apps/web/src/pages/admin-epg-sources-page.tsx`
  - `apps/web/src/pages/admin-channels-page.tsx`
  - `apps/web/src/components/channels/channel-admin-form-state.ts`
  - `apps/web/src/components/channels/channel-admin-form.tsx`
  - `apps/web/src/components/channels/channel-card.tsx`
  - `apps/web/src/components/channels/channel-picker-dialog.tsx`
  - `apps/web/src/pages/channel-watch-page.tsx`
  - `apps/web/src/pages/multiview-page.tsx`
  - `apps/web/src/player/multiview-tile-card.tsx`
  - `apps/web/src/services/api.ts`
  - `apps/web/src/types/api.ts`
- tests:
  - `apps/api/src/modules/epg/guide-resolver.test.ts`
  - `apps/api/src/modules/epg/xmltv-parser.test.ts`
  - `apps/api/src/modules/epg/epg.routes.test.ts`
  - `apps/api/src/modules/diagnostics/diagnostic.routes.test.ts`
  - `apps/api/src/modules/channels/channel.routes.test.ts`
  - `apps/web/src/components/channels/channel-admin-form-state.test.ts`
  - `apps/web/src/components/channels/channel-admin-form.test.tsx`
  - `apps/web/src/components/channels/channel-guide-state.test.ts`
- docs:
  - `docs/architecture/api-boundaries.md`
  - `docs/standards/backend-api-standards.md`
  - `docs/standards/prisma-database-standards.md`
  - `docs/standards/testing-standards.md`
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- Normalized imported guide identities into dedicated `EpgSourceChannel` and `EpgChannelMapping` tables instead of leaving EPG linkage on `Channel`, because future guide pages and recording/scheduler work need cleaner ownership boundaries.
- Stored imported XMLTV programme rows durably in `ProgramEntry` instead of keeping the old on-demand/in-memory fetch model, but deliberately stopped short of building a background job system in the same branch.
- Chose one explicit precedence rule where manual entries override overlapping imported entries, because that gives operators a practical correction path without inventing a larger versioning system yet.
- Kept XMLTV URL and XMLTV file import as explicit admin-triggered actions so the workflow is real today while leaving scheduler/retention concerns as the next milestone.
- Moved guide mapping and manual program operations into the dedicated admin EPG screen instead of the channel form, because channel CRUD and schedule operations had become two separate admin workflows.

### Verification Run

- `npm run db:generate -w apps/api`
- `npm run lint -w apps/api`
- `npm run lint -w apps/web`
- `npm run test -w apps/api -- epg xmltv guide-resolver diagnostic.service diagnostic.routes channel-input`
- `npm run test -w apps/web -- channel-admin-form-state.test.ts channel-admin-form.test.tsx channel-guide-state.test.ts`
- `npm run lint`
- `npm run build`
- `npm run test`

### Remaining Risk

- There is still no background import scheduler or retry queue; XMLTV sources refresh only when an admin triggers import.
- There is still no full time-grid guide page yet; this branch intentionally focuses on durable source, mapping, manual-entry, and now/next foundations.
- Imported programme rows are replaced per source import rather than historically versioned, so audit/rollback at the individual programme level is still future work.
- The admin EPG screen is now functional and compact, but it remains one of the denser screens in the repo and may benefit from future component extraction if guide workflows expand again.

### Exact Suggested Next Task

Add scheduled EPG refresh plus a first full guide view that reuses the new resolved guide-window APIs, then evaluate recording/scheduling on top of that stable foundation.

## `2026-04-03T06:25:00+03:00`

### Objective

Improve real device usability in TV-Dash by making channel browsing, single-view playback, multi-view layouts, and navigation work better across mobile, tablet, desktop, and TV-like screens without weakening the operator-first experience.

### Work Completed

- created the requested working branch `013-mobile-tv-layouts-and-device-experience`
- added a device-aware multiview viewport policy with explicit layout availability by screen class:
  - phones: `1x1` and `1+2`
  - tablets: up to `2x2`
  - desktops: up to `1+4`
  - large-screen / TV-like displays: full `3x3`
- improved single-view usability across device sizes by:
  - replacing the old viewport-locked player height with a more practical aspect-ratio-first frame on small screens
  - adding an explicit fullscreen toggle that preserves playback state
  - turning the support panels into a responsive companion grid instead of one long desktop-only sidebar
- improved mobile and tablet browsing ergonomics by:
  - increasing touch-target sizing for compact buttons, inputs, and selects on smaller screens
  - making page-header actions stack cleanly on small screens
  - tightening dashboard filtering/card behavior so tablet widths reuse horizontal space sooner
- improved the app shell for real device use by:
  - converting the sidebar into a more practical top navigation experience on small screens
  - keeping primary/admin nav reachable through horizontal scrolling instead of a tall stacked menu block
  - widening the max layout width for large-screen operator usage
- improved channel switching and multi-view control usability by:
  - converting the picker dialog into a more mobile-friendly sheet with body scroll locking
  - making tile quality control wrap more cleanly
  - labeling tiles more clearly for monitor-style scanning
  - disabling drag-swap affordances on touch-first devices where HTML drag-and-drop is unreliable
- improved large-screen / TV-like monitoring density by increasing multi-view tile sizing rules and unlocking larger wall presets only where they stay readable
- added targeted frontend tests for:
  - device-aware multi-view layout fallback and viewport policy
  - touch-first tile drag-affordance disabling
  - picker dialog scroll locking while open

### Files Added Or Changed

- frontend device/profile and multiview policy:
  - `apps/web/src/lib/device-profile.ts`
  - `apps/web/src/lib/use-device-profile.ts`
  - `apps/web/src/player/multiview-viewport.ts`
  - `apps/web/src/player/multiview-viewport.test.ts`
- responsive shell, browsing, and player UX:
  - `apps/web/src/components/layout/app-shell.tsx`
  - `apps/web/src/components/layout/page-header.tsx`
  - `apps/web/src/components/ui/button.tsx`
  - `apps/web/src/components/ui/input.tsx`
  - `apps/web/src/components/ui/select.tsx`
  - `apps/web/src/components/channels/channel-card.tsx`
  - `apps/web/src/components/channels/channel-picker-dialog.tsx`
  - `apps/web/src/pages/dashboard-page.tsx`
  - `apps/web/src/pages/channel-watch-page.tsx`
  - `apps/web/src/pages/multiview-page.tsx`
  - `apps/web/src/player/layouts.ts`
  - `apps/web/src/player/multiview-tile-card.tsx`
- tests:
  - `apps/web/src/components/channels/channel-picker-dialog.test.tsx`
  - `apps/web/src/player/multiview-tile-card.test.tsx`
- docs:
  - `docs/architecture/player-architecture.md`
  - `docs/architecture/testing-strategy.md`
  - `docs/standards/testing-standards.md`
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- Treated responsiveness as workflow policy rather than pure styling by adding one multiview device-policy seam instead of scattering breakpoint-specific conditionals through the page.
- Kept desktop compactness by making touch-target growth responsive for smaller screens only instead of enlarging the whole app globally.
- Chose to limit multi-view density on phones/tablets rather than forcing every saved wall unchanged, because legibility and operability matter more than layout parity.
- Disabled tile drag-swap on touch-first devices instead of shipping a fragile pseudo-drag interaction; assign/replace, focus, fullscreen, and saved-layout flows remain the supported touch path.

### Verification Run

- `npm run test -w apps/web -- multiview-viewport.test.ts multiview-tile-card.test.tsx channel-picker-dialog.test.tsx`
- `npm run lint -w apps/web`
- `npm run test -w apps/web`
- `npm run build -w apps/web`

### Remaining Risk

- Route-level responsive regression coverage for the full dashboard, single-view page, and multiview page is still missing; current coverage focuses on the extracted device-policy and component seams.
- Touch-first multi-view intentionally disables drag-swap instead of replacing it with a dedicated touch reorder workflow.
- Large-screen layouts now use space better, but the player chunk warning remains and route-level lazy loading is still the next major frontend performance win.

### Exact Suggested Next Task

Add route-level frontend regression coverage for device-specific dashboard, single-view fullscreen, and multiview saved-layout fallback behavior, then evaluate whether touch-safe tile reordering is worth introducing as a separate workflow.

## `2026-04-03T05:55:00+03:00`

### Objective

Harden real security, access control, and admin governance in TV-Dash by strengthening server-side auth/session handling, admin-only boundaries, sensitive config validation, and auditability.

### Work Completed

- created the requested working branch `012-security-access-and-admin-hardening`
- added a cleaner role/access foundation in `packages/shared` with explicit permissions instead of relying on scattered admin checks
- hardened backend auth/session behavior with:
  - JWT `sessionVersion` claims
  - persisted `User.sessionVersion`
  - current-user resolution for protected requests
  - server-side stale/revoked session rejection
  - a real `POST /api/auth/logout` invalidation path
- tightened protected API discipline:
  - channel, group, EPG, diagnostics, audit, and stream-inspection routes now use explicit permission guards
  - stream inspection endpoints are now admin-only because they accept arbitrary upstream URLs plus request-header overrides
- strengthened sensitive admin-config validation by rejecting:
  - reserved upstream header names such as `authorization`, `cookie`, `host`, and forwarding headers
  - control characters in operational header/user-agent values
  - URLs with non-HTTP(S) schemes, embedded credentials, or fragments
- added a lightweight durable audit foundation with:
  - Prisma `AuditEvent` storage
  - new `audit` backend module
  - `GET /api/audit/events` admin route
  - sanitized audit summaries for important admin actions instead of raw secret-bearing config values
- recorded audit events for:
  - admin login/logout
  - channel create/update/delete/sort-order changes
  - group create/update/delete changes
  - EPG source create/update/delete changes
- improved admin security UX with:
  - clearer expired/revoked-session handling on login
  - dedicated forbidden route behavior for denied admin access
  - frontend auth expiry handling driven by `401` responses
- added targeted tests for:
  - auth login/me/logout and stale-session rejection
  - admin-only API protection
  - reserved-header/config validation rejection
  - durable audit event creation and listing
  - frontend protected-route and expired-session behavior

### Files Added Or Changed

- shared role/access and validation contracts:
  - `packages/shared/src/index.ts`
- backend auth and access control:
  - `apps/api/src/app/auth-guards.ts`
  - `apps/api/src/app/plugins/auth.ts`
  - `apps/api/src/modules/auth/*`
- backend audit/governance:
  - `apps/api/src/modules/audit/*`
  - `apps/api/prisma/schema.prisma`
  - `apps/api/prisma/migrations/202604030003_security_access_and_audit_foundation/migration.sql`
- hardened backend routes:
  - `apps/api/src/modules/channels/channel.routes.ts`
  - `apps/api/src/modules/groups/group.routes.ts`
  - `apps/api/src/modules/epg/epg.routes.ts`
  - `apps/api/src/modules/diagnostics/diagnostic.routes.ts`
  - `apps/api/src/modules/favorites/favorite.routes.ts`
  - `apps/api/src/modules/layouts/layout.routes.ts`
  - `apps/api/src/modules/streams/stream.routes.ts`
- frontend auth/admin UX:
  - `apps/web/src/features/auth/auth-context.tsx`
  - `apps/web/src/features/auth/auth-context.test.tsx`
  - `apps/web/src/pages/login-page.tsx`
  - `apps/web/src/pages/forbidden-page.tsx`
  - `apps/web/src/app/router.tsx`
  - `apps/web/src/components/layout/app-shell.tsx`
  - `apps/web/src/pages/admin-observability-page.tsx`
  - `apps/web/src/services/api.ts`
  - `apps/web/src/types/api.ts`
- docs:
  - `docs/architecture/api-boundaries.md`
  - `docs/architecture/development-policy.md`
  - `docs/architecture/testing-strategy.md`
  - `docs/standards/backend-api-standards.md`
  - `docs/standards/prisma-database-standards.md`
  - `docs/standards/testing-standards.md`
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- Used `sessionVersion` as the first practical server-side invalidation seam instead of building a much larger IAM/session product in one branch.
- Kept role modeling lightweight but explicit by introducing shared permissions and backend permission guards rather than scattering admin checks further.
- Chose a durable `AuditEvent` table because in-memory logs alone were not enough for admin governance.
- Stored only sanitized audit summaries so operational secrets and raw upstream config values do not leak into the audit trail.

### Verification Run

- `npm run db:generate`
- `npm run lint`
- `npm run test`
- `npm run build`

### Remaining Risk

- Session invalidation is currently per-user via `sessionVersion`, so logout revokes all active sessions for that user rather than one device/tab only.
- Audit events record durable sanitized summaries, but they do not yet capture richer before/after diffs or approval workflows.
- Admin user/role management endpoints still do not exist, so the new permission foundation is ready for extension but not yet exercised by role mutation flows.

### Exact Suggested Next Task

Add real admin user management with role changes, password/session revocation workflows, and per-session/device invalidation so the new permission and audit foundations can govern administrators as well as channels and sources.

## `2026-04-03T04:35:00+03:00`

### Objective

Make observability visible inside the product itself by adding a real admin monitoring area with live viewer sessions, who-is-watching-what visibility, per-channel current viewer counts, recent failures, and a practical logs viewer.

### Work Completed

- created the requested working branch `011-observability-admin-logs-and-live-viewer-monitoring`
- added a persisted playback session foundation with:
  - Prisma `PlaybackSession` storage
  - authenticated heartbeat ingestion from real player pages
  - explicit session end handling plus stale-session cleanup
  - session state fields for user, channel, session type, playback state, quality, mute state, tile index, failure kind, started time, and last seen time
- extended the diagnostics module with admin monitoring capabilities:
  - `GET /api/diagnostics/monitoring`
  - `GET /api/diagnostics/logs`
  - `POST /api/diagnostics/playback-sessions/heartbeat`
  - `POST /api/diagnostics/playback-sessions/end`
- upgraded structured logging so the API now retains a recent in-memory admin-viewable log buffer with:
  - severity
  - category segmentation
  - free-text filtering support
  - recent-first ordering
- wired real player heartbeats from:
  - `ChannelWatchPage`
  - `MultiViewPage`
- added a new admin observability route and navigation entry:
  - `/admin/observability`
  - live sessions list showing who is watching what now
  - per-channel viewer count list with watcher details
  - recent failures and warnings panel
  - filterable structured logs viewer
- added targeted tests for:
  - structured-log filtering
  - playback session lifecycle logging and cleanup behavior
  - monitoring aggregation
  - admin monitoring route responses and protection
  - frontend heartbeat hook behavior

### Files Added Or Changed

- shared contracts and persistence:
  - `packages/shared/src/index.ts`
  - `apps/api/prisma/schema.prisma`
  - `apps/api/prisma/migrations/202604030002_playback_sessions_for_observability/migration.sql`
- backend monitoring foundation:
  - `apps/api/src/app/request-schemas.ts`
  - `apps/api/src/app/structured-log.ts`
  - `apps/api/src/modules/diagnostics/diagnostic.routes.ts`
  - `apps/api/src/modules/diagnostics/monitoring.service.ts`
  - `apps/api/src/modules/diagnostics/playback-session.repository.ts`
  - `apps/api/src/modules/diagnostics/playback-session.service.ts`
- frontend monitoring and heartbeat wiring:
  - `apps/web/src/features/observability/use-playback-session-heartbeat.ts`
  - `apps/web/src/pages/admin-observability-page.tsx`
  - `apps/web/src/pages/channel-watch-page.tsx`
  - `apps/web/src/pages/multiview-page.tsx`
  - `apps/web/src/app/router.tsx`
  - `apps/web/src/components/layout/app-shell.tsx`
  - `apps/web/src/services/api.ts`
  - `apps/web/src/types/api.ts`
- tests:
  - `apps/api/src/app/structured-log.test.ts`
  - `apps/api/src/modules/diagnostics/playback-session.service.test.ts`
  - `apps/api/src/modules/diagnostics/monitoring.service.test.ts`
  - `apps/api/src/modules/diagnostics/diagnostic.routes.test.ts`
  - `apps/web/src/features/observability/use-playback-session-heartbeat.test.tsx`
- docs:
  - `docs/architecture/api-boundaries.md`
  - `docs/architecture/testing-strategy.md`
  - `docs/standards/backend-api-standards.md`
  - `docs/standards/testing-standards.md`
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- Kept admin log viewing process-local and in-memory for this milestone so the product gains a real logs viewer quickly without forcing a broader logging platform decision.
- Made playback sessions durable in PostgreSQL because live viewer counts and who-is-watching queries need real per-user session state rather than decorative counters.
- Reused the existing `diagnostics` module instead of creating a second observability module, because monitoring, log viewing, and inspection endpoints are all part of the same cross-cutting admin surface.
- Logged playback session lifecycle changes only on meaningful state transitions such as start, fail, recover, and end to avoid noisy heartbeat spam.

### Verification Run

- `npm run db:generate`
- `npm run lint -w packages/shared`
- `npm run lint -w apps/api`
- `npm run test -w apps/api -- structured-log.test.ts playback-session.service.test.ts monitoring.service.test.ts diagnostic.routes.test.ts`
- `npm run lint -w apps/web`
- `npm run test -w apps/web -- use-playback-session-heartbeat.test.tsx`

### Remaining Risk

- The logs viewer currently shows retained logs from the running API process only; logs do not survive restart or span multiple API instances yet.
- Playback sessions are durable, but the current admin page still refreshes on polling rather than server push or websockets.
- Monitoring currently tracks the real single-view and multiview watch surfaces; admin preview players in edit screens are intentionally not counted as live viewer sessions.

### Exact Suggested Next Task

Add durable log/event persistence plus push-based live monitoring updates so `/admin/observability` can retain history across restarts and update without polling.

## `2026-04-03T03:55:00+03:00`

### Objective

Add real observability, monitoring, and stream diagnostics foundations so TV-Dash becomes meaningfully easier to troubleshoot during live playback, proxying, and XMLTV guide usage.

### Work Completed

- created the requested working branch `010-observability-monitoring-and-stream-diagnostics`
- added a backend diagnostics foundation with:
  - shared diagnostic health/failure enums in `packages/shared`
  - structured backend event logging with stable event names and sanitized detail fields
  - a new `diagnostics` module that retains runtime observations in memory and exposes admin inspection endpoints
- improved backend failure classification for:
  - network failures
  - playlist fetch failures
  - invalid playlist responses
  - proxy forwarding failures
  - XMLTV fetch failures
  - XMLTV parse failures
  - misconfiguration and validation failures
  - unsupported stream responses
  - synthetic master generation failures
- instrumented real backend observation points instead of decorative UI:
  - proxy master and asset serving
  - synthetic master generation
  - stream inspection failures
  - XMLTV fetch/parse flows
  - guide lookup state
  - auth login outcomes
  - playback-affecting admin channel/EPG operations
- added admin diagnostics endpoints and frontend service/types for:
  - `GET /api/diagnostics/channels/:channelId`
  - `GET /api/diagnostics/epg-sources/:id`
- upgraded player state reporting so the frontend now carries richer diagnostics snapshots with:
  - loading
  - buffering
  - retrying
  - failed
  - recovered
  - failure-class hint
  - muted/audio status
- updated operator-facing playback surfaces:
  - single-view watch page now shows clearer playback summaries and likely issue class
  - multiview tiles and focused-tile panel now show clearer live/retrying/failed/recovered state plus mute/focus context
  - admin channels page now includes a real runtime diagnostics panel for the selected channel
  - admin EPG sources page now includes a real XMLTV diagnostics panel for the selected source
- added targeted backend and frontend tests for:
  - diagnostics service aggregation
  - diagnostics route responses
  - stream and EPG failure classification
  - playback diagnostics mapping

### Files Added Or Changed

- backend observability and diagnostics:
  - `packages/shared/src/index.ts`
  - `apps/api/src/app/structured-log.ts`
  - `apps/api/src/modules/diagnostics/*`
  - `apps/api/src/modules/streams/stream-diagnostics.ts`
  - `apps/api/src/modules/epg/epg-diagnostics.ts`
- backend integrations:
  - `apps/api/src/app/build-server.ts`
  - `apps/api/src/modules/auth/auth.routes.ts`
  - `apps/api/src/modules/channels/channel.routes.ts`
  - `apps/api/src/modules/epg/epg.routes.ts`
  - `apps/api/src/modules/epg/epg.service.ts`
  - `apps/api/src/modules/epg/xmltv-parser.ts`
  - `apps/api/src/modules/streams/playlist-parser.ts`
  - `apps/api/src/modules/streams/stream.routes.ts`
  - `apps/api/src/modules/streams/stream.service.ts`
  - `apps/api/src/modules/streams/synthetic-master.ts`
- frontend diagnostics surfaces:
  - `apps/web/src/player/playback-diagnostics.ts`
  - `apps/web/src/player/hls-player.tsx`
  - `apps/web/src/player/multiview-tile-card.tsx`
  - `apps/web/src/pages/channel-watch-page.tsx`
  - `apps/web/src/pages/multiview-page.tsx`
  - `apps/web/src/pages/admin-channels-page.tsx`
  - `apps/web/src/pages/admin-epg-sources-page.tsx`
  - `apps/web/src/components/channels/channel-diagnostics-panel.tsx`
  - `apps/web/src/components/epg/epg-source-diagnostics-panel.tsx`
  - `apps/web/src/services/api.ts`
  - `apps/web/src/types/api.ts`
- tests:
  - `apps/api/src/modules/diagnostics/diagnostic.service.test.ts`
  - `apps/api/src/modules/diagnostics/diagnostic.routes.test.ts`
  - `apps/api/src/modules/streams/stream-diagnostics.test.ts`
  - `apps/api/src/modules/epg/epg-diagnostics.test.ts`
  - `apps/web/src/player/playback-diagnostics.test.ts`
  - updated player/tile recovery tests
- docs:
  - `docs/architecture/api-boundaries.md`
  - `docs/architecture/player-architecture.md`
  - `docs/architecture/testing-strategy.md`
  - `docs/standards/backend-api-standards.md`
  - `docs/standards/player-hls-standards.md`
  - `docs/standards/testing-standards.md`
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- Kept diagnostics runtime-only and in-memory for this phase so the platform gains real operational visibility without forcing a schema migration or speculative monitoring stack.
- Added a dedicated `diagnostics` backend module instead of burying admin inspection routes inside `channels` or `epg`, because the capability is cross-cutting and architecture-wide.
- Used structured event logging with sanitized fields and stable event names instead of noisy raw request/body logging.
- Kept deeper technical details primarily in admin diagnostics panels while making viewer/operator playback surfaces cleaner and faster to scan.

### Verification Run

- `npm run lint -w apps/api`
- `npm run test -w apps/api`
- `npm run lint -w apps/web`
- `npm run test -w apps/web`
- `npm run lint`
- `npm run test`
- `npm run build`

### Remaining Risk

- Diagnostics history is not durable yet; it resets on process restart and is not queryable across multiple app instances.
- There is still no background channel probe scheduler or durable alerting pipeline; observations are captured from real usage paths and admin inspection flows only.
- Proxy asset delivery still buffers responses in memory rather than streaming passthrough.
- The player chunk warning remains after build; observability work did not change that existing bundling issue.

### Exact Suggested Next Task

Add a small durable diagnostics persistence layer and scheduled channel health probes so TV-Dash can retain last-known failures across restarts and detect broken channels before an operator opens them.

## `2026-04-03T03:10:00+03:00`

### Objective

Fix the multiview playback lifecycle bug where transferring audio focus between tiles briefly disconnected both streams and showed manifest-loading states.

### Work Completed

- created the requested working branch `009-fix-multiview-audio-handoff-without-stream-reload`
- traced the reload to `apps/web/src/player/hls-player.tsx`, where the source-setup effect depended on `initialBias`
- confirmed multiview audio handoff was flipping `initialBias` between `AUTO` and `LOWEST`, which caused the player to tear down HLS, detach the video, and request the manifest again even though `src` had not changed
- decoupled control-state sync from playback-session setup:
  - `HlsPlayer` now rebuilds playback only when `src` changes or the operator explicitly retries
  - mute state, preferred quality, and startup bias now update without recreating the HLS instance
  - manifest-level startup quality still respects the latest bias/preferred-quality state when a real source load happens
- removed the `key={`${tileIndex}:${tile.channelId ?? "empty"}`}` remount trigger from `MultiviewTileCard` so same-source metadata/focus changes do not force a React remount of `HlsPlayer`
- added regression coverage for:
  - multiview mute/unmute handoff not recreating playback or reloading the source
  - multiview tile focus/metadata changes not remounting the player when `src` is unchanged
- verified the full `apps/web` lint, test, and build workflows after the fix

### Files Added Or Changed

- player lifecycle and multiview boundary:
  - `apps/web/src/player/hls-player.tsx`
  - `apps/web/src/player/multiview-tile-card.tsx`
- regression tests:
  - `apps/web/src/player/hls-player.test.tsx`
  - `apps/web/src/player/multiview-tile-card.test.tsx`
- docs:
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- The fix stayed at the real lifecycle seam instead of adding UI-only masking:
  - audio ownership remains a mute/unmute handoff
  - source teardown remains reserved for true source changes or explicit retry
- `initialBias` is still honored for genuine startup behavior, but it no longer participates in the source-effect dependency list.
- Removing the tile-card `HlsPlayer` key keeps playback identity aligned with `src`, not incidental channel/tile metadata.

### Verification Run

- `npm run test -w apps/web -- hls-player.test.tsx multiview-tile-card.test.tsx`
- `npm run lint -w apps/web`
- `npm run test -w apps/web`
- `npm run build -w apps/web`

### Remaining Risk

- This fix intentionally does not change drag-swap behavior; swapping two tiles still moves real sources across tile positions, so those slots still reload as part of a true source change.
- Route-level React coverage for the full multiview page is still missing; the new regression tests cover the player and tile seams directly.

### Exact Suggested Next Task

Add route-level multiview page coverage for audio-owner reassignment, tile replacement, and saved-layout application so the critical player seam and the page orchestration layer are both protected.

## `2026-04-03T02:42:00+03:00`

### Objective

Improve the admin UX for manual channel quality variant entry so repeated ingest work feels compact, faster, and less error-prone without changing the core master-vs-manual feature behavior.

### Work Completed

- created the requested working branch `008-improve-manual-quality-variant-admin-ux`
- extracted channel admin form state and validation helpers into a pure module so manual-variant behavior can be tested independently from the JSX form shell
- rebuilt the manual-variant editor into a compact operational row layout with:
  - denser field sizing
  - better alignment
  - a table-like desktop header
  - row-level action buttons for move, duplicate, and remove
  - section summary pills for mode, row count, active count, and validation state
- added faster admin helpers for repeated entry:
  - preset row buttons for `1080p`, `720p`, `480p`
  - quick `low/medium/high` ladder insertion
  - duplicate-row behavior that copies metadata but clears the URL to avoid an immediate duplicate URL failure
  - explicit auto-sort for known qualities that normalizes labels and re-numbers sort order low-to-high
- added safe assist behavior for manual rows:
  - normalize label synonyms such as `720`, `FULL HD`, `med`, and `hi`
  - infer blank labels from URL patterns like `720`, `1080`, `low`, `medium`, or `high`
  - infer blank labels from entered resolution metadata where possible
  - prefill safe width/height/bandwidth defaults for known labels when those fields are blank
- improved manual validation UX:
  - row-level inline status chips for ready/incomplete/error state
  - clearer messages for missing or invalid playlist URLs
  - inline duplicate-label and duplicate-sort-order feedback before save
  - save mutation now validates the form client-side before the API request is sent
  - direct manual playback with custom upstream headers/referrer now shows a focused warning about proxy mode requirements
- added frontend regression coverage for:
  - preset-row insertion
  - duplicate-row behavior
  - auto-sort behavior
  - label normalization and URL/metadata inference helpers
  - duplicate validation feedback
  - final payload correctness for normalized manual variants

### Files Added Or Changed

- admin form UX and helpers:
  - `apps/web/src/components/channels/channel-admin-form.tsx`
  - `apps/web/src/components/channels/channel-admin-form-state.ts`
  - `apps/web/src/components/channels/channel-manual-variants.ts`
  - `apps/web/src/components/channels/channel-manual-variants-editor.tsx`
  - `apps/web/src/pages/admin-channels-page.tsx`
- tests:
  - `apps/web/src/components/channels/channel-admin-form.test.tsx`
  - `apps/web/src/components/channels/channel-admin-form-state.test.ts`
  - `apps/web/src/components/channels/channel-manual-variants.test.ts`
- docs:
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- The form stayed inside the existing admin page, but the new branch-heavy behavior was extracted into dedicated state/helper modules so the large page file did not absorb more manual-variant policy.
- Smart behavior stays explicit and safe:
  - only blank labels are inferred
  - only blank metadata fields are autofilled
  - sort-order automation is explicit through an `Auto-sort` action instead of hidden background reordering
- Duplicate-row behavior intentionally clears the URL while keeping the label and metadata shape so operators can branch one row into another without creating an immediate duplicate URL conflict.
- Validation remains schema-backed through `channelInputSchema`, but common operator mistakes now map to clearer frontend wording before the request is submitted.

### Verification Run

- `npm run lint -w apps/web`
- `npm run test -w apps/web`
- `npm run build -w apps/web`

### Remaining Risk

- The manual-variant editor is much faster now, but ordering is still button-driven rather than drag-and-drop for larger ladders.
- There is still no unsaved synthetic master preview; operators can see row order and metadata state, but not the final manifest text before first save.
- Route-level coverage for the full admin channels page is still missing; the new coverage focuses on the extracted helper and form seams instead.

### Exact Suggested Next Task

Add either a lightweight unsaved synthetic master preview or a bulk-paste/manual-import parser for quality rows, then decide whether drag-and-drop ordering is worth the extra complexity compared with the current compact button-driven workflow.

## `2026-04-03T00:57:40+03:00`

### Objective

Add flexible channel ingest so TV-Dash can treat both real master playlists and manually entered quality variants as one logical channel with selectable qualities.

### Work Completed

- created the requested working branch `007-channel-ingest-master-or-manual-quality-variants`
- extended shared channel contracts and Prisma schema with:
  - `sourceMode`
  - `ChannelQualityVariant`
  - mode-aware validation for master-playlist vs manual-variant payloads
- added backend persistence and mapping for manual quality variants while preserving existing logical-channel CRUD
- implemented real synthetic master playlist generation for manual-variant channels at:
  - `GET /api/streams/channels/:channelId/master`
- updated stream behavior so:
  - real master channels continue working as before
  - manual-variant channels return one generated manifest
  - proxy mode rewrites manual variant URLs to signed proxy asset paths
  - direct mode leaves manual variant URLs upstream-facing after the synthetic master is generated
- updated player-facing playback URL selection so manual-variant channels always resolve through the backend master path
- updated quality option labeling so HLS level names from generated manifests can surface cleaner labels in the UI
- reworked the admin channel form so operators can:
  - choose source mode explicitly
  - enter one real master playlist URL
  - or add, remove, and reorder manual quality rows with optional metadata
- updated admin stream testing and preview behavior:
  - master mode tests the upstream master
  - manual mode tests each active variant playlist
  - saved manual-variant channels preview through the generated synthetic master
- added backend and frontend coverage for:
  - schema validation
  - synthetic master generation
  - stream routing for manual variants
  - admin form mode switching
  - payload building for both ingest modes
  - playback URL selection for manual-variant channels

### Files Added Or Changed

- shared contracts and database:
  - `packages/shared/src/index.ts`
  - `apps/api/prisma/schema.prisma`
  - `apps/api/prisma/migrations/202604030001_channel_manual_variants/migration.sql`
  - `apps/api/prisma/seed.ts`
- backend channel/stream implementation:
  - `apps/api/src/modules/channels/*`
  - `apps/api/src/modules/streams/stream.service.ts`
  - `apps/api/src/modules/streams/synthetic-master.ts`
- frontend admin/player integration:
  - `apps/web/src/components/channels/channel-admin-form.tsx`
  - `apps/web/src/pages/admin-channels-page.tsx`
  - `apps/web/src/services/api.ts`
  - `apps/web/src/types/api.ts`
  - `apps/web/src/player/quality-options.ts`
- tests:
  - `apps/api/src/modules/channels/channel-input.test.ts`
  - `apps/api/src/modules/channels/channel.routes.test.ts`
  - `apps/api/src/modules/streams/stream.routes.test.ts`
  - `apps/api/src/modules/streams/synthetic-master.test.ts`
  - `apps/web/src/components/channels/channel-admin-form.test.ts`
  - `apps/web/src/components/channels/channel-admin-form-fields.test.tsx`
  - `apps/web/src/services/api.test.ts`
  - `apps/web/src/player/quality-options.test.ts`
- docs:
  - `docs/architecture/player-architecture.md`
  - `docs/architecture/api-boundaries.md`
  - `docs/architecture/testing-strategy.md`
  - `docs/standards/player-hls-standards.md`
  - `docs/standards/prisma-database-standards.md`
  - `docs/standards/testing-standards.md`
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- The cleanest seam for manual variants was the existing backend master-playlist endpoint, not a player-side special case.
- Manual variants stay one logical channel by generating a real HLS master playlist instead of exposing one channel row per quality.
- Synthetic master metadata uses explicit admin values first, then predictable fallbacks derived from labels like `low`, `medium`, `high`, and `720p`.
- Manual-variant playback still respects `DIRECT` vs `PROXY` mode:
  - `DIRECT` only synthesizes the top-level master
  - `PROXY` owns variant and segment fetching too
- New unsaved manual-variant channels are not previewable yet because the synthetic master is generated from persisted channel data on the server.

### Verification Run

- `npm run db:generate -w apps/api`
- `npm run lint -w apps/api`
- `npm run lint -w apps/web`
- `npm run test -w apps/api`
- `npm run test -w apps/web`

### Remaining Risk

- Direct manual-variant playback still depends on browser access to each upstream variant playlist and segment URL; operators must choose proxy mode when providers require custom headers or referrer handling.
- Synthetic master fallback metadata is intentionally conservative; some providers may still benefit from more precise bandwidth/resolution data to improve automatic adaptation decisions.
- New unsaved manual-variant channels cannot be previewed until after the first save.

### Exact Suggested Next Task

Add a small operator assist layer for manual variants: prefill common low/medium/high or resolution ladders, warn when direct mode is combined with custom upstream headers, and add route-level React coverage for the full admin channel workflow.

## `2026-04-02T23:27:35+03:00`

### Objective

Correct the oversized operator UI pass by reducing wasted margins, oversized controls, and chrome-heavy viewer layouts so TV-Dash behaves more like a live monitoring console.

### Work Completed

- created the requested working branch `006-fix-operator-ux-density-and-screen-usage`
- tightened shared operator UI density by:
  - shrinking shared button, badge, input, select, panel, and page-header sizing
  - narrowing the desktop app shell and reducing outer gutters while widening the usable workspace
  - making the desktop navigation rail smaller and sticky to free more horizontal space for content
- reworked the single-view watch page to be more video-first:
  - larger viewport-height player area
  - compact sticky side rail instead of a roomy secondary column
  - tighter playback, guide, and metadata panels
- reworked multiview to use screen space more efficiently:
  - wall moved higher on the page
  - focused-tile details and saved layouts moved into a narrow right rail
  - tile chrome compressed substantially so the stream remains dominant
  - tile controls now lean icon-first where repeated operator actions are obvious
- tightened browse/dashboard density with:
  - smaller filter controls
  - denser favorites strip
  - more aggressive large-screen channel grid usage
- tightened channel picker and guide cards so supporting UI no longer feels oversized beside the playback surfaces
- kept playback behavior unchanged while compacting `HlsPlayer` overlays and retry/error chrome

### Files Added Or Changed

- shared density and layout primitives:
  - `apps/web/src/components/ui/button.tsx`
  - `apps/web/src/components/ui/input.tsx`
  - `apps/web/src/components/ui/select.tsx`
  - `apps/web/src/components/ui/badge.tsx`
  - `apps/web/src/components/ui/panel.tsx`
  - `apps/web/src/components/layout/page-header.tsx`
  - `apps/web/src/components/layout/app-shell.tsx`
- operator-facing pages and supporting UI:
  - `apps/web/src/pages/channel-watch-page.tsx`
  - `apps/web/src/pages/multiview-page.tsx`
  - `apps/web/src/pages/dashboard-page.tsx`
  - `apps/web/src/components/channels/channel-card.tsx`
  - `apps/web/src/components/channels/channel-guide-card.tsx`
  - `apps/web/src/components/channels/channel-picker-dialog.tsx`
  - `apps/web/src/player/multiview-tile-card.tsx`
  - `apps/web/src/player/hls-player.tsx`
- docs:
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- The fastest way to correct the oversized feel was to tighten shared primitives first so the whole operator surface could converge on one density strategy.
- Viewer and multiview screens now explicitly prioritize stream area over decorative framing or large action clusters.
- Multiview keeps the same workflows from the previous milestone, but secondary information now lives in a compact right rail instead of pushing the live wall lower on the page.
- Icon-first controls are acceptable inside multiview tiles because those actions are repeated constantly and already have surrounding context.

### Verification Run

- `npm run lint -w apps/web`
- `npm run test -w apps/web`
- `npm run build -w apps/web`

### Remaining Risk

- There is still no route-level React coverage for the full watch and multiview pages, so the density/layout changes rely on manual structural review plus the existing helper/component tests.
- Admin screens still use the older roomier layout language in places and have not yet received the same density correction pass.
- The player chunk warning remains unchanged.

### Exact Suggested Next Task

Apply the same compact operator density system to the admin pages, then add route-level React coverage for the watch and multiview pages so future UX corrections can move faster with less regression risk.

---

## `2026-04-02T22:52:22+03:00`

### Objective

Improve operator UX, multiview workflows, and guide presentation so TV-Dash feels meaningfully faster and clearer for day-to-day monitoring work.

### Work Completed

- created the requested working branch `006-operator-ux-polish-and-guide-experience`
- reworked multiview around a focused-tile operator workflow with:
  - drag-to-swap tile reassignment
  - searchable tile replacement via a channel picker dialog
  - clearer focused, muted, loading, retrying, failed, and picker-selected tile treatment
  - a focused-tile side panel with now/next context and status detail
  - practical keyboard shortcuts for tile focus, audio ownership, picker open, fullscreen, clear, and layout switching
- improved saved layout ergonomics by separating:
  - `Save as new`
  - `Update selected`
  - `Load saved layout`
  - `Delete`
- improved guide presentation by surfacing resilient now/next context in:
  - dashboard channel cards
  - multiview tile cards and focused-tile panel
  - single-view now/next panel
- added a searchable quick channel switcher to single-view plus `Ctrl/Cmd + K`
- tightened shared UI support by forwarding refs through the shared `Input` component for picker focus management
- added frontend regression coverage for guide-state logic, picker search/selection behavior, multiview shortcut helpers, and tile swap metadata behavior

### Files Added Or Changed

- frontend operator workflow and guide UX:
  - `apps/web/src/pages/dashboard-page.tsx`
  - `apps/web/src/pages/channel-watch-page.tsx`
  - `apps/web/src/pages/multiview-page.tsx`
  - `apps/web/src/components/channels/channel-card.tsx`
  - `apps/web/src/components/channels/channel-guide-card.tsx`
  - `apps/web/src/components/channels/channel-guide-state.ts`
  - `apps/web/src/components/channels/channel-picker-dialog.tsx`
  - `apps/web/src/player/multiview-tile-card.tsx`
  - `apps/web/src/player/multiview-shortcuts.ts`
  - `apps/web/src/player/multiview-state.ts`
  - `apps/web/src/lib/keyboard.ts`
  - `apps/web/src/components/ui/input.tsx`
- tests:
  - `apps/web/src/components/channels/channel-guide-state.test.ts`
  - `apps/web/src/components/channels/channel-picker-dialog.test.tsx`
  - `apps/web/src/player/multiview-shortcuts.test.ts`
  - `apps/web/src/player/multiview-state.test.ts`
- docs:
  - `docs/architecture/player-architecture.md`
  - `docs/architecture/testing-strategy.md`
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- The cleanest reassign workflow for the current codebase is native drag-to-swap plus focused-tile quick replace, not a heavier drag-and-drop framework.
- Multi-view hotkeys stay intentionally small and page-local instead of growing into a global command system.
- Guide UI must stay useful when XMLTV is missing or temporarily unavailable, so every surface now renders deliberate fallback copy instead of blank space.
- Playback URL selection still belongs in the page/service seam; player-facing tile UI receives a final `src` instead of deciding proxy vs direct mode itself.

### Verification Run

- `npm run lint -w apps/web`
- `npm run test -w apps/web`

### Remaining Risk

- Full route-level React coverage for the multiview page still does not exist; the new tests focus on the most reusable workflow seams rather than the whole page orchestrator.
- Guide freshness still depends on on-demand XMLTV source reads and process-local caching.
- Keyboard support improves focus and assignment speed, but tile reordering is still mouse-first.

### Exact Suggested Next Task

Add route-level React coverage for multiview drag/swap and keyboard flows, then build a background XMLTV ingestion/cache layer so guide context is faster and more reliable across the dashboard and wall views.

---

## `2026-04-02T22:29:00+03:00`

### Objective

Add a real stream proxy/gateway foundation, support upstream request configuration, and lay the first production-ready XMLTV/EPG groundwork without destabilizing the current MVP.

### Work Completed

- created the requested working branch `005-stream-proxy-and-epg-foundation`
- extended the shared contracts and Prisma schema to support:
  - channel playback mode
  - upstream user-agent/referrer/header configuration
  - EPG source configuration
  - channel-to-EPG mapping
- added a stream proxy foundation with:
  - `/api/streams/channels/:channelId/master`
  - `/api/streams/channels/:channelId/asset?token=...`
  - upstream request header/referrer/user-agent application
  - playlist rewriting for nested playlists, keys, and segments
  - short-lived signed asset tokens
- added an `epg` backend module with:
  - EPG source CRUD
  - XMLTV preview endpoint
  - on-demand XMLTV fetch and in-memory cache
  - now/next lookup endpoint
- updated public/admin channel mapping so proxy-mode channels hide raw upstream URLs from public responses while admin config endpoints still expose them
- extended the admin channel UI for playback mode, upstream request configuration, and EPG mapping
- added a dedicated admin EPG source page with XMLTV preview
- updated single-view and multi-view playback to use proxy-aware playback URL resolution
- added migration, seed updates, backend tests, and frontend helper tests for the new platform foundation

### Files Added Or Changed

- shared/API contracts:
  - `packages/shared/src/index.ts`
  - `apps/web/src/types/api.ts`
  - `apps/web/src/services/api.ts`
- database:
  - `apps/api/prisma/schema.prisma`
  - `apps/api/prisma/migrations/202604020002_stream_proxy_and_epg_foundation/migration.sql`
  - `apps/api/prisma/seed.ts`
- backend proxy/epg foundation:
  - `apps/api/src/app/upstream-request.ts`
  - `apps/api/src/modules/channels/*`
  - `apps/api/src/modules/streams/*`
  - `apps/api/src/modules/epg/*`
  - `apps/api/src/app/build-server.ts`
- frontend admin/playback integration:
  - `apps/web/src/components/channels/channel-admin-form.tsx`
  - `apps/web/src/pages/admin-channels-page.tsx`
  - `apps/web/src/pages/admin-epg-sources-page.tsx`
  - `apps/web/src/pages/channel-watch-page.tsx`
  - `apps/web/src/pages/multiview-page.tsx`
  - `apps/web/src/app/router.tsx`
  - `apps/web/src/components/layout/app-shell.tsx`
- tests:
  - `apps/api/src/modules/channels/channel.routes.test.ts`
  - `apps/api/src/modules/streams/playlist-rewrite.test.ts`
  - `apps/api/src/modules/streams/proxy-token.test.ts`
  - `apps/api/src/modules/streams/stream.routes.test.ts`
  - `apps/api/src/modules/epg/xmltv-parser.test.ts`
  - `apps/api/src/modules/epg/epg.routes.test.ts`
  - `apps/web/src/components/channels/channel-admin-form.test.ts`
  - `apps/web/src/services/api.test.ts`
- docs:
  - `docs/architecture/player-architecture.md`
  - `docs/architecture/api-boundaries.md`
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- Proxy mode is now a real channel-level contract, not a UI-only flag.
- Public channel payloads intentionally hide `masterHlsUrl` when proxy mode is enabled.
- Stream proxy asset URLs are signed and short-lived to avoid exposing arbitrary upstream fetching.
- Upstream request headers are normalized in one shared helper and reused by both streams and XMLTV fetching.
- XMLTV support is intentionally phased:
  - source config and channel mapping are first-class now
  - now/next works from on-demand fetch plus in-memory cache
  - durable programme ingestion remains future work

### Verification Run

- `npm run lint -w apps/api`
- `npm run test -w apps/api`
- `npm run lint -w apps/web`
- `npm run test -w apps/web`

### Remaining Risk

- The proxy foundation still buffers upstream asset bodies in memory instead of true streaming passthrough.
- XMLTV data is not persisted yet; guide lookups still depend on on-demand upstream access and process-local cache.
- Frontend route-level tests for admin channel and EPG workflows are still missing.
- Full database-backed integration coverage for the new backend modules is still missing.

### Exact Suggested Next Task

Implement true streaming passthrough for proxied HLS assets, then add a background XMLTV ingestion/cache pipeline so now/next and future guide screens do not depend on live upstream fetches.

---

## `2026-04-02T21:45:25+03:00`

### Objective

Harden playback reliability, stabilize multi-view lifecycle behavior, tighten touched API contract validation, and add regression coverage for the most failure-prone paths.

### Work Completed

- created the requested working branch `004-hardening-playback-multiview-and-tests`
- hardened `HlsPlayer` retry handling with bounded network reconnects, single media recovery, clearer buffering/retrying/error states, and stale-timer cleanup on source replacement
- normalized quality option handling to drop malformed levels, deduplicate identical variants, and support explicit highest/lowest resolution requests safely
- added multiview state helpers for layout serialization, hydration, tile-channel replacement, and pruning tile-scoped UI state when layouts shrink
- updated the multiview page to reset stale per-tile quality metadata on channel changes, persist focused-tile state, surface tile playback status more clearly, and key player instances safely by tile/source
- tightened touched API routes with route-edge validation for ids and channel list filters plus deliberate `404`/`409` mappings for common Prisma write failures
- added Fastify inject regression tests for channel/group/favorite/layout/stream contract behavior and jsdom component tests for HlsPlayer retry/cleanup behavior
- updated player/testing architecture docs and the handoff summary to reflect the new hardening rules

### Files Added Or Changed

- frontend player hardening:
  - `apps/web/src/player/hls-player.tsx`
  - `apps/web/src/player/playback-recovery.ts`
  - `apps/web/src/player/quality-options.ts`
  - `apps/web/src/player/multiview-layout.ts`
  - `apps/web/src/player/multiview-state.ts`
  - `apps/web/src/pages/channel-watch-page.tsx`
  - `apps/web/src/pages/multiview-page.tsx`
- frontend regression tests:
  - `apps/web/src/player/*.test.ts[x]`
  - `apps/web/src/test/setup.ts`
  - `apps/web/vite.config.ts`
- backend validation and tests:
  - `apps/api/src/app/prisma-errors.ts`
  - `apps/api/src/app/request-schemas.ts`
  - `apps/api/src/app/test-support.ts`
  - `apps/api/src/modules/*/*.routes.ts`
  - `apps/api/src/modules/*/*.routes.test.ts`
- docs:
  - `docs/architecture/player-architecture.md`
  - `docs/architecture/testing-strategy.md`
  - `docs/standards/player-hls-standards.md`
  - `docs/handoff/codex-handoff.md`
  - `docs/handoff/codex-session-log.md`

### Key Decisions

- TV-Dash now uses a bounded fatal recovery policy of `3` network retries and `1` media recovery attempt before surfacing a retry UI.
- Multi-view source changes reset background-tile quality bias back to `LOWEST` unless the operator explicitly reselects a manual level.
- Saved layout config now intentionally stores focused-tile metadata alongside active audio ownership so operational context survives layout saves.
- Touched CRUD routes now validate ids/query parameters at the route edge instead of copying legacy casts forward.

### Verification Run

- `npm run lint -w apps/web`
- `npm run test -w apps/web`
- `npm run lint -w apps/api`
- `npm run test -w apps/api`

### Remaining Risk

- Full database-backed CRUD integration coverage is still missing; the new API tests validate contracts with mocked persistence, not real Prisma/database behavior.
- Route-level UI regression coverage for favorites toggling and saved-layout application is still missing.
- The player bundle warning remains; lazy loading is still the next performance-focused frontend task.

### Exact Suggested Next Task

Add isolated database-backed Fastify integration tests for auth/channels/groups/favorites/layouts, then add route-level React tests for saved-layout application and favorites toggling so the most important operator flows are covered end-to-end at the page boundary.

---

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

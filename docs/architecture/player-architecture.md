# TV-Dash Player Architecture

## Ownership Boundary

All player-specific behavior belongs in `apps/web/src/player`.

That includes:

- HLS.js integration
- quality option derivation
- preferred quality resolution
- tile defaulting and layout helpers
- multi-view audio ownership rules
- reconnect and retry policy

That does not belong in:

- `pages/` route files
- generic UI components under `components/ui`
- request clients under `services/`

## Current Modules

- `player/hls-player.tsx`
  - React wrapper around one `<video>` element and one HLS.js instance
- `player/quality-options.ts`
  - converts manifest levels into UI options and resolves manual/auto selection
- `player/playback-recovery.ts`
  - classifies fatal HLS failures into bounded retry, media recovery, or terminal error states
- `player/layouts.ts`
  - static supported layout definitions
- `player/multiview-layout.ts`
  - tile defaults, resize policy, and single-audio enforcement
- `player/multiview-state.ts`
  - multiview layout serialization, hydration, and per-tile state reset helpers
- `player/multiview-shortcuts.ts`
  - focused-tile keyboard navigation and layout shortcut helpers
- `player/multiview-tile-card.tsx`
  - player-facing multiview tile chrome, drag/swap affordances, and quick tile actions around `HlsPlayer`

## HLS.js Integration Rules

- Create one HLS.js instance per tile/player component.
- Destroy the HLS.js instance on unmount and before source replacement.
- Attach event listeners inside the player boundary only.
- Do not manipulate HLS.js objects directly from pages.

## Quality Switching Rules

- TV-Dash stores one master playlist URL per logical channel.
- Quality options are derived at runtime from manifest levels.
- `AUTO` must always remain available.
- Manual selection is resolved through player helpers, not inline page logic.
- `LOWEST` is an internal startup bias for background tiles, not a duplicated channel record.

## State Ownership Rules

- Route pages own page orchestration and persistence payload assembly.
- Frontend service helpers may choose the playback URL contract (`DIRECT` upstream URL vs `PROXY` gateway path), but they do not own HLS lifecycle behavior.
- `HlsPlayer` owns playback lifecycle and emits status/quality callbacks upward.
- Multi-view pages own which tile is focused, reassigned, saved, or displayed.
- Player-facing multiview UI components may live under `player/` when they wrap `HlsPlayer`, but pages still resolve playback URLs and persistence decisions.
- Shared quality and tile decision logic lives in pure player helpers.

## Playback URL Selection Rules

- Public channel payloads may intentionally omit `masterHlsUrl` when `playbackMode` is `PROXY`.
- Page code should resolve playback URLs through a small service/helper seam rather than hard-coding `/api/streams/...` paths inline.
- The player should receive a final URL or `null`; it should not know how channel proxy mode is decided.
- Admin-only flows may still use the raw upstream URL for diagnostics and preview/testing.

## Tile Lifecycle Rules

- Each tile has isolated video state.
- Changing a tile source destroys the previous HLS instance before loading the next one.
- Cleanup must remove:
  - HLS.js instance
  - reconnect timers
  - DOM event listeners

## Retry and Reconnect Policy

- fatal network errors trigger up to `3` bounded reconnect attempts at escalating delays
- fatal media errors trigger one explicit `recoverMediaError()` attempt before surfacing failure
- unrecoverable failures surface a retry UI
- successful recovery clears retry counters and publishes a visible recovered state

Do not add silent infinite retry loops. Any retry policy change must consider multi-view bandwidth pressure.

## Autoplay and Mute Policy

- single-view playback may request unmuted autoplay, but browser policy can still block audio
- multi-view defaults keep only the first tile unmuted
- selecting another active audio tile must mute all others
- when a muted/background tile changes source, its preferred quality should reset to low-bias startup behavior unless the operator explicitly selects another manual level

## Multi-View Scaling Policy

- supported layouts are defined centrally in `player/layouts.ts`
- tile counts come from layout definitions, not inline page conditionals
- background tiles should prefer lower startup quality where possible
- saved layout hydration should restore tile order and focus state without leaking stale per-tile quality metadata
- tile swapping or reassignment must move tile-scoped status and quality metadata together so operator context stays coherent
- focused-tile keyboard shortcuts should stay intentionally small and operator-oriented rather than becoming a global hotkey subsystem
- any layout above current supported sizes must be evaluated for:
  - CPU/GPU impact
  - network concurrency
  - autoplay behavior
  - audio ownership rules

## Performance Safeguards

- keep one player instance per tile only
- avoid duplicate polling or stream metadata fetches per render
- prefer pure helpers for layout/quality decisions to keep renders predictable
- route-level lazy loading remains a recommended next step because the player chunk is currently large

## Extension Checklist

Before extending player behavior:

1. Decide whether the change is playback, tile orchestration, or UI only.
2. Add or update pure helper coverage first when logic is branchy.
3. Update `testing-strategy.md` or this file if player policy changed.
4. Verify single-view and multi-view behavior before release.

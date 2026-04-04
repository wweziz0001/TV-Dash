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
  - React wrapper around one `<video>` element, one HLS.js instance, explicit in-player controls, and browser media API integration
- `player/browser-media.ts`
  - browser capability detection plus live-DVR/seek helpers for PiP, fullscreen, and clamped local seek actions
- `player/media-session.ts`
  - Media Session metadata/action wiring for browser and system media controls
- `player/player-control-overlay.tsx`
  - compact overlay controls for play/pause, mute, volume, browser PiP, fullscreen, and live-DVR seek actions
- `player/quality-options.ts`
  - converts manifest levels into UI options and resolves manual/auto selection
- `player/playback-recovery.ts`
  - classifies fatal HLS failures into bounded retry, media recovery, or terminal error states
- `player/playback-diagnostics.ts`
  - maps raw player lifecycle state into operator-facing labels, summaries, and failure-class hints
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

- TV-Dash stores one logical playback source per channel, backed by either:
  - one real master playlist URL
  - or manual variant playlists that the backend exposes as a synthetic master playlist
- Quality options are derived at runtime from manifest levels.
- `AUTO` must always remain available.
- Manual selection is resolved through player helpers, not inline page logic.
- `LOWEST` is an internal startup bias for background tiles, not a duplicated channel record.

## State Ownership Rules

- Route pages own page orchestration and persistence payload assembly.
- Frontend service helpers may choose the playback URL contract (`DIRECT` upstream URL vs `PROXY` gateway path), but they do not own HLS lifecycle behavior.
- Frontend service helpers may choose the playback URL contract (`DIRECT` upstream URL vs `PROXY` gateway path vs `SHARED` local-origin path), but they do not own HLS lifecycle behavior.
- `HlsPlayer` owns playback lifecycle, explicit player controls, browser media API integration, and emits status, diagnostics, mute, and quality callbacks upward.
- Multi-view pages own which tile is focused, reassigned, saved, or displayed.
- Player-facing multiview UI components may live under `player/` when they wrap `HlsPlayer`, but pages still resolve playback URLs and persistence decisions.
- Shared quality and tile decision logic lives in pure player helpers.
- Route pages may store player diagnostics snapshots for operator-facing status panels, but they must not recreate HLS recovery logic themselves.

## Playback URL Selection Rules

- Public channel payloads may intentionally omit `masterHlsUrl` when `playbackMode` is `PROXY`.
- Public channel payloads may intentionally omit `masterHlsUrl` when `playbackMode` is `PROXY` or `SHARED`.
- Manual-variant channels should resolve playback through the backend stream path so HLS.js receives the generated synthetic master playlist.
- Shared-delivery channels should resolve playback through the backend shared master path so multiple local viewers can reuse one channel-local cache/session where possible.
- Page code should resolve playback URLs through a small service/helper seam rather than hard-coding `/api/streams/...` paths inline.
- Timeshift-enabled TV-Dash-managed channels should resolve playback through the backend timeshift master path so the player is attached to the retained DVR manifest instead of the upstream live edge.
- The player should receive a final URL or `null`; it should not know how channel proxy mode is decided.
- The player should receive a final URL or `null`; it should not know how channel delivery mode is decided.
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
- fatal failure classification should stay bounded to practical buckets such as:
  - `network`
  - `playlist-fetch`
  - `invalid-playlist`
  - `media-playback`
  - `unsupported-stream`

Do not add silent infinite retry loops. Any retry policy change must consider multi-view bandwidth pressure.

## Autoplay and Mute Policy

- single-view playback may request unmuted autoplay, but browser policy can still block audio
- multi-view defaults keep only the first tile unmuted
- selecting another active audio tile must mute all others
- when a muted/background tile changes source, its preferred quality should reset to low-bias startup behavior unless the operator explicitly selects another manual level

## Multi-View Scaling Policy

- supported layouts are defined centrally in `player/layouts.ts`
- tile counts come from layout definitions, not inline page conditionals
- device-aware layout availability is now explicit:
  - mobile phones only expose `1x1` and `1+2`
  - tablets cap multi-view at `2x2`
  - desktops can use `1+4`
  - large-screen / TV-like viewports unlock `3x3`
- background tiles should prefer lower startup quality where possible
- saved layout hydration should restore tile order and focus state without leaking stale per-tile quality metadata
- tile swapping or reassignment must move tile-scoped status and quality metadata together so operator context stays coherent
- focused-tile keyboard shortcuts should stay intentionally small and operator-oriented rather than becoming a global hotkey subsystem
- touch-first devices may intentionally disable drag-swap affordances when replacement, focus, and saved-layout flows are the more reliable interaction model
- any layout above current supported sizes must be evaluated for:
  - CPU/GPU impact
  - network concurrency
  - autoplay behavior
  - audio ownership rules

## Fullscreen And Focus Policy

- single-view fullscreen should target the player frame, not trigger a navigation reset
- multi-view tile fullscreen should keep the same focused tile before and after exiting fullscreen
- fullscreen must preserve current diagnostics, mute state, and selected quality instead of rebuilding playback purely for presentation
- immersive playback controls must stay available through explicit buttons or stable keyboard shortcuts instead of hover-only affordances

## In-Player Controls And Browser Integration

- TV-Dash now treats browser-native controls as additive, not sufficient on their own.
- `HlsPlayer` must expose explicit in-page controls for:
  - play/pause
  - mute/unmute
  - volume
  - fullscreen
  - Picture-in-Picture
- seek backward and seek forward are only shown when the current media element exposes a real seekable window
- live-only streams without DVR must surface honest state such as `No DVR` instead of fake VOD-style seek controls
- backend-advertised timeshift availability is the source of truth for whether pause, rewind, and timeline controls should appear on live channels
- live channels with timeshift configured but not yet populated should surface a warming state instead of exposing fake seek/pause behavior
- player diagnostics may report paused, muted, PiP-active, fullscreen-active, and live-edge state so surrounding pages can explain the current browser/player state without reimplementing media APIs
- player diagnostics should distinguish between normal in-page playback and native browser PiP so surrounding pages can explain the current mode without reimplementing media APIs
- fullscreen and PiP capability detection belongs in player helpers, not route pages, because Chrome and Firefox diverge most in those browser-owned behaviors

## Picture-In-Picture And Media Session Policy

- PiP must be triggered from an explicit TV-Dash control when the browser exposes the API
- browser-native PiP remains the only PiP mode when the current browser exposes it
- unsupported PiP states must disable the relevant control with a clear reason rather than leaving a broken button
- Firefox may still expose richer native PiP chrome than Chrome; TV-Dash should assume browser-owned PiP UX differs by platform
- Media Session integration should publish at least:
  - metadata
  - play
  - pause
  - stop
  - seekbackward/seekforward only when a real retained timeshift window exists and the current player surface is allowed to seek within it
- Media Session handlers must call back into the same player-owned actions as the visible controls so browser/system controls stay consistent with the page UI

## Live Timeshift Foundation

- Real live timeshift now depends on a backend-retained HLS buffer, not browser seekability alone.
- The player consumes a proxy-served timeshift master playlist when a channel is configured for retained DVR.
- Live playback states now separate:
  - live edge
  - buffered live behind the edge
  - DVR warming
  - live-only with no DVR support
- Player pages may query backend timeshift status and pass that snapshot into `HlsPlayer`, but buffer retention, eviction, and manifest generation stay outside the player boundary.
- The player may still clamp local seek actions against the browser-reported range, but it must not invent DVR controls when the backend says timeshift is unavailable.

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

# TV-Dash Player And HLS Standards

## Purpose

This document defines how TV-Dash integrates HLS.js, manages multi-view tiles, and separates playback engine logic from player UI.

The player is the highest-risk part of the frontend. Small shortcuts here create memory leaks, audio conflicts, and hard-to-debug regressions quickly.

## Ownership Boundary

All playback-engine behavior belongs in `apps/web/src/player`.

That includes:

- HLS.js instance creation and destruction
- manifest and level event handling
- quality option derivation
- quality selection resolution
- reconnect and retry policy
- tile defaulting and single-audio rules

That does not belong in:

- route pages
- generic UI primitives
- auth or API services

## One Player, One Video, One HLS Instance

Each rendered player tile owns:

- one `<video>` element
- zero or one HLS.js instance
- its own playback status
- its own reconnect timer

Rules:

- destroy the existing HLS instance before loading a new source
- clear reconnect timers before replacing or destroying the player
- remove DOM listeners on cleanup
- never share one HLS.js instance across tiles

## HLS Event Rules

- Register HLS event listeners only inside the player boundary.
- Listener registration must happen in the same lifecycle block that owns cleanup.
- Quality option updates, selected level updates, and error recovery signals should flow outward through explicit callbacks.
- Operator-facing playback diagnostics should also flow outward through explicit callbacks instead of forcing pages to infer state from raw HLS events.
- Do not let pages call `hls.currentLevel` or `hls.recoverMediaError()` directly.

## Quality Rules

- Every logical channel must resolve to one HLS master source for the player, whether that comes from:
  - a real upstream master playlist
  - or a backend-generated synthetic master playlist built from manual variant rows
- Quality options are discovered from manifest levels at runtime.
- `AUTO` is always available.
- `LOWEST` is a startup preference for background tiles, not a persisted duplicate channel record.
- Manual level selection must flow through `player/quality-options.ts` or an equivalent player helper.

## Multi-View Rules

- Layout definitions live centrally in `player/layouts.ts`.
- Tile counts must come from layout definitions, not from page-local hardcoded arrays.
- Tile defaults live in `player/multiview-layout.ts`.
- Only one active audio tile is allowed at a time unless product policy changes and the docs are updated in the same branch.

## Autoplay And Mute Rules

- Single-view pages may request unmuted autoplay, but must handle browser refusal gracefully.
- Multi-view tiles default to one audible tile and muted background tiles.
- Changing the active audio tile must mute the others in the same state transition.
- Muted/background tiles should reset back to low-bias startup quality when their source changes unless the operator explicitly reselects another level.
- Browser autoplay failures are expected behavior, not exceptional failures by themselves.

## Retry And Reconnect Rules

Retry behavior must distinguish between:

- recoverable network failures
- recoverable media failures
- terminal playback failures

Rules:

- network failures may schedule a bounded reconnect attempt
- current bounded policy is `3` network retries with escalating delays before surfacing failure
- media failures may attempt `recoverMediaError`
- current bounded policy is `1` media recovery attempt before surfacing failure
- terminal failures must surface a visible retry UI
- retrying, buffering, failed, and recovered states must stay visible enough for operators to distinguish player trouble from source trouble
- silent infinite retry loops are not allowed

Any change to retry timing or retry count must consider multi-view bandwidth pressure and browser resource limits.

## Native HLS Fallback

- Prefer HLS.js when supported.
- Fall back to native HLS only when the browser can play `application/vnd.apple.mpegurl`.
- Native fallback must still publish quality/status callbacks in the reduced form the browser supports.
- Unsupported browsers must surface a clear, user-facing error state.

## Explicit Player Controls

- TV-Dash must not rely on browser-native controls alone for critical playback actions.
- `HlsPlayer` should expose visible in-page controls for:
  - play/pause
  - mute/unmute
  - volume
  - fullscreen
  - Picture-in-Picture when supported
- controls must stay keyboard-usable and visible without hover-only discovery
- compact multi-view controls are preferred over removing controls entirely

## Picture-In-Picture And Browser Media APIs

- PiP support must be capability-detected inside `player/`, not guessed from browser family names.
- When PiP is unsupported, the control must be disabled or hidden with an operator-facing explanation.
- Firefox may provide richer native PiP chrome than Chrome; do not let that reduce TV-Dash's own in-page controls.
- Fullscreen and PiP toggles should call the browser APIs directly from player-owned actions and keep state reflected in player diagnostics.
- Media Session metadata and handlers belong in `player/` so browser/system media controls stay aligned with TV-Dash playback state.

## Live DVR And Seek Realism

- Seek controls are only valid when the media element exposes a real seekable range.
- Live-only streams without DVR must not show fake seek buttons.
- When a seekable live window exists, seek actions should clamp within the available range and preserve the live-edge concept for the operator.
- Player UI should make it clear whether the viewer is at the live edge, behind live, or on a stream with no DVR window.

## Separation Of Engine And UI

- `HlsPlayer` may render its own lightweight overlays for loading, status, and retry because those are playback-engine states.
- `HlsPlayer` may also render its own playback-control overlay because that behavior is part of the browser playback boundary.
- Pages and surrounding components still own layout-specific controls, recording actions, and orchestration.
- Do not put persistence or navigation logic inside the player engine component.

## Resource Control Rules

- Avoid unnecessary re-creation of player instances on unrelated re-renders.
- Keep expensive quality/layout decisions in pure helpers when possible.
- Do not prefetch or probe every stream variant unless there is a documented product requirement.
- New multi-view sizes must be reviewed for CPU, GPU, memory, and network cost before shipping.

## Testing Expectations

At minimum, player-related changes must add or update tests for:

- quality option derivation
- preferred quality resolution
- tile default behavior
- single-audio enforcement
- saved layout hydration or tile-state reset helpers when multi-view persistence logic changes

Higher-risk player changes should add component or integration coverage for:

- retry and terminal error UI
- source replacement cleanup
- autoplay and mute transitions
- explicit player controls, PiP support, and disabled-browser fallbacks
- Media Session handler wiring when browser/system playback integration changes

## Review Checklist

- Is all HLS.js interaction inside `player/`?
- Does cleanup remove listeners, timers, and instances?
- Are quality decisions centralized?
- Does multi-view preserve one-audio ownership?
- Does the failure path show a bounded, recoverable UX instead of looping forever?

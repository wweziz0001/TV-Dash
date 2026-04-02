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
- `player/layouts.ts`
  - static supported layout definitions
- `player/multiview-layout.ts`
  - tile defaults, resize policy, and single-audio enforcement

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
- `HlsPlayer` owns playback lifecycle and emits status/quality callbacks upward.
- Multi-view pages own which tile is selected, saved, or displayed.
- Shared quality and tile decision logic lives in pure player helpers.

## Tile Lifecycle Rules

- Each tile has isolated video state.
- Changing a tile source destroys the previous HLS instance before loading the next one.
- Cleanup must remove:
  - HLS.js instance
  - reconnect timers
  - DOM event listeners

## Retry and Reconnect Policy

- fatal network errors trigger reconnect attempts
- fatal media errors trigger media recovery
- unrecoverable failures surface a retry UI

Do not add silent infinite retry loops. Any retry policy change must consider multi-view bandwidth pressure.

## Autoplay and Mute Policy

- single-view playback may request unmuted autoplay, but browser policy can still block audio
- multi-view defaults keep only the first tile unmuted
- selecting another active audio tile must mute all others

## Multi-View Scaling Policy

- supported layouts are defined centrally in `player/layouts.ts`
- tile counts come from layout definitions, not inline page conditionals
- background tiles should prefer lower startup quality where possible
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

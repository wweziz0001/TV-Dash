# TV-Dash React And TypeScript Standards

## Purpose

This document covers React component rules, TypeScript rules, state management policy, and frontend placement rules for `apps/web`.

## Frontend Ownership Rules

### `pages/`

Pages are route orchestrators.

Pages may:

- start queries and mutations
- read route params and search params
- compose player modules, feature providers, and shared UI
- assemble payloads for service calls

Pages must not:

- contain raw `fetch` calls
- reimplement HLS.js lifecycle logic
- become a second home for reusable filtering, quality, or layout policy

### `components/`

Components are reusable presentation units.

Components may:

- accept already-shaped data and callbacks
- own view-local toggles and disclosure state
- stay dumb about HTTP and persistence

Components must not:

- call backend services directly
- import player internals unless they are explicitly player-facing components

### `player/`

`player/` owns:

- HLS.js integration
- quality option derivation
- tile state defaults
- multi-view layout rules
- playback retry and cleanup behavior

If code mentions HLS levels, manifest parsing, playback recovery, or audio ownership, it belongs in `player/` until proven otherwise.

### `services/`

`services/` owns:

- HTTP request logic
- request headers and auth token wiring
- response parsing
- API error mapping at the transport layer

### `features/`

`features/` is only for bounded client workflows with real ownership, such as auth session state.

Do not create a feature folder just to hold one helper or to avoid choosing between `pages`, `components`, `services`, and `player`.

## React Rules

### Component Boundaries

Create a new component when:

- the JSX block has its own meaningful props contract
- the same view appears in more than one place
- page readability is dropping because one visual section carries too much markup

Create a hook when:

- the logic is stateful
- React lifecycle APIs are required
- the behavior is reused or materially clarifies the parent component

Create a utility or pure helper when:

- the logic is deterministic
- it has no React dependency
- it benefits from direct unit tests

### Props Design

- Props should describe intent, not internal implementation.
- Boolean props should read clearly at the call site: `muted`, `autoPlay`, `isFavorite`.
- Callback props must be verb-based: `onStatusChange`, `onToggleFavorite`.
- Avoid passing large grab-bag prop objects when the child only needs a few fields.

### Event Handler Naming

- Local UI handlers use `handleX` for internal form or DOM events.
- Passed callbacks use `onX`.
- Domain actions outside JSX may use intent names such as `applySavedLayout`, `editGroup`, `moveChannel`.

### JSX Discipline

- Do not bury business rules inline in JSX maps and ternaries when they affect playback, persistence, or auth.
- Lightweight display conditions are fine inline.
- If a JSX branch needs more than a small conditional and one state update, move it into a named function or extracted component.

### Effects

- `useEffect` is for external synchronization only.
- Allowed effect reasons in TV-Dash:
  - sync player lifecycle with a video element
  - seed state from fetched data or URL search params
  - restore session state
  - manage DOM or browser APIs
- Do not use effects to derive values that can be computed during render.
- Every effect that creates listeners, timers, or HLS instances must also clean them up.

### Memoization

- Do not default to `useMemo` or `useCallback`.
- Use them only when one of these is true:
  - a derived collection is expensive enough to matter
  - referential stability is required for a child or library contract
  - the alternative would be repeated heavy work on every render

Current acceptable examples:

- filtered or sorted channel collections
- auth callbacks exposed through context

### Loading, Error, And Empty States

Every route-level page that fetches data must deliberately handle:

- initial loading
- mutation failure
- empty result states where they are operator-relevant

Toasts are not enough on their own when the main screen becomes unusable.

### Accessibility

- Inputs need labels or equivalent accessible names.
- Buttons must have text or an accessible icon context.
- Selectors that change playback or persistence state must remain keyboard-usable.
- Fullscreen or player controls must not rely on hover-only affordances.

## State Management Rules

### Local Component State

Use local state for:

- form inputs
- currently selected quality
- page-local filters
- tile UI state that is not shared elsewhere

### Page-Level State

Keep state in the page when it coordinates one route's experience, such as:

- selected saved layout
- multi-view tile arrangement before save
- preview quality options for the current screen

### Global State

Global client state must stay minimal.

Current approved global state:

- auth session via `AuthProvider`
- React Query cache for server state

Do not store these globally:

- transient form drafts
- per-page filter inputs
- current HLS level for each tile
- derived collections that React Query can re-fetch or pages can derive

### Server State

Use React Query for backend-owned async state:

- channels
- groups
- favorites
- layouts
- auth session lookups

Do not duplicate React Query results into separate long-lived local stores unless editing requires a local draft copy.

### Player State

Keep player engine state as close to the player as possible.

- `HlsPlayer` owns playback lifecycle status.
- pages own selected quality and tile selection because they drive surrounding controls and persistence payloads.
- shared player helpers own deterministic defaults and rules.

## TypeScript Rules

### Strictness

- Prefer exact DTO and domain types over broad generic objects.
- Avoid `any`.
- `unknown` is allowed only at trust boundaries, such as request parsing or truly open JSON payloads, and must be narrowed immediately.
- Replace `Record<string, unknown>` with a named type when the shape is known or reused.

### `type` Vs `interface`

Use `interface` for object shapes expected to be extended or implemented by multiple consumers, such as frontend API models.

Use `type` for:

- unions
- mapped types
- aliases derived from schemas
- utility compositions

Current repo convention:

- shared Zod-derived contracts use `type`
- frontend API payload models currently use `interface`

### DTO Modeling

- Request DTO types must come from `packages/shared` when both apps use them.
- The web client must not invent its own request shape when a shared input schema already exists.
- Response DTOs may stay frontend-local until shared response schemas are needed by both apps.

### Null And Undefined

- Use `null` when the API or DB deliberately represents "no value".
- Use `undefined` for optional function arguments or omitted object fields before serialization.
- Do not mix `null` and `undefined` for the same persisted field without a clear boundary rule.

### Discriminated Unions

Use discriminated unions when behavior changes by mode or state:

- retryable vs terminal player failures
- future admin form modes beyond simple create/update
- async UI state when there are more than two meaningful states

Do not introduce unions when a single nullable field is clearer.

### Generics

- Keep generics narrow and local.
- If a generic requires more than one type parameter in app code, confirm that a concrete domain type would not be clearer.
- Generic helpers must earn their existence through real repeated use.

### Explicit Typing

Require explicit types for:

- exported functions when the return type is not obvious from the signature
- public context values
- shared contract aliases
- module-level constants whose inferred type would be too broad

Allow inference for:

- small local variables
- straightforward component return types
- simple callback parameters already provided by library types

### Forbidden Or Discouraged TypeScript Shortcuts

- `any`
- double-casting through `unknown`
- unbounded `payload: unknown` on stable service methods
- leaking Prisma input types into the web app
- using `as` to skip validation when a schema or narrow helper should exist

## Frontend Review Checklist

- Is this logic in the correct folder?
- Are request payloads using shared input types?
- Is state stored at the narrowest useful scope?
- Are effects only synchronizing with the outside world?
- Does the page have explicit loading, error, and empty behavior?

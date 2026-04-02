# TV-Dash Coding Standards

## Purpose

This document defines what "good code" means in TV-Dash.

These standards are repository-specific. They exist to keep IPTV playback, multi-view orchestration, backend CRUD, and shared contracts readable and safe as the codebase grows.

Related standards:

- `docs/standards/naming-conventions.md`
- `docs/standards/react-typescript-standards.md`
- `docs/standards/backend-api-standards.md`
- `docs/standards/prisma-database-standards.md`
- `docs/standards/player-hls-standards.md`
- `docs/standards/testing-standards.md`

## What Good Code Means In TV-Dash

Good TV-Dash code:

- makes stream, player, and CRUD behavior obvious from file placement alone
- keeps playback lifecycle, HTTP transport, and database access in their owning layers
- favors stable DTOs and explicit contracts over shape guessing
- reads well during incidents, regressions, and handoff sessions
- is safe to extend without reopening large unrelated areas

Bad TV-Dash code:

- hides fetch logic in view components
- spreads HLS.js decisions across pages and generic UI
- mixes route parsing, business rules, and Prisma queries in one function
- grows giant page files because extraction was deferred repeatedly
- introduces "just this once" utilities with no clear ownership

## Current Repository Pressure Points

As of `2026-04-02`, these files are healthy but close to the size/complexity ceiling:

- `apps/web/src/pages/admin-channels-page.tsx`
- `apps/web/src/pages/multiview-page.tsx`
- `apps/web/src/player/hls-player.tsx`

These files are allowed to stay intact for now because their behavior is still cohesive, but any new branch-heavy behavior added there must first extract helpers, view sections, or DTO helpers into the correct owning layer.

## Core Rules

### Readability Over Cleverness

- Prefer code that an on-call engineer can understand in one pass.
- Prefer named intermediate variables over nested inline transformations when behavior matters.
- Prefer straightforward conditionals over compact "smart" expressions when player or persistence behavior changes.

### Explicitness Over Hidden Behavior

- Pass required inputs explicitly.
- Keep data shaping near the boundary that owns it.
- Do not rely on side effects hidden in helper names such as `init`, `handle`, or `process` without clear behavior in the function body.

### Focused Functions

- A function should have one layer of responsibility.
- Route functions translate HTTP.
- Service functions coordinate rules.
- Repository functions shape queries.
- Player helpers compute deterministic playback or layout decisions.

Extract code when a function starts doing more than one of the above.

### Bounded Files

Use these review thresholds:

- around `150` lines: pause and check whether the file still owns one concern
- around `250` lines: extraction should be the default unless the file is a thin, cohesive orchestrator
- above `300` lines: adding new branching behavior requires an extraction plan in the same change

These are guidance thresholds, not mechanical limits. `multiview-page.tsx` and `hls-player.tsx` are the current examples of files already using most of their allowed complexity budget.

## Extraction Rules

Keep code local when:

- it is only used once
- it mainly exists to support one JSX block
- extraction would create a fake abstraction with a worse name than the local code

Extract code when:

- the same policy is needed in more than one page or module
- a page is carrying payload shaping, filtering, retry logic, and presentational sections at once
- logic can be tested better as a pure helper
- code placement currently violates the documented folder ownership

Extraction targets:

- `pages/`: route orchestration only
- `components/`: shared view structure
- `player/`: HLS, quality, tile, and playback lifecycle logic
- `services/`: HTTP request code and API adapters
- `features/`: bounded client workflows with internal state
- `packages/shared`: cross-app schemas and contract types

## Forbidden Or Discouraged Patterns

Forbidden:

- Prisma access outside repositories
- `fetch` calls outside `apps/web/src/services`
- HLS.js object manipulation outside `apps/web/src/player`
- business rules inside Fastify route registration callbacks
- shared utilities created only to avoid importing from the correct domain folder
- hand-editing generated `dist/` output

Strongly discouraged:

- `any`
- untyped `unknown` payload plumbing when a shared DTO already exists
- `Record<string, unknown>` used in place of a known domain type
- giant "utils" files that mix string helpers, API mappers, and player logic
- comments that restate the next line instead of explaining why the code exists

## Literals, Constants, And Comments

- Repeated status strings, route fragments, event names, and storage keys must become named constants in the closest owning module.
- One-off display copy may stay inline if it is not reused and does not drive behavior.
- Comments are for non-obvious domain constraints, browser quirks, cleanup sequencing, or operator-facing tradeoffs.
- If behavior needs a paragraph to explain, prefer updating docs under `docs/` instead of stacking inline comments.

## Production Orientation

TV-Dash code must feel production-oriented even while the product is still MVP-sized.

That means:

- stable response shapes
- deliberate error states
- cleanup for timers, listeners, and HLS instances
- typed request payloads
- bounded modules with clear ownership

It does not mean:

- introducing ceremony that current product size does not need
- splitting files into tiny wrappers with no ownership gain
- adding frameworks or abstractions before current seams are exhausted

## Documentation Rules

Update docs in the same branch when a change alters:

- folder ownership
- DTO contracts
- player lifecycle policy
- migration or seed expectations
- test expectations
- handoff or local-development workflow

Inline comments are the last resort. Durable behavior belongs in `docs/architecture` or `docs/standards`.

## Refactor And Maintenance Rules

- Refactor only the layer you are actively improving.
- Do not mix a standards cleanup with unrelated feature work.
- Keep refactors behavior-preserving unless the user explicitly requested a behavior change.
- If a file violates the standards but is not being touched for a real reason, document the drift instead of rewriting it for cosmetics.
- When a touched file is already near the size ceiling, leave it better than you found it by extracting one seam, tightening one type boundary, or removing one hidden dependency.

## Review Checklist

Before merging, ask:

- Is each change in the correct folder and layer?
- Are contracts explicit and typed?
- Did we avoid adding new global state, new dumping grounds, or new type escape hatches?
- Did we update standards, architecture docs, or handoff docs if repository policy changed?

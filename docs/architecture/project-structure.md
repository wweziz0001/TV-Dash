# TV-Dash Project Structure

## Purpose

TV-Dash is a monorepo for an IPTV operations platform. The structure must stay small enough for a fast-moving product, but strict enough to prevent route, player, and persistence logic from collapsing into generic folders.

## Architecture References

This structure was informed by:

- [`jellyfin/jellyfin`](https://github.com/jellyfin/jellyfin): strong separation between API-facing code, implementation-heavy subsystems, persistence/data projects, and top-level `tests`
- [`jellyfin/jellyfin-web`](https://github.com/jellyfin/jellyfin-web): treating the web client as a real standalone app and keeping source organized by application responsibility instead of page-by-page dumping

## What We Adopted

- From `jellyfin/jellyfin`
  - Explicit backend boundaries between app wiring, domain modules, and data access
  - A visible distinction between public API entrypoints and implementation-heavy logic
  - A testing mindset where critical behavior has an intentional home
- From `jellyfin/jellyfin-web`
  - `apps/web` remains a first-class standalone client application
  - Player logic is isolated from generic UI components
  - Shared services/types are kept out of route pages and leaf components

## What We Intentionally Did Not Adopt

- We did not copy Jellyfin's many top-level backend projects. TV-Dash is not large enough to justify that fragmentation yet.
- We did not copy jellyfin-web's legacy `controllers`/broad `scripts` patterns. TV-Dash is greenfield and should avoid folders that already need cleanup elsewhere.
- We did not extract Prisma into a root `/prisma` package yet. Keeping schema, migrations, and seed logic inside `apps/api` is more appropriate while there is only one backend service.

## Chosen Repository Shape

```text
docs/
  architecture/
  decisions/
  runbooks/
  handoff/
apps/
  api/
  web/
packages/
  shared/
scripts/
tests/
```

## Top-Level Rules

| Path | Purpose | Allowed | Not Allowed |
| --- | --- | --- | --- |
| `docs/architecture` | durable engineering policy | architecture rules, boundary rules, test strategy, player policy | session-only notes |
| `docs/decisions` | major structural decisions | ADR-style records and decision indexes | transient TODO lists |
| `docs/runbooks` | repeatable operational steps | local setup, release checklist, troubleshooting | product requirements |
| `docs/handoff` | fast-start context for future Codex sessions | current state, known issues, session history | speculative roadmap essays |
| `apps/api` | Fastify API and backend implementation | routes, services, repositories, Prisma schema/migrations | frontend assets or browser-only logic |
| `apps/web` | React/Vite operator UI | pages, app bootstrap, shared UI, player modules, client services | backend-only logic, Prisma access |
| `packages/shared` | cross-app contracts | Zod schemas, shared enums, request/response contract types | runtime app wiring, DB access, UI components |
| `scripts` | workspace automation | smoke tests, maintenance scripts | application code |
| `tests` | future cross-workspace suites | end-to-end, contract, or regression harnesses spanning apps | app-internal unit tests |

## Backend Structure

```text
apps/api/src/
  app/       server wiring, auth plugin, CORS, shared request helpers
  config/    env/config parsing only
  db/        Prisma client ownership
  modules/   bounded backend domains
```

Each backend module may contain:

- `*.routes.ts`: HTTP registration and transport concerns only
- `*.service.ts`: business orchestration and policy
- `*.repository.ts`: Prisma/data access only

Backend folder rules:

- `app/` may depend on modules. Modules must not import from other modules through route files.
- `config/` must not import from route/service/repository code.
- `db/` exposes database helpers only. Prisma calls belong in repositories, not routes.
- `modules/*/*.routes.ts` may parse input, call guards, and map HTTP status codes. They must not assemble Prisma queries inline.
- `modules/*/*.service.ts` owns business rules, ownership checks, and orchestration across repositories or external services.
- `modules/*/*.repository.ts` owns database query shape and include/select details.

## Frontend Structure

```text
apps/web/src/
  app/        bootstrap, providers, router
  pages/      route-level screens only
  components/ reusable shared UI and layout primitives
  features/   bounded client features with explicit ownership
  player/     HLS and multi-view specific modules
  services/   API request clients/adapters
  lib/        truly generic utilities only
  styles/     global styles/tokens
  types/      frontend-local types not shared in packages
```

Frontend folder rules:

- `pages/` orchestrate data loading and compose existing modules. They should not contain reusable business logic.
- `components/` is for reusable UI pieces with no hidden API fetching.
- `player/` owns HLS.js integration, quality handling, tile state helpers, and multi-view behavior. Player logic must not be recreated inside pages or generic components.
- `services/` owns HTTP request code. Components and pages call service functions; they do not build fetch requests inline.
- `features/` is only for bounded client concerns that have internal state or workflows, such as auth. It is not a dumping ground for arbitrary helpers.
- `lib/` is reserved for truly app-wide, non-domain utilities like class name merging.

## Naming and Import Discipline

- Use kebab-case filenames for pages, components, and helpers.
- Use stable, kebab-case module folder names that match the owned resource/domain, such as `channels`, `groups`, `layouts`, and `streams`.
- Import downward across boundaries:
  - API `app -> modules -> repositories`
  - Web `pages -> player/components/features/services/lib`
- Do not import:
  - backend repositories inside backend routes from another module
  - frontend services inside reusable UI components
  - frontend player internals from generic shared UI unless the component is explicitly player-facing
- If code needs to be shared by both apps, move it into `packages/shared`. If it is only shared inside one app, keep it local to that app.

## Route and Page Placement Rules

- Add a backend route when the change exposes a new HTTP capability.
- Add a frontend page only for a new route-level screen.
- Add a shared component only after the second real reuse or when the component is already generic by design.
- Add a new `features/` folder only when the code has clear bounded ownership, state, and review surface.

## Scaling Guidance

- When another backend process or worker appears, then revisit extracting shared backend code into a package.
- When the web app gains multiple major surfaces, then consider route-level chunks and `widgets/` only if composition pain becomes real.
- Keep structure pressure proportional to product size. TV-Dash should stay disciplined, not ceremonial.

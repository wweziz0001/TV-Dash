# TV-Dash Naming Conventions

## Purpose

Naming in TV-Dash must make ownership obvious. A reviewer should be able to infer whether a file is a page, player module, backend route, shared contract, or Prisma entity from the name alone.

## Case Rules

| Artifact | Case | Example |
| --- | --- | --- |
| folders | `kebab-case` | `features/auth`, `modules/channels` |
| `.ts` and `.tsx` files | `kebab-case` | `channel-watch-page.tsx`, `stream.service.ts` |
| React components | `PascalCase` | `ChannelCard`, `HlsPlayer` |
| hooks | `camelCase` with `use` prefix | `useAuth` |
| functions | `camelCase` | `buildTileDefaults` |
| constants | `UPPER_SNAKE_CASE` | `API_BASE_URL`, `MASTER_TAG` |
| Prisma models | `PascalCase` singular | `Channel`, `SavedLayoutItem` |
| Prisma enums | `PascalCase` enum name, `UPPER_SNAKE_CASE` members | `LayoutType.LAYOUT_2X2` |
| TypeScript types/interfaces | `PascalCase` | `SavedLayout`, `PlayerStatus` |
| Zod schemas | `camelCase` + `Schema` suffix | `channelInputSchema` |
| tests | source filename + `.test.ts[x]` | `quality-options.test.ts` |

## Singular Vs Plural

Use singular when the module represents one domain concept:

- `channel.service.ts`
- `layout.repository.ts`
- `favorite.routes.ts`

Use plural for folders or route paths that represent resource collections:

- `modules/channels`
- `/channels`
- `pages/admin-groups-page.tsx`

Rule of thumb:

- folder name = owned domain collection
- file name = owned module role for one domain

## Frontend Naming

### Pages

- Route-level screens live in `pages/`.
- Page filenames must end in `-page.tsx`.
- Page component names must end in `Page`.

Examples:

- `dashboard-page.tsx` -> `DashboardPage`
- `admin-channels-page.tsx` -> `AdminChannelsPage`

### Components

- Shared UI components use domain-first names when they belong to a domain area: `channel-card.tsx`, `page-header.tsx`.
- Generic primitives stay short and literal: `button.tsx`, `input.tsx`, `panel.tsx`.
- Do not name a reusable component after its current page placement.

### Hooks

- Hooks must start with `use`.
- Hook names should describe owned behavior, not implementation: `useChannelFilters`, not `useDashboardStuff`.
- Do not create a hook just to move code out of a large file if the hook has no reusable stateful behavior.

### Services

- Service filenames should describe the remote system or bounded API surface.
- `api.ts` is acceptable today because the web app talks to one backend.
- If `api.ts` grows beyond one cohesive client surface, split by resource:
  - `channels-api.ts`
  - `layouts-api.ts`
  - `auth-api.ts`

### Player Modules

- Player code must use names that distinguish playback engine logic from UI shells.
- `hls-player.tsx` is the engine-backed React wrapper.
- Quality and layout helpers must include the domain noun:
  - `quality-options.ts`
  - `multiview-layout.ts`
- Future multi-view-specific UI components should include `tile`, `wall`, or `multiview` in the filename.

## Backend Naming

### Modules

- Backend modules live under `apps/api/src/modules/<plural-domain>`.
- Each module uses exactly these suffixes:
  - `.routes.ts`
  - `.service.ts`
  - `.repository.ts`

Examples:

- `channel.routes.ts`
- `group.service.ts`
- `layout.repository.ts`

### Route Paths

- Use plural resource names for collection paths: `/channels`, `/groups`, `/layouts`.
- Use nested or qualifier segments only when the resource identity demands it: `/channels/slug/:slug`.
- Avoid action-style paths unless the endpoint is truly not CRUD: `/streams/test`.

### DTO And Contract Names

- Input schemas end with `InputSchema`.
- Input types end with `Input`.
- Response-specific frontend types should end with the domain noun only when they represent the wire shape already returned by the API.
- Use `Result` for operational responses such as stream inspection: `StreamTestResult`.

### Repositories And Services

- Repository functions use persistence verbs: `find`, `list`, `create`, `update`, `delete`, `upsert`.
- Service functions use domain verbs when they add business meaning: `createUserLayout`, `listChannelCatalog`.
- Avoid generic names like `handleChannels`, `runGroupUpdate`, or `processLayout`.

## Prisma And Database Naming

- Model names are singular `PascalCase`.
- Relation fields are plural only when the relation is a collection: `favorites`, `items`, `channels`.
- Foreign keys use `<entityName>Id`: `groupId`, `userId`, `savedLayoutId`.
- Boolean fields read as facts or flags:
  - `isActive`
  - `isMuted`

## Contracts, Schemas, And Types

- Shared schemas in `packages/shared` must use the same base noun across schema and type:
  - `savedLayoutInputSchema`
  - `SavedLayoutInput`
- Frontend-local types in `apps/web/src/types/api.ts` should match the API payload names unless there is a deliberate adapter layer.
- Do not create duplicate names for the same concept across apps without a suffix that explains the difference, such as `ChannelInput` vs `Channel`.

## Tests

- Unit tests mirror the source filename exactly.
- Route or service tests mirror the owning file:
  - `build-server.test.ts`
  - `playlist-parser.test.ts`
- Future component tests should follow the component filename:
  - `channel-card.test.tsx`
  - `hls-player.test.tsx`

## Forbidden Names

- `helpers.ts`
- `misc.ts`
- `common.ts`
- `temp.ts`
- `new.ts`
- `final.ts`
- `data.ts` for domain repositories

If a proposed name only describes that code is "shared" or "common", the ownership is still unclear and the code is probably headed for the wrong folder.

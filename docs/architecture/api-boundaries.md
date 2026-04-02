# TV-Dash API Boundaries

## API Layering Rule

Each backend domain module follows:

```text
routes -> services -> repositories -> prisma
```

## Route Responsibilities

Routes may:

- register endpoints
- parse and validate request input
- apply auth/admin guards
- map service results to HTTP status codes

Routes must not:

- build Prisma queries inline
- contain cross-entity business rules
- hide reusable validation or mapping logic in anonymous callbacks

## Service Responsibilities

Services may:

- own business behavior
- perform ownership checks
- coordinate multiple repositories
- encapsulate non-HTTP orchestration

Services must not:

- depend on Fastify request/reply objects unless there is no better seam
- duplicate schema validation already handled at the route edge
- leak raw transport concerns back into repositories

## Repository Responsibilities

Repositories may:

- talk to Prisma
- define include/select/order/filter shapes
- map persistence-specific query behavior

Repositories must not:

- read request objects
- generate JWTs
- own UI-facing wording

## Validation Rules

- Shared request schemas belong in `packages/shared`.
- Route handlers use `parseWithSchema` as the validation boundary.
- If only one app needs a type and it is not part of the API contract, keep it local instead of polluting `packages/shared`.

## Contract Stability Rules

- Request/response contract changes require:
  - schema update in `packages/shared`
  - API implementation update
  - frontend service/type update
  - testing update
  - handoff documentation update when behavior materially changes

## Database Access Rules

- Prisma client is owned by `apps/api/src/db/prisma.ts`.
- Only repositories should import Prisma for data access.
- Prisma schema, migrations, and seed data remain under `apps/api/prisma` until more than one backend runtime needs direct ownership.

## Module Ownership

- `auth`
  - login and current-user session lookup
- `channels`
  - logical channel catalog CRUD and browse lookups
- `groups`
  - channel grouping/catalog structure
- `favorites`
  - per-user pinned channels
- `layouts`
  - per-user saved multiview walls
- `streams`
  - stream inspection and metadata/test endpoints
- `health`
  - operational readiness endpoint

## Error Handling Rules

- validation failure: `400`
- unauthenticated: `401`
- forbidden/admin-only: `403`
- missing owned resource: `404`
- upstream stream test failures: `502`

Keep those mappings stable unless the contract explicitly changes.

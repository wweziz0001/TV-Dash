# TV-Dash Prisma And Database Standards

## Purpose

This document defines schema design, migration discipline, repository usage, and seed expectations for `apps/api/prisma`.

## Model Design Rules

- Prisma model names are singular `PascalCase`.
- Table entities must reflect durable domain concepts, not UI widgets.
- Join or child entities should be explicit when they carry real state:
  - `Favorite`
  - `SavedLayoutItem`
- `ChannelQualityVariant`
- `EpgSourceChannel`
- `EpgChannelMapping`
- `ProgramEntry`
- `RecordingJob`
- `RecordingRule`
- `RecordingRun`
- `RecordingAsset`

## Field Naming Rules

- Primary keys use `id`.
- Foreign keys use `<relatedEntity>Id`.
- Timestamps use `createdAt` and `updatedAt`.
- Boolean fields use `is*`, `has*`, or another fact-based name.
- URLs must include the protocol in the field meaning when relevant, such as `masterHlsUrl`.

## Nullability Discipline

- Make fields nullable only when the domain truly allows absence.
- Use nullable fields to model optional relationships or optional display metadata.
- Do not use nullability as a shortcut around incomplete migration planning.

Current accepted nullable examples:

- `Channel.logoUrl`
- `Channel.groupId`
- `SavedLayoutItem.channelId`

## Relation Rules

- Relation field names must make ownership obvious.
- Collection relations are plural: `favorites`, `savedLayouts`, `items`.
- Optional single relations remain singular: `group`, `channel`.
- Always specify `onDelete` behavior intentionally for non-trivial relations.

Guide-specific relation rule:

- Imported guide concepts should be normalized:
  - source configuration in `EpgSource`
  - discovered XMLTV channel identities in `EpgSourceChannel`
  - channel linkage in `EpgChannelMapping`
  - concrete schedule rows in `ProgramEntry`

Recording-specific relation rule:

- recording concepts should also stay normalized:
  - scheduling intent in `RecordingJob`
  - one execution attempt per `RecordingRun`
  - finalized playable output in `RecordingAsset`

## Audit Field Rules

Every long-lived top-level entity should have:

- `createdAt`
- `updatedAt`

Exceptions are allowed for join tables or append-only records that do not need update tracking, such as `Favorite`.

Security-specific additions:

- authenticated-user records may carry a session invalidation field such as `sessionVersion` when stateless tokens still need a server-side freshness check
- durable admin governance records such as `AuditEvent` are expected to be append-only, timestamped, and sanitized rather than updated in place

## Enum Rules

- Use enums for stable domain modes shared across code paths, such as `UserRole` and `LayoutType`.
- Do not introduce enums for values that are likely to churn every sprint.
- Keep enum members explicit and readable in logs and saved data.

## Index And Constraint Rules

Add indexes or unique constraints when one of these is true:

- the field is a stable lookup key
- the relation must not duplicate rows
- sort/filter behavior depends on it repeatedly

Current good examples:

- unique `slug` fields
- unique `[userId, channelId]` on `Favorite`
- unique `[savedLayoutId, tileIndex]` on `SavedLayoutItem`
- unique `[sourceId, xmltvChannelId]` on imported source channels
- unique `[channelId]` on channel-to-guide mappings when one live mapping per channel is the intended rule

When adding a new list endpoint, review whether a missing index will hurt it before shipping.

## Migration Discipline

Schema changes must be introduced in this order:

1. update `schema.prisma`
2. create a Prisma migration
3. review generated SQL, not just the schema diff
4. update seed data if local development depends on the new field or relation
5. update docs and handoff notes if operating expectations changed

Migration review must check:

- data loss risk
- backfill expectations
- nullability changes
- unique/index side effects
- delete behavior on relations

Guide-specific migration review must also check:

- whether imported programme replacement is source-scoped and atomic
- whether legacy direct guide-link fields are backfilled into normalized mapping tables before removal
- whether large `ProgramEntry` write paths need indexes before release

Recording-specific migration review must also check:

- whether recording history survives channel deletion through snapshot fields where needed
- whether job-status and library list filters have the indexes they need before release
- whether storage-path uniqueness and run-to-asset uniqueness are explicit instead of implied by application code
- whether library metadata snapshots such as programme title/description/category remain readable after guide rows change
- whether thumbnail sidecar paths and protected/retention fields are explicit instead of inferred in application code

## Seed Strategy

- Seeds should produce a runnable operator experience, not just valid rows.
- Keep seed data deterministic enough for local development and testing.
- Seed examples should exercise key behaviors:
  - admin login
  - viewer login
  - grouped channels
  - at least one mapped guide source/channel example when guide features depend on local data
  - at least one favorite
  - at least one saved layout

Do not turn the seed into a second application layer. Keep it readable and intentionally small.

## Query Discipline

- Repositories own Prisma query shape.
- Prefer `select` when only a subset is needed.
- Use `include` deliberately when the caller truly needs related entities.
- Keep query ordering explicit for operator-visible lists.
- Avoid raw SQL unless Prisma cannot express the needed query cleanly and the performance gain is justified in review.

## Transactions

Use transactions when a change must not partially apply, such as:

- multi-entity writes that must stay consistent
- EPG imports that replace one source's imported channels and programme rows together
- future layout save flows that perform dependent validation and writes together

Do not use transactions just because multiple queries exist; use them when consistency requires atomicity.

## Review Checklist

- Does the schema name the domain clearly?
- Are nullable fields truly optional?
- Are indexes and unique constraints intentional?
- Does the repository use Prisma in the owning module only?
- Did the migration and seed strategy get reviewed together?

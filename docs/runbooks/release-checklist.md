# Release Checklist

## Before Cutting A Release

1. Pull the latest target branch and confirm scope is intentional.
2. Review `docs/handoff/codex-handoff.md` for known issues and current architecture assumptions.
3. Confirm `.env.example` still matches runtime expectations.
4. Confirm Prisma schema and migrations are committed together.

## Required Verification

1. `npm run lint`
2. `npm run test`
3. `npm run build`
4. `npm run smoke:test` against a running API when API or player behavior changed

## Manual High-Risk Checks

1. Log in as admin.
2. Verify channel playback in single view.
3. Verify quality selector keeps `Auto` and manual quality choices.
4. Verify multi-view layout rendering and one-active-audio behavior.
5. Verify channel CRUD.
6. Verify group CRUD if touched.
7. Verify saved layout load/update/delete if touched.

## Documentation Checks

1. Update architecture docs if structure or policy changed.
2. Update handoff docs if repository state or priorities changed.
3. Record unresolved items in `docs/handoff/codex-session-log.md`.

## Delivery Checks

1. Commits are logical and reviewable.
2. No unrelated generated drift is included.
3. `git status` is clean before release tagging or PR finalization.

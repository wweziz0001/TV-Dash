# Local Development

## Prerequisites

- Node.js and npm
- PostgreSQL reachable by `DATABASE_URL`

## Environment Setup

1. Copy env values:
   - `cp .env.example .env`
2. Review and update:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `CLIENT_URL`
   - `CLIENT_URLS`
   - `VITE_API_BASE_URL`

## First-Time Setup

1. Install dependencies:
   - `npm install`
2. Generate Prisma client:
   - `npm run db:generate`
3. Apply migrations:
   - `npm run db:deploy`
4. Seed data:
   - `npm run db:seed`

## Daily Development

1. Start all workspaces:
   - `npm run dev`
2. Open:
   - web: `http://localhost:5173`
   - api: `http://localhost:4000/api`
   - health: `http://localhost:4000/api/health`

## Verification Commands

- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run smoke:test`

## Seeded Accounts

- admin: `admin@tvdash.local / Admin123!`
- viewer: `viewer@tvdash.local / Viewer123!`

## When To Reseed

Reseed when:

- a migration changed required seed data
- local data is inconsistent with current schema
- testing saved layouts/favorites from a clean baseline matters

Command:

- `npm run db:seed`

## Common Notes

- `apps/api` reads the root `.env`.
- `apps/web` uses `envDir` pointing at the repo root.
- The web player chunk is currently large; expect a Vite size warning until route-level lazy loading is added.

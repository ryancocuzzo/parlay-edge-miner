# NCAAF Edge

Private college football strategy lab: describe a betting idea in plain English, backtest it honestly (build seasons vs. a blind test), save it, and get weekly picks. Users can request features and bug fixes from the app; a Cursor cloud agent builds them and ships to production.

## Stack

Next.js 15 on Vercel · Prisma + Prisma Postgres · Auth.js (Google) · AI SDK + Vercel AI Gateway · CollegeFootballData · Cursor Cloud Agents API.

## Local

```bash
npm ci
cp .env.example .env   # DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID/SECRET, CFBD_API_KEY, AI_GATEWAY_API_KEY
npx prisma migrate deploy
npm run dev
```

`npm test`, `npm run typecheck`, `npm run build`. Contributor and agent rules are in [AGENTS.md](AGENTS.md).

## Deploys

Pushes to `main` deploy to production. `src/factory/deploy-guard.ts` runs as Vercel's ignored build step and skips any deploy whose commits touch protected paths or ship non-additive migrations; protected changes ship with an admin `npx vercel deploy --prod`. Production builds run `prisma migrate deploy`.

## Feature requests

Users submit from `/requests`. Each request is triaged by an LLM against an allowlist of safe categories, rate-limited per user (bug fixes are free), then dispatched to a Cursor cloud agent that commits to `main`. Status, costs and throttles live on `/admin`. Needs `CURSOR_API_KEY`, and optionally `FACTORY_DEV_DATABASE_URL` / `FACTORY_DEV_AUTH_SECRET` for the agent's sandbox.

## Cron

`/api/cron` every 6 hours (Bearer `CRON_SECRET`): odds snapshot, CFBD sync, grading, boards, and advancing feature requests.

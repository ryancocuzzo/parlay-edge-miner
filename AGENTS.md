# AGENTS.md

NCAAF Edge is a private (≤10 users) Next.js 15 app for researching college football betting strategies: a strategy lab chat (AI SDK + AI Gateway), deterministic backtests, saved strategies with weekly pick boards, and an admin page. Postgres via Prisma, Google sign-in via Auth.js, hosted on Vercel. Most users are on phones.

## Commands

```bash
npm ci
npm run typecheck
npm test            # vitest, real fixtures in fixtures/
npm run build
npm run dev
```

All three of typecheck, test and build must pass before you push.

## Shipping (feature-request builders)

You are usually a cloud agent building a request a user submitted from the app's Requests page.

- Commit to `main`. Vercel deploys `main` to production automatically within a few minutes. There is no review step, so scope tightly and verify.
- Before pushing: `git pull --rebase origin main`, re-run the checks if anything came in, then `git push origin main`. Never force-push or rewrite history.
- Your environment has `DATABASE_URL` pointing at a disposable development database (game, line and ranking data, no real users) and a development `AUTH_SECRET`. You do not have, and must never try to obtain, production credentials.
- If a request needs anything on the never list or a protected path, make no changes and reply `DECLINED: <one friendly sentence>`.

### Deploy guard

`src/factory/deploy-guard.ts` runs before every production build. If any commit since the last deploy touches a protected path or ships a non-additive migration, the deploy is skipped for everyone until an admin intervenes. Protected paths:

- Auth and access: `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts`, `src/allowlist.ts`, `src/app/login/`, `src/app/privacy/`
- Admin, API routes, jobs and budgets: `src/app/admin/`, `src/app/api/`, `src/jobs.ts`, `src/data/usage.ts`
- The request system: `src/factory/`, `src/app/requests/`
- Build and config: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.js`, `vercel.json`, `.github/`, `.env*`, `prisma/seed.ts`, this file
- Existing migration files, and any migration touching `AllowlistUser`, `FeatureRequest` or `FactorySettings`

No new dependencies: use what is in `package.json`.

### Never

Sign-in, accounts, permissions or admin powers; secrets or env vars; payments or real betting; letting users see or change each other's data; new paid APIs, bigger or more AI models, higher limits or more frequent jobs; deployment, CI or the request system itself; removing features or changing how existing bets are graded.

## Database and migrations

- Schema: `prisma/schema.prisma`. Always read it before referencing a field.
- To change it: edit the schema, then write the SQL with `npm run db:migration-sql > prisma/migrations/<next number>_<name>/migration.sql` (diffs against `origin/main`'s schema, no database needed). Migrations must be additive: new tables, nullable or defaulted columns, indexes.
- Test it against the dev database with `npx prisma migrate deploy`. Production migrations run automatically in the Vercel build.
- Never run `prisma db push`, `prisma migrate reset`, `prisma migrate dev`, or pass any database as `--shadow-database-url`; those can wipe data.

## Where things live

- Data ingest: `src/data/cfbd.ts` (CollegeFootballData client, zod-validated, about 1,000 calls/month with a reserve) and `src/data/ingest.ts` (sync into `CfbGame`, `GameLine`, `CfbRanking`, `CfbTeam`). Any new endpoint must fit the existing per-season sync, a handful of calls.
- Strategy engine: `src/strategy/spec.ts` (feature catalog + spec schema), `candidates.ts` (feature computation, pure), `engine.ts` (backtest, verdicts, breakdowns), `dataset.ts` (loads and caches games). New features: add to `FEATURES`, compute in `candidatesForGame`, test in `engine.test.ts` with real fixture games.
- Lab: `src/lab/tools.ts` (model tools), `src/lab/instructions.ts` (prompt), UI in `src/app/lab/`.
- Strategy pages: `src/app/page.tsx`, `src/app/strategies/[slug]/`, `src/app/backtests/[id]/`, shared UI in `src/components/strategy/stats.tsx`.
- Styling: one design system in `src/app/globals.css` (tokens at the top). Reuse existing classes and tokens; design for a 390px-wide phone first.

## Conventions

- Functional core, imperative shell: fetch at the edges, pure functions in the middle, no mutation escaping a function.
- `undefined` over `null`; convert at fetch boundaries with `?? undefined`.
- Validate every external API response with zod.
- No comments except to flag a real footgun. No speculative fallbacks.
- Tests use Arrange-Act-Assert and real data from `fixtures/`, never mocked domain objects.
- Plain language in the UI: "build seasons" (≤2023), "blind test" (2024–25), "this season" (2026), "units", "likely range". Never "holdout", "out of sample" or "u".

## Checking the UI locally

`npm run dev`, then sign in by setting an Auth.js session cookie minted with the dev secret:

```js
import { encode } from '@auth/core/jwt';
const salt = 'authjs.session-token';
const token = await encode({ secret: process.env.AUTH_SECRET, salt, token: { email: 'builder@example.com', name: 'Builder', sub: 'builder' } });
// cookie: authjs.session-token=<token> on http://localhost:3000
```

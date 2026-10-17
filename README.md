# NCAAF Edge Board

Private, auditable +EV college football board. Fair probability is the Pinnacle moneyline with vig removed. A bet is +EV when another book pays more than that fair price. Parlays are 2- and 3-leg combinations of +EV legs from different games.

## Stack

- Next.js on Vercel
- Postgres via Prisma
- Auth.js email magic links + allowlist
- The Odds API (`americanfootball_ncaaf`), with short in-memory TTL cache on odds (5m) and scores (1m)

## Local

```bash
cp .env.example .env
npm install
npx prisma db push
npm run db:seed
npm run dev
```

CLI miner (no web):

```bash
export ODDS_API_KEY=...
npm start
```

## Tests

```bash
npm test
```

Betting-logic e2e is Vitest over pre-fetched `fixtures/ncaaf` (price → settle → strategy hit rates / unit P/L). Those same fixture benchmarks seed `StrategyBenchmark` for the UI.

## Cron

Protected by `Authorization: Bearer $CRON_SECRET`:

- `/api/cron?job=all` — refresh + settle (every 6h)
- `/api/cron?job=weekly` — roll up live strategy benchmarks (Mondays)

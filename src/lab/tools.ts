import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { loadDataset } from '../strategy/dataset';
import { inConferences, splitFor, summarize, TRAIN_LAST_SEASON, HOLDOUT_LAST_SEASON, type BacktestReport, type Summary } from '../strategy/engine';
import { candidatesForGame, gradeCandidate } from '../strategy/candidates';
import { LEGACY_SLUG } from '../strategy/legacy';
import { recordBacktest, type LegacyMeta } from '../strategy/service';
import { BOOKS, CONFERENCES, FEATURES, MARKETS, strategySpecSchema, strategySpecShape, type FeatureKey } from '../strategy/spec';

const round = (value: number, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;

const compactSummary = (s: Summary) => ({
  bets: s.bets,
  record: `${s.wins}-${s.losses}${s.pushes ? `-${s.pushes}` : ''}`,
  units: round(s.units, 2),
  roi: round(s.roi),
  roi95: [round(s.roiLow), round(s.roiHigh)],
  hitRate: round(s.hitRate),
  breakEven: round(s.breakEven),
});

const compactReport = (report: BacktestReport) => ({
  verdict: report.verdict,
  buildSeasons: compactSummary(report.splits.train),
  blindTest: compactSummary(report.splits.holdout),
  thisSeason: compactSummary(report.splits.live),
  blindTestTotal: compactSummary(report.outOfSample),
  bySeason: report.bySeason.map((s) => ({ season: s.season, bets: s.bets, roi: round(s.roi) })),
  breakdowns: report.breakdowns.map((b) => ({ title: b.title, rows: b.rows.map((r) => ({ label: r.label, bets: r.bets, roi: round(r.roi) })) })),
  candidates: report.candidates,
  warnings: report.warnings,
});

const filterSchema = z.object({ feature: z.enum(Object.keys(FEATURES) as [FeatureKey]), min: z.number().optional(), max: z.number().optional() });

export const labTools = (actor: string) => ({
  getDataCatalog: tool({
    description: 'Lists the features strategies can use, data coverage by season and market, which seasons are build seasons vs blind test, and the legacy strategy record.',
    inputSchema: z.object({}),
    execute: async () => {
      const [{ games }, legacy] = await Promise.all([
        loadDataset(),
        prisma.strategy.findUnique({ where: { slug: LEGACY_SLUG }, select: { meta: true } }),
      ]);
      const seasons = [...new Set(games.map((g) => g.season))].sort();
      const coverage = seasons.map((season) => {
        const inSeason = games.filter((g) => g.season === season);
        const has = (pick: (l: (typeof games)[number]['lines'][number]) => unknown) => inSeason.filter((g) => g.lines.some(pick)).length;
        return {
          season,
          games: inSeason.length,
          completed: inSeason.filter((g) => g.completed).length,
          withMoneyline: has((l) => l.homeMoneyline !== undefined),
          withSpread: has((l) => l.spread !== undefined),
          withTotal: has((l) => l.total !== undefined),
          withElo: inSeason.filter((g) => g.homeElo !== undefined && g.awayElo !== undefined).length,
        };
      });
      const parlays = (legacy?.meta as LegacyMeta | null)?.parlays;
      return {
        markets: MARKETS,
        books: BOOKS,
        conferences: CONFERENCES,
        features: Object.entries(FEATURES).map(([key, f]) => ({ key, ...f })),
        seasons: {
          buildSeasons: `≤ ${TRAIN_LAST_SEASON}`,
          blindTest: `${TRAIN_LAST_SEASON + 1}–${HOLDOUT_LAST_SEASON}`,
          thisSeason: `${HOLDOUT_LAST_SEASON + 1}+`,
        },
        coverage,
        legacyParlays: parlays && { twoLeg: compactSummary(parlays.twoLeg), threeLeg: compactSummary(parlays.threeLeg) },
      };
    },
  }),

  featureDistribution: tool({
    description:
      'Build-seasons-only (never blind test) distribution of one feature for a market, optionally after filters: quantiles, plus record and ROI by quintile. Use it to pick sensible thresholds.',
    inputSchema: z.object({
      market: z.enum(MARKETS),
      feature: filterSchema.shape.feature,
      filters: z.array(filterSchema).max(8).optional(),
      conferences: strategySpecShape.shape.conferences,
      opponentConferences: strategySpecShape.shape.opponentConferences,
    }),
    execute: async ({ market, feature, filters = [], conferences, opponentConferences }) => {
      const { games } = await loadDataset();
      const training = games.filter((g) => g.completed && splitFor(g.season) === 'train');
      const byId = new Map(training.map((g) => [g.id, g]));
      const rows = training
        .flatMap((g) => candidatesForGame(g, market))
        .filter((c) => c.features[feature] !== undefined && inConferences({ conferences, opponentConferences }, c))
        .filter((c) => filters.every(({ feature: f, min, max }) => {
          const v = c.features[f];
          return v !== undefined && (min === undefined || v >= min) && (max === undefined || v <= max);
        }))
        .flatMap((c) => {
          const grade = gradeCandidate(c, byId.get(c.gameId)!);
          return grade ? [{ value: c.features[feature]!, price: c.price, ...grade }] : [];
        })
        .sort((a, b) => a.value - b.value);
      if (rows.length === 0) return { feature, market, count: 0 };
      const at = (q: number) => rows[Math.min(rows.length - 1, Math.floor(q * rows.length))]!.value;
      const quintiles = [0, 1, 2, 3, 4].map((i) => {
        const slice = rows.slice(Math.floor((i * rows.length) / 5), Math.floor(((i + 1) * rows.length) / 5));
        return { from: slice[0]?.value, to: slice.at(-1)?.value, ...compactSummary(summarize(slice)) };
      });
      return {
        feature,
        market,
        count: rows.length,
        quantiles: { p10: at(0.1), p25: at(0.25), p50: at(0.5), p75: at(0.75), p90: at(0.9) },
        quintiles,
        note: 'Every candidate bet in build seasons, before picking a top N per week.',
      };
    },
  }),

  runBacktest: tool({
    description:
      'Validates and backtests a strategy over every season, choosing the top picksPerWeek candidates each week. Persists the run so the user can audit every pick. Always call this before describing performance.',
    inputSchema: z.object({ spec: strategySpecShape }),
    execute: async ({ spec }) => {
      const parsed = strategySpecSchema.safeParse(spec);
      if (!parsed.success) return { ok: false as const, errors: parsed.error.issues.map((i) => [i.path.join('.'), i.message].filter(Boolean).join(': ')) };
      const { run, report, picks } = await recordBacktest(parsed.data, actor);
      const recent = picks.filter((p) => splitFor(p.season) !== 'train').slice(-5);
      return {
        ok: true as const,
        runId: run.id,
        spec: parsed.data,
        report,
        recentPicks: recent.map((p) => ({ season: p.season, week: p.week, team: p.team, opponent: p.opponent, price: p.price, line: p.line, result: p.result, strength: p.strength })),
      };
    },
    toModelOutput: ({ output }) => ({
      type: 'json',
      value: output.ok ? { ok: true, runId: output.runId, ...compactReport(output.report) } : output,
    }),
  }),
});

export type LabTools = ReturnType<typeof labTools>;

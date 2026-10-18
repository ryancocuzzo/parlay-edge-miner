import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { loadDataset } from '../strategy/dataset';
import { inConferences, splitFor, summarize, TRAIN_LAST_SEASON, HOLDOUT_LAST_SEASON, type BacktestReport, type Summary } from '../strategy/engine';
import { candidatesForGame, gradeCandidate, type Candidate, type DatasetGame } from '../strategy/candidates';
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

const candidateQuery = {
  market: z.enum(MARKETS),
  filters: z.array(filterSchema).max(8).optional(),
  conferences: strategySpecShape.shape.conferences,
  opponentConferences: strategySpecShape.shape.opponentConferences,
};

const gradedCandidates = (
  games: DatasetGame[],
  { market, filters = [], conferences, opponentConferences }: z.infer<z.ZodObject<typeof candidateQuery>>,
) => {
  const byId = new Map(games.map((g) => [g.id, g]));
  return games
    .filter((g) => g.completed)
    .flatMap((g) => candidatesForGame(g, market))
    .filter((c) => inConferences({ conferences, opponentConferences }, c))
    .filter((c) => filters.every(({ feature, min, max }) => {
      const v = c.features[feature];
      return v !== undefined && (min === undefined || v >= min) && (max === undefined || v <= max);
    }))
    .flatMap((candidate) => {
      const grade = gradeCandidate(candidate, byId.get(candidate.gameId)!);
      return grade ? [{ candidate, price: candidate.price, ...grade }] : [];
    });
};

const rankBucket = (rank: number | undefined) => (rank === undefined ? 'Unranked' : rank <= 5 ? 'Top 5' : rank <= 10 ? '6–10' : '11–25');

const GROUPS = {
  venue: (c: Candidate) => c.venue,
  team: (c: Candidate) => (c.market === 'total' ? undefined : c.team),
  opponent: (c: Candidate) => (c.market === 'total' ? undefined : c.opponent),
  conference: (c: Candidate) => c.conferences[0],
  opponentConference: (c: Candidate) => c.opponentConference,
  apRank: (c: Candidate) => (c.market === 'total' ? undefined : rankBucket(c.features.apRank)),
  opponentApRank: (c: Candidate) => (c.market === 'total' ? undefined : rankBucket(c.features.opponentApRank)),
  season: (c: Candidate) => String(c.season),
} satisfies Record<string, (c: Candidate) => string | undefined>;

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
    inputSchema: z.object({ ...candidateQuery, feature: filterSchema.shape.feature }),
    execute: async ({ feature, ...query }) => {
      const { games } = await loadDataset();
      const { market } = query;
      const rows = gradedCandidates(games.filter((g) => splitFor(g.season) === 'train'), query)
        .filter(({ candidate }) => candidate.features[feature] !== undefined)
        .map((row) => ({ ...row, value: row.candidate.features[feature]! }))
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

  compareGroups: tool({
    description:
      'Record and ROI of every candidate bet (not a top N per week) grouped by venue, team, opponent, conference, AP rank bucket or season, split into build seasons and the blind test. Use it for "which stadiums / teams / ranks do best" questions. buildLeadersInBlindTest shows whether the best build-season groups kept winning, which is the honest answer to whether a group edge is real.',
    inputSchema: z.object({
      ...candidateQuery,
      groupBy: z.enum(Object.keys(GROUPS) as [keyof typeof GROUPS]),
      minBets: z.number().int().min(5).max(500).default(30).describe('Hide groups with fewer total bets.'),
    }),
    execute: async ({ groupBy, minBets, ...query }) => {
      const { games } = await loadDataset();
      const graded = gradedCandidates(games, query);
      const isBuild = (row: (typeof graded)[number]) => splitFor(row.candidate.season) === 'train';
      const groups = [...Map.groupBy(graded, (row) => GROUPS[groupBy](row.candidate) ?? '')]
        .filter(([label]) => label)
        .map(([label, rows]) => ({
          label,
          all: summarize(rows),
          build: summarize(rows.filter(isBuild)),
          blind: summarize(rows.filter((row) => !isBuild(row))),
        }))
        .filter((group) => group.all.bets >= minBets)
        .sort((a, b) => b.all.roi - a.all.roi);
      const brief = (s: Summary) => ({ bets: s.bets, record: compactSummary(s).record, roi: round(s.roi), units: round(s.units, 1) });
      const row = ({ label, all, build, blind }: (typeof groups)[number]) => ({ label, all: brief(all), buildSeasons: brief(build), blindTest: brief(blind) });
      const leaders = new Set(
        groups.filter((g) => g.build.bets >= minBets / 2).sort((a, b) => b.build.roi - a.build.roi).slice(0, 10).map((g) => g.label),
      );
      return {
        market: query.market,
        groupBy,
        totalBets: graded.length,
        groups: groups.length,
        best: groups.slice(0, 10).map(row),
        worst: groups.slice(-10).reverse().map(row),
        buildLeadersInBlindTest: {
          groups: [...leaders],
          ...brief(summarize(graded.filter((r) => !isBuild(r) && leaders.has(GROUPS[groupBy](r.candidate) ?? '')))),
        },
        note: 'With dozens of groups, some look great by luck. Trust a group edge only if the build-season leaders also won in the blind test.',
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

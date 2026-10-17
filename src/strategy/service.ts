import type { Prisma, Strategy } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { buildTeamIndex, normalizeTeamName } from '../data/teams';
import { gradeCandidate, type DatasetGame, type Selection } from './candidates';
import { loadDataset } from './dataset';
import { buildBoard, featureValues, runBacktest, summarize, type BacktestReport, type Summary } from './engine';
import {
  LEGACY_SLUG,
  legacyParlayRecord,
  legacyPicksFromSnapshots,
  type LegacyPick,
  type LegacySnapshot,
  type UnmatchedLeg,
} from './legacy';
import { strategySpecSchema, type StrategySpec } from './spec';

const json = (value: unknown) => value as Prisma.InputJsonValue;

export const recordBacktest = async (spec: StrategySpec, actor?: string) => {
  const { games, version } = await loadDataset();
  const { report, picks } = runBacktest(spec, games);
  const run = await prisma.backtestRun.create({
    data: { specHash: report.specHash, spec: json(spec), dataVersion: version, report: json(report), createdBy: actor },
  });
  return { run, report, picks };
};

export const replayBacktest = async (runId: string) => {
  const run = await prisma.backtestRun.findUnique({ where: { id: runId }, include: { strategies: true } });
  if (!run) return undefined;
  const spec = strategySpecSchema.parse(run.spec);
  const stored = run.report as unknown as BacktestReport;
  const { games, version } = await loadDataset();
  const { report, picks } = runBacktest(spec, games);
  const reproduced =
    report.specHash === stored.specHash &&
    JSON.stringify([report.splits.train, report.splits.holdout]) ===
      JSON.stringify([stored.splits.train, stored.splits.holdout]);
  return { run, spec, stored, report, picks, reproduced, dataVersion: version };
};

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

const BOARD_LEAD_MS = 48 * 60 * 60 * 1000;

const generateBoard = async (strategy: Strategy, games: DatasetGame[], now: Date, immediate = false) => {
  const spec = strategySpecSchema.parse(strategy.spec);
  const board = buildBoard(spec, games, now);
  const ready =
    board.picks.length === spec.picksPerWeek ||
    (board.picks.length > 0 && (immediate || board.firstKickoff!.getTime() - now.getTime() <= BOARD_LEAD_MS));
  if (!board.week || !ready) return undefined;
  const key = { strategyId: strategy.id, ...board.week };
  if (await prisma.strategyBoard.findUnique({ where: { strategyId_season_seasonType_week: key } })) return undefined;
  await prisma.$transaction([
    prisma.strategyBoard.create({ data: { ...key, generatedAt: now, candidates: board.candidates } }),
    prisma.strategyPick.createMany({
      data: board.picks.map((pick) => ({
        strategyId: strategy.id,
        gameId: pick.gameId,
        season: pick.season,
        seasonType: pick.seasonType,
        week: pick.week,
        market: pick.market,
        selection: pick.selection,
        team: pick.team,
        price: pick.price,
        line: pick.line,
        provider: pick.provider,
        score: pick.strength,
        rank: pick.rank,
        inputs: json(featureValues(pick, spec)),
        pickedAt: now,
      })),
      skipDuplicates: true,
    }),
  ]);
  return { ...board.week, picks: board.picks.length };
};

export const saveStrategy = async (runId: string, actor?: string) => {
  const run = await prisma.backtestRun.findUniqueOrThrow({ where: { id: runId } });
  const spec = strategySpecSchema.parse(run.spec);
  const slug = `${slugify(spec.name)}-${run.specHash.slice(0, 6)}`;
  const existing = await prisma.strategy.findUnique({ where: { slug } });
  if (existing) return existing;
  const strategy = await prisma.strategy.create({
    data: {
      slug,
      name: spec.name,
      summary: spec.summary,
      kind: 'spec',
      spec: json(spec),
      specHash: run.specHash,
      backtestRunId: run.id,
      createdBy: actor,
    },
  });
  const { games } = await loadDataset();
  await generateBoard(strategy, games, new Date(), true);
  return strategy;
};

export const generateBoards = async (now: Date) => {
  const strategies = await prisma.strategy.findMany({ where: { kind: 'spec', archivedAt: null } });
  if (strategies.length === 0) return [];
  const { games } = await loadDataset();
  const boards = [];
  for (const strategy of strategies) {
    const board = await generateBoard(strategy, games, now);
    if (board) boards.push({ slug: strategy.slug, ...board });
  }
  return boards;
};

export const gradeOpenPicks = async (now: Date) => {
  const open = await prisma.strategyPick.findMany({
    where: { result: null, game: { completed: true } },
    include: { game: { select: { completed: true, homePoints: true, awayPoints: true } } },
  });
  const graded = open.flatMap((pick) => {
    const grade = gradeCandidate(
      { market: pick.market as StrategySpec['market'], selection: pick.selection as Selection, price: pick.price, line: pick.line ?? undefined },
      { completed: pick.game.completed, homePoints: pick.game.homePoints ?? undefined, awayPoints: pick.game.awayPoints ?? undefined },
    );
    return grade ? [{ id: pick.id, ...grade }] : [];
  });
  await prisma.$transaction(
    graded.map(({ id, result, profit }) => prisma.strategyPick.update({ where: { id }, data: { result, profit, gradedAt: now } })),
  );
  return graded.length;
};

const loadTeamIndex = async () =>
  buildTeamIndex(
    (await prisma.cfbTeam.findMany()).map((team) => ({
      school: team.school,
      mascot: team.mascot ?? undefined,
      alternateNames: team.alternateNames,
    })),
  );

export type LegacyMeta = {
  lastSnapshotAt?: string;
  unmatched?: UnmatchedLeg[];
  parlays?: { rowsShown: number; unique: number; pending: number; twoLeg: Summary; threeLeg: Summary; computedAt: string };
};

export const refreshLegacyParlays = async (now: Date) => {
  const strategy = await prisma.strategy.findUniqueOrThrow({
    where: { slug: LEGACY_SLUG },
    include: { picks: { select: { team: true, result: true, inputs: true } } },
  });
  const [teamIndex, snapshots] = await Promise.all([
    loadTeamIndex(),
    prisma.$queryRaw<Array<Pick<LegacySnapshot, 'legs'>>>`SELECT "slate"->'legs' AS "legs" FROM "SlateSnapshot"`,
  ]);
  const resultByLeg = new Map(
    strategy.picks.map((pick) => [`${(pick.inputs as LegacyPick['inputs']).oddsApiEventId}:${pick.team}`, pick.result ?? undefined]),
  );
  const record = legacyParlayRecord(snapshots, (leg) =>
    resultByLeg.get(`${leg.gameId}:${teamIndex.get(normalizeTeamName(leg.side))}`),
  );
  const parlays = {
    rowsShown: record.rowsShown,
    unique: record.unique,
    pending: record.pending,
    twoLeg: summarize(record.twoLeg),
    threeLeg: summarize(record.threeLeg),
    computedAt: now.toISOString(),
  };
  await prisma.strategy.update({
    where: { id: strategy.id },
    data: { meta: json({ ...((strategy.meta ?? {}) as LegacyMeta), parlays }) },
  });
  return { unique: parlays.unique, pending: parlays.pending };
};

export const importLegacyPicks = async () => {
  const strategy = await prisma.strategy.upsert({
    where: { slug: LEGACY_SLUG },
    create: {
      slug: LEGACY_SLUG,
      name: 'Pinnacle +EV moneylines',
      summary:
        'The original board: moneylines where the best US price beats Pinnacle’s no-vig line. Each game and side counts once, at the first price we saw.',
      kind: 'legacy',
    },
    update: {},
  });
  const meta = (strategy.meta ?? {}) as LegacyMeta;
  const snapshots = await prisma.$queryRaw<LegacySnapshot[]>`
    SELECT "id", "fetchedAt", "games", "slate"->'legs' AS "legs"
    FROM "SlateSnapshot"
    WHERE "fetchedAt" > ${new Date(meta.lastSnapshotAt ?? 0)}
    ORDER BY "fetchedAt"`;
  if (snapshots.length === 0) return 0;

  const starts = snapshots.flatMap((s) => s.games.map((g) => new Date(g.startsAt).getTime()));
  const day = 24 * 60 * 60 * 1000;
  const [teamIndex, cfbGames, existing] = await Promise.all([
    loadTeamIndex(),
    prisma.cfbGame.findMany({
      where: { startsAt: { gte: new Date(Math.min(...starts) - 2 * day), lte: new Date(Math.max(...starts) + 2 * day) } },
      select: { id: true, homeTeam: true, awayTeam: true, startsAt: true, season: true, seasonType: true, week: true },
    }),
    prisma.strategyPick.findMany({ where: { strategyId: strategy.id }, select: { gameId: true, selection: true } }),
  ]);
  const { picks, unmatched } = legacyPicksFromSnapshots(
    snapshots,
    teamIndex,
    cfbGames,
    new Set(existing.map((pick) => `${pick.gameId}:${pick.selection}`)),
  );
  const unmatchedByKey = new Map([...(meta.unmatched ?? []), ...unmatched].map((leg) => [`${leg.matchup}:${leg.team}`, leg]));
  await prisma.$transaction([
    prisma.strategyPick.createMany({
      data: picks.map(({ inputs, ...pick }) => ({ ...pick, strategyId: strategy.id, market: 'moneyline', inputs: json(inputs) })),
      skipDuplicates: true,
    }),
    prisma.strategy.update({
      where: { id: strategy.id },
      data: {
        meta: json({ ...meta, lastSnapshotAt: snapshots.at(-1)!.fetchedAt.toISOString(), unmatched: [...unmatchedByKey.values()] }),
      },
    }),
  ]);
  return picks.length;
};

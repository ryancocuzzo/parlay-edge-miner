import { prisma } from '@/lib/prisma';
import { withRankings, withTeamForm, type DatasetGame } from './candidates';

const AP_POLL = 'AP Top 25';

let cached: { version: string; games: DatasetGame[] } | undefined;

const datasetVersion = async (): Promise<string> => {
  const [{ _count, _max }, ranks] = await Promise.all([
    prisma.cfbGame.aggregate({ _count: true, _max: { updatedAt: true } }),
    prisma.cfbRanking.count({ where: { poll: AP_POLL } }),
  ]);
  return `${_count}@${_max.updatedAt?.toISOString() ?? 'empty'}+${ranks}`;
};

export const loadDataset = async (): Promise<{ version: string; games: DatasetGame[] }> => {
  const version = await datasetVersion();
  if (cached?.version === version) return cached;
  const [rows, ranks] = await Promise.all([
    prisma.cfbGame.findMany({ include: { lines: true }, orderBy: { startsAt: 'asc' } }),
    prisma.cfbRanking.findMany({
      where: { poll: AP_POLL, seasonType: 'regular' },
      select: { season: true, week: true, school: true, rank: true },
    }),
  ]);
  const games = rows.map(({ updatedAt, lines, ...game }) => ({
    ...game,
    venue: game.venue ?? undefined,
    homeConference: game.homeConference ?? undefined,
    awayConference: game.awayConference ?? undefined,
    homeClassification: game.homeClassification ?? undefined,
    awayClassification: game.awayClassification ?? undefined,
    homePoints: game.homePoints ?? undefined,
    awayPoints: game.awayPoints ?? undefined,
    homeElo: game.homeElo ?? undefined,
    awayElo: game.awayElo ?? undefined,
    lines: lines.map((line) => ({
      provider: line.provider,
      spread: line.spread ?? undefined,
      spreadOpen: line.spreadOpen ?? undefined,
      total: line.total ?? undefined,
      totalOpen: line.totalOpen ?? undefined,
      homeMoneyline: line.homeMoneyline ?? undefined,
      awayMoneyline: line.awayMoneyline ?? undefined,
    })),
  }));
  cached = { version, games: withTeamForm(withRankings(games, ranks)) };
  return cached;
};

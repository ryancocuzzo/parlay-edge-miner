import { prisma } from '@/lib/prisma';
import type { DatasetGame } from './candidates';

let cached: { version: string; games: DatasetGame[] } | undefined;

const datasetVersion = async (): Promise<string> => {
  const { _count, _max } = await prisma.cfbGame.aggregate({ _count: true, _max: { updatedAt: true } });
  return `${_count}@${_max.updatedAt?.toISOString() ?? 'empty'}`;
};

export const loadDataset = async (): Promise<{ version: string; games: DatasetGame[] }> => {
  const version = await datasetVersion();
  if (cached?.version === version) return cached;
  const rows = await prisma.cfbGame.findMany({ include: { lines: true }, orderBy: { startsAt: 'asc' } });
  const games = rows.map(({ updatedAt, lines, ...game }) => ({
    ...game,
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
  cached = { version, games };
  return cached;
};

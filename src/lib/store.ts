import { Prisma } from '@prisma/client';
import { Game, Slate } from '../edge';
import { GameScore } from '../odds-api';
import { SettledSlate, StrategyKey } from '../settle';
import { SlateStore } from '../run';
import { prisma } from './prisma';

const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

export const createSlateStore = (): SlateStore => ({
  createSnapshot: async ({ fetchedAt, games, slate }) => {
    const row = await prisma.slateSnapshot.create({
      data: {
        fetchedAt,
        games: asJson(games),
        slate: asJson(slate),
      },
      select: { id: true },
    });
    return row;
  },

  listUnsettleSnapshots: async () => {
    const rows = await prisma.slateSnapshot.findMany({
      where: { settledAt: null },
      orderBy: { fetchedAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      slate: row.slate as unknown as Slate,
      settledAt: row.settledAt,
    }));
  },

  writeSettlement: async ({ id, settledAt, scores, settled }) => {
    await prisma.slateSnapshot.update({
      where: { id },
      data: {
        settledAt,
        scores: asJson(scores),
        settled: asJson(settled),
      },
    });
  },

  listSettledForWeek: async (weekStart, weekEnd) => {
    const rows = await prisma.slateSnapshot.findMany({
      where: {
        settledAt: { gte: weekStart, lt: weekEnd },
        settled: { not: Prisma.DbNull },
      },
    });
    return rows.map((row) => row.settled as unknown as SettledSlate);
  },

  upsertBenchmark: async ({ strategy, weekStart, n, wins, unitPl, source }) => {
    await prisma.strategyBenchmark.upsert({
      where: {
        strategy_weekStart_source: { strategy, weekStart, source },
      },
      create: { strategy, weekStart, n, wins, unitPl, source },
      update: { n, wins, unitPl },
    });
  },
});

export type SnapshotRow = {
  id: string;
  fetchedAt: Date;
  games: Game[];
  slate: Slate;
  settledAt: Date | undefined;
  scores: GameScore[] | undefined;
  settled: SettledSlate | undefined;
};

export const latestSnapshot = async (): Promise<SnapshotRow | undefined> => {
  const row = await prisma.slateSnapshot.findFirst({ orderBy: { fetchedAt: 'desc' } });
  if (!row) return undefined;
  return {
    id: row.id,
    fetchedAt: row.fetchedAt,
    games: row.games as unknown as Game[],
    slate: row.slate as unknown as Slate,
    settledAt: row.settledAt ?? undefined,
    scores: (row.scores as unknown as GameScore[] | null) ?? undefined,
    settled: (row.settled as unknown as SettledSlate | null) ?? undefined,
  };
};

export const listBenchmarks = async () =>
  prisma.strategyBenchmark.findMany({ orderBy: [{ source: 'asc' }, { weekStart: 'desc' }, { strategy: 'asc' }] });

export const isAllowlisted = async (email: string): Promise<boolean> => {
  const row = await prisma.allowlistUser.findUnique({ where: { email: email.toLowerCase() } });
  return row !== null;
};

export const isAdminEmail = async (email: string): Promise<boolean> => {
  const row = await prisma.allowlistUser.findUnique({ where: { email: email.toLowerCase() } });
  return row?.isAdmin === true;
};

export const listAllowlist = async () =>
  prisma.allowlistUser.findMany({ orderBy: [{ isAdmin: 'desc' }, { email: 'asc' }] });

export const addAllowlist = async (email: string, isAdmin: boolean) =>
  prisma.allowlistUser.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), isAdmin },
    update: { isAdmin },
  });

export const removeAllowlist = async (email: string) =>
  prisma.allowlistUser.delete({ where: { email: email.toLowerCase() } });

export type { StrategyKey };

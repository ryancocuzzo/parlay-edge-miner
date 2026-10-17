import { prisma } from '@/lib/prisma';
import { summarize, type BacktestReport } from './engine';
import type { LegacyMeta } from './service';
import { strategySpecSchema } from './spec';

const gradedSummary = (picks: Array<{ result: string | null; profit: number | null; price: number }>) =>
  summarize(
    picks.flatMap((p) => (p.result && p.profit !== null ? [{ result: p.result as 'win' | 'loss' | 'push', profit: p.profit, price: p.price }] : [])),
  );

export const listStrategies = async () => {
  const strategies = await prisma.strategy.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: 'asc' },
    include: {
      backtestRun: { select: { report: true } },
      picks: { select: { result: true, profit: true, price: true } },
      boards: { orderBy: { generatedAt: 'desc' }, take: 1 },
    },
  });
  return strategies.map((strategy) => ({
    slug: strategy.slug,
    name: strategy.name,
    summary: strategy.summary,
    kind: strategy.kind,
    createdBy: strategy.createdBy ?? undefined,
    live: gradedSummary(strategy.picks),
    open: strategy.picks.filter((p) => !p.result).length,
    backtest: strategy.backtestRun ? (strategy.backtestRun.report as unknown as BacktestReport) : undefined,
    latestBoard: strategy.boards[0],
  }));
};

export const strategyDetail = async (slug: string) => {
  const strategy = await prisma.strategy.findUnique({
    where: { slug },
    include: {
      backtestRun: { select: { id: true, report: true, createdAt: true } },
      boards: { orderBy: { generatedAt: 'desc' } },
      picks: {
        orderBy: [{ season: 'desc' }, { week: 'desc' }, { rank: 'asc' }],
        include: {
          game: { select: { homeTeam: true, awayTeam: true, startsAt: true, completed: true, homePoints: true, awayPoints: true } },
        },
      },
    },
  });
  if (!strategy) return undefined;
  return {
    ...strategy,
    spec: strategy.spec ? strategySpecSchema.parse(strategy.spec) : undefined,
    meta: (strategy.meta ?? {}) as LegacyMeta,
    report: strategy.backtestRun ? (strategy.backtestRun.report as unknown as BacktestReport) : undefined,
    live: gradedSummary(strategy.picks),
  };
};

export type StrategyDetail = NonNullable<Awaited<ReturnType<typeof strategyDetail>>>;
export type StrategyPickRow = StrategyDetail['picks'][number];

import { Game, priceSlate, Slate } from './edge';
import { GameScore } from './odds-api';
import { settleSlate, strategyFromSettled, StrategyKey } from './settle';

export type BacktestFixture = {
  id: string;
  pricedAt: string;
  games: Array<{
    id: string;
    startsAt: string;
    home: string;
    away: string;
    quotes: Game['quotes'];
  }>;
  scores: Array<{
    id: string;
    startsAt: string;
    completed: boolean;
    home: string;
    away: string;
    homeScore?: number;
    awayScore?: number;
  }>;
};

export type StrategyBenchmark = {
  strategy: StrategyKey;
  n: number;
  wins: number;
  hitRate: number;
  unitPl: number;
};

export type BacktestResult = {
  fixtures: number;
  byStrategy: Record<StrategyKey, StrategyBenchmark>;
};

const toGame = (raw: BacktestFixture['games'][number]): Game => ({
  id: raw.id,
  startsAt: new Date(raw.startsAt),
  home: raw.home,
  away: raw.away,
  quotes: raw.quotes,
});

const toScore = (raw: BacktestFixture['scores'][number]): GameScore => ({
  id: raw.id,
  startsAt: new Date(raw.startsAt),
  completed: raw.completed,
  home: raw.home,
  away: raw.away,
  homeScore: raw.homeScore,
  awayScore: raw.awayScore,
});

export const priceFixture = (fixture: BacktestFixture): Slate =>
  priceSlate(fixture.games.map(toGame), new Date(fixture.pricedAt));

export const runBacktest = (fixtures: BacktestFixture[]): BacktestResult => {
  const totals: Record<StrategyKey, { n: number; wins: number; unitPl: number }> = {
    single: { n: 0, wins: 0, unitPl: 0 },
    two_leg: { n: 0, wins: 0, unitPl: 0 },
    three_leg: { n: 0, wins: 0, unitPl: 0 },
  };

  for (const fixture of fixtures) {
    const settled = settleSlate(priceFixture(fixture), fixture.scores.map(toScore));
    const byStrategy = strategyFromSettled(settled);
    for (const key of Object.keys(totals) as StrategyKey[]) {
      totals[key].n += byStrategy[key].n;
      totals[key].wins += byStrategy[key].wins;
      totals[key].unitPl += byStrategy[key].unitPl;
    }
  }

  const byStrategy = Object.fromEntries(
    (Object.keys(totals) as StrategyKey[]).map((strategy) => [
      strategy,
      {
        strategy,
        n: totals[strategy].n,
        wins: totals[strategy].wins,
        hitRate: totals[strategy].n === 0 ? 0 : totals[strategy].wins / totals[strategy].n,
        unitPl: totals[strategy].unitPl,
      },
    ]),
  ) as Record<StrategyKey, StrategyBenchmark>;

  return { fixtures: fixtures.length, byStrategy };
};

/** Fixed numbers from fixtures/ncaaf — change fixtures and these together. */
export const FIXTURE_BENCHMARKS = {
  single: { n: 4, wins: 2, hitRate: 0.5, unitPl: 1 },
  two_leg: { n: 4, wins: 1, hitRate: 0.25, unitPl: 2.25 },
  three_leg: { n: 0, wins: 0, hitRate: 0, unitPl: 0 },
} as const;

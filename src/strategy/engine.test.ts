import { describe, expect, it } from 'vitest';
import gamesJson from '../../fixtures/cfbd/games.json';
import { candidatesForGame, gradeCandidate, type DatasetGame } from './candidates';
import { prepareScorer, runBacktest, selectWeek, specHash, summarize, verdictFor } from './engine';
import { strategySpecSchema, type StrategySpec } from './spec';

const games: DatasetGame[] = gamesJson.map((game) => ({ ...game, startsAt: new Date(game.startsAt) }));
const gameById = (id: number) => games.find((game) => game.id === id)!;

const underdogEloSpec: StrategySpec = {
  name: 'Elo-backed underdogs',
  summary: 'Moneyline underdogs that Elo rates better than the market does.',
  market: 'moneyline',
  filters: [{ feature: 'isFavorite', max: 0 }],
  score: [{ feature: 'eloEdge', weight: 1 }],
  picksPerWeek: 3,
};

describe('candidatesForGame', () => {
  it('builds spread candidates from the median closing line seen from each side', () => {
    const game = gameById(401520276);

    const away = candidatesForGame(game, 'spread').find((c) => c.selection === 'away')!;

    expect(away.team).toBe('Jacksonville State');
    expect(away.line).toBe(-6.5);
    expect(away.features.spreadMove).toBeCloseTo(-0.25);
    expect(away.features.eloDiff).toBe(109);
    expect(away.features.eloSpreadEdge).toBeCloseTo(109 / 25 - 6.5);
  });

  it('line-shops moneylines across allowed books and keeps a consensus no-vig probability', () => {
    const game = gameById(401752718);

    const [home, away] = candidatesForGame(game, 'moneyline');
    const draftKingsOnly = candidatesForGame(game, 'moneyline', ['DraftKings']).find((c) => c.selection === 'away')!;

    expect(away.price).toBe(135);
    expect(away.provider).toBe('Bovada');
    expect(draftKingsOnly.price).toBe(120);
    expect(home.features.marketProb! + away.features.marketProb!).toBeCloseTo(1);
    expect(away.features.isFavorite).toBe(0);
  });
});

describe('gradeCandidate', () => {
  it('grades moneyline, spread and total bets against the final score', () => {
    const game = gameById(401520276);
    const [moneyline, spread, total] = [
      candidatesForGame(game, 'moneyline').find((c) => c.selection === 'away')!,
      candidatesForGame(game, 'spread').find((c) => c.selection === 'away')!,
      candidatesForGame(game, 'total').find((c) => c.selection === 'under')!,
    ];

    expect(gradeCandidate(moneyline, game)?.result).toBe('win');
    expect(gradeCandidate(moneyline, game)?.profit).toBeCloseTo(0.4);
    expect(gradeCandidate(spread, game)?.profit).toBeCloseTo(100 / 110);
    expect(gradeCandidate(total, game)).toEqual({ result: 'loss', profit: -1 });
  });

  it('pushes when the margin lands exactly on the number', () => {
    const grade = gradeCandidate(
      { market: 'spread', selection: 'home', price: -110, line: -3 },
      { completed: true, homePoints: 24, awayPoints: 21 },
    );

    expect(grade).toEqual({ result: 'push', profit: 0 });
  });
});

describe('selection and backtest', () => {
  it('takes the strongest eligible pick per game, capped at picksPerWeek, ranked by strength', () => {
    const week = games.filter((g) => g.season === 2025).flatMap((g) => candidatesForGame(g, 'moneyline'));
    const scorer = prepareScorer(underdogEloSpec, week);

    const picks = selectWeek(underdogEloSpec, week, scorer);

    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((p) => p.gameId)).size).toBe(3);
    expect(picks.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(picks.every((p) => p.features.isFavorite === 0)).toBe(true);
    expect(picks[0].strength).toBeGreaterThanOrEqual(picks[2].strength);
  });

  it('is deterministic and splits train (≤2023) from holdout (2024–2025) results', () => {
    const first = runBacktest(underdogEloSpec, games);
    const second = runBacktest(underdogEloSpec, games);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.report.splits.train.bets).toBe(3);
    expect(first.report.splits.holdout.bets).toBe(3);
    expect(first.report.splits.live.bets).toBe(0);
    expect(first.report.outOfSample.units).toBeCloseTo(
      first.picks.filter((p) => p.season > 2023).reduce((sum, p) => sum + p.profit, 0),
    );
    expect(first.report.verdict.level).toBe('thin');
  });
});

describe('summarize and verdict', () => {
  it('computes record, ROI and drawdown from graded picks', () => {
    const summary = summarize([
      { result: 'win', profit: 1, price: 100 },
      { result: 'loss', profit: -1, price: 100 },
      { result: 'push', profit: 0, price: 100 },
    ]);

    expect(summary).toMatchObject({ bets: 3, wins: 1, losses: 1, pushes: 1, hitRate: 0.5, units: 0, maxDrawdown: 1 });
  });

  it('only calls an edge proven when the out-of-sample confidence interval clears zero', () => {
    const base = summarize(Array.from({ length: 60 }, () => ({ result: 'loss' as const, profit: -1, price: 100 })));

    expect(verdictFor({ ...base, roi: 0.1, roiLow: 0.02, roiHigh: 0.18 }).level).toBe('proven');
    expect(verdictFor({ ...base, roi: 0.05, roiLow: -0.03, roiHigh: 0.13 }).level).toBe('promising');
    expect(verdictFor(base).level).toBe('losing');
  });
});

describe('strategy spec', () => {
  it('hashes rules, not names, so identical rules prove identical results', () => {
    const renamed = { ...underdogEloSpec, name: 'Same rules, new name' };
    const changed = { ...underdogEloSpec, picksPerWeek: 5 };

    expect(specHash(renamed)).toBe(specHash(underdogEloSpec));
    expect(specHash(changed)).not.toBe(specHash(underdogEloSpec));
  });

  it('rejects features that do not exist for the chosen market', () => {
    const result = strategySpecSchema.safeParse({ ...underdogEloSpec, market: 'total' });

    expect(result.success).toBe(false);
  });
});

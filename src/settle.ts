import { Leg, Parlay, Slate } from './edge';
import { GameScore } from './odds-api';

export type SettledLeg = Leg & { won: boolean; profit: number };
export type SettledParlay = Omit<Parlay, 'legs'> & {
  legs: SettledLeg[];
  won: boolean;
  profit: number;
};

export type SettledSlate = {
  legs: SettledLeg[];
  parlays: SettledParlay[];
  singles: { n: number; wins: number; unitPl: number };
  twoLegs: { n: number; wins: number; unitPl: number };
  threeLegs: { n: number; wins: number; unitPl: number };
};

export type StrategyKey = 'single' | 'two_leg' | 'three_leg';

const winnerSide = (score: GameScore): string | undefined => {
  if (!score.completed || score.homeScore === undefined || score.awayScore === undefined) {
    return undefined;
  }
  if (score.homeScore === score.awayScore) return undefined;
  return score.homeScore > score.awayScore ? score.home : score.away;
};

const settleLeg = (leg: Leg, scoresById: Map<string, GameScore>): SettledLeg | undefined => {
  const score = scoresById.get(leg.gameId);
  if (!score) return undefined;
  const winner = winnerSide(score);
  if (winner === undefined) return undefined;
  const won = leg.side === winner;
  return { ...leg, won, profit: won ? leg.decimal - 1 : -1 };
};

const settleParlay = (
  parlay: Parlay,
  scoresById: Map<string, GameScore>,
): SettledParlay | undefined => {
  const legs: SettledLeg[] = [];
  for (const leg of parlay.legs) {
    const settled = settleLeg(leg, scoresById);
    if (!settled) return undefined;
    legs.push(settled);
  }
  const won = legs.every((leg) => leg.won);
  return { ...parlay, legs, won, profit: won ? parlay.decimal - 1 : -1 };
};

const emptyBucket = (): { n: number; wins: number; unitPl: number } => ({
  n: 0,
  wins: 0,
  unitPl: 0,
});

const add = (
  bucket: { n: number; wins: number; unitPl: number },
  won: boolean,
  profit: number,
): void => {
  bucket.n += 1;
  if (won) bucket.wins += 1;
  bucket.unitPl += profit;
};

export const settleSlate = (slate: Slate, scores: GameScore[]): SettledSlate => {
  const scoresById = new Map(scores.map((score) => [score.id, score]));
  const legs = slate.legs
    .map((leg) => settleLeg(leg, scoresById))
    .filter((leg): leg is SettledLeg => leg !== undefined);
  const parlays = slate.parlays
    .map((parlay) => settleParlay(parlay, scoresById))
    .filter((parlay): parlay is SettledParlay => parlay !== undefined);

  const singles = emptyBucket();
  const twoLegs = emptyBucket();
  const threeLegs = emptyBucket();
  for (const leg of legs) add(singles, leg.won, leg.profit);
  for (const parlay of parlays) {
    if (parlay.legs.length === 2) add(twoLegs, parlay.won, parlay.profit);
    if (parlay.legs.length === 3) add(threeLegs, parlay.won, parlay.profit);
  }

  return { legs, parlays, singles, twoLegs, threeLegs };
};

export const hitRate = (wins: number, n: number): number => (n === 0 ? 0 : wins / n);

export const strategyFromSettled = (
  settled: SettledSlate,
): Record<StrategyKey, { n: number; wins: number; unitPl: number; hitRate: number }> => ({
  single: { ...settled.singles, hitRate: hitRate(settled.singles.wins, settled.singles.n) },
  two_leg: { ...settled.twoLegs, hitRate: hitRate(settled.twoLegs.wins, settled.twoLegs.n) },
  three_leg: {
    ...settled.threeLegs,
    hitRate: hitRate(settled.threeLegs.wins, settled.threeLegs.n),
  },
});

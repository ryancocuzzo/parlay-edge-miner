export const SHARP_BOOK = 'pinnacle';
export const SLATE_HOURS = 30;

export type Side = 'home' | 'away';

export type Quote = {
  book: string;
  bookTitle: string;
  side: Side;
  american: number;
};

export type Game = {
  id: string;
  startsAt: Date;
  home: string;
  away: string;
  quotes: Quote[];
};

export type Leg = {
  gameId: string;
  side: string;
  book: string;
  bookTitle: string;
  american: number;
  decimal: number;
  fair: number;
  ev: number;
};

export type Parlay = {
  legs: Leg[];
  decimal: number;
  fair: number;
  ev: number;
};

export type Slate = {
  gamesInWindow: number;
  pricedGames: number;
  legs: Leg[];
  parlays: Parlay[];
};

const isAmerican = (odds: number): boolean =>
  Number.isFinite(odds) && (odds <= -100 || odds >= 100);

export const americanToDecimal = (american: number): number => {
  if (!isAmerican(american)) throw new Error(`Invalid American odds: ${american}`);
  return american > 0 ? 1 + american / 100 : 1 + 100 / -american;
};

export const impliedProbability = (american: number): number => 1 / americanToDecimal(american);

export const devig = (homeImplied: number, awayImplied: number): { home: number; away: number } => {
  const sum = homeImplied + awayImplied;
  if (sum <= 0) throw new Error('Cannot devig a market with no probability');
  return { home: homeImplied / sum, away: awayImplied / sum };
};

const expectedValue = (fair: number, decimal: number): number => fair * decimal - 1;

const bestQuote = (quotes: Quote[], side: Side, sharpBook: string): Quote | undefined => {
  let best: Quote | undefined;
  for (const quote of quotes) {
    if (quote.side !== side || quote.book === sharpBook || !isAmerican(quote.american)) continue;
    if (!best || americanToDecimal(quote.american) > americanToDecimal(best.american)) best = quote;
  }
  return best;
};

export const priceGame = (game: Game, sharpBook: string): Leg[] | undefined => {
  const homeAmerican = game.quotes.find(
    (quote) => quote.book === sharpBook && quote.side === 'home' && isAmerican(quote.american),
  )?.american;
  const awayAmerican = game.quotes.find(
    (quote) => quote.book === sharpBook && quote.side === 'away' && isAmerican(quote.american),
  )?.american;
  if (homeAmerican === undefined || awayAmerican === undefined) return undefined;

  const fair = devig(impliedProbability(homeAmerican), impliedProbability(awayAmerican));
  const legs: Leg[] = [];
  for (const side of ['home', 'away'] as const) {
    const quote = bestQuote(game.quotes, side, sharpBook);
    if (!quote) continue;
    const decimal = americanToDecimal(quote.american);
    const sideFair = side === 'home' ? fair.home : fair.away;
    legs.push({
      gameId: game.id,
      side: side === 'home' ? game.home : game.away,
      book: quote.book,
      bookTitle: quote.bookTitle,
      american: quote.american,
      decimal,
      fair: sideFair,
      ev: expectedValue(sideFair, decimal),
    });
  }
  return legs;
};

const sameGame = (legs: Leg[]): boolean => new Set(legs.map((leg) => leg.gameId)).size !== legs.length;

const combinations = (legs: Leg[]): Leg[][] => {
  const groups: Leg[][] = [];
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) groups.push([legs[i], legs[j]]);
  }
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      for (let k = j + 1; k < legs.length; k++) groups.push([legs[i], legs[j], legs[k]]);
    }
  }
  return groups;
};

// Product of the single prices, assuming independent legs. Books usually add more juice, so this EV is an upper bound.
export const parlaysFromLegs = (legs: Leg[]): Parlay[] => {
  const positive = legs.filter((leg) => leg.ev > 0);
  const parlays: Parlay[] = [];
  for (const group of combinations(positive)) {
    if (sameGame(group)) continue;
    const decimal = group.reduce((product, leg) => product * leg.decimal, 1);
    const fair = group.reduce((product, leg) => product * leg.fair, 1);
    parlays.push({ legs: group, decimal, fair, ev: expectedValue(fair, decimal) });
  }
  return parlays.sort((a, b) => b.ev - a.ev);
};

export const priceSlate = (games: Game[], now: Date, sharpBook = SHARP_BOOK): Slate => {
  const windowEnd = now.getTime() + SLATE_HOURS * 60 * 60 * 1000;
  const inWindow = games.filter((game) => {
    const start = game.startsAt.getTime();
    return start > now.getTime() && start <= windowEnd;
  });

  const legs: Leg[] = [];
  let pricedGames = 0;
  for (const game of inWindow) {
    const priced = priceGame(game, sharpBook);
    if (!priced) continue;
    pricedGames++;
    legs.push(...priced.filter((leg) => leg.ev > 0));
  }

  return {
    gamesInWindow: inWindow.length,
    pricedGames,
    legs: legs.sort((a, b) => b.ev - a.ev),
    parlays: parlaysFromLegs(legs),
  };
};

const formatAmerican = (american: number): string => {
  const rounded = Math.round(american);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
};

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

const formatLeg = (leg: Leg): string =>
  `${leg.side} ${formatAmerican(leg.american)} ${leg.bookTitle}  ev ${pct(leg.ev)}  fair ${pct(leg.fair)}`;

export const formatReport = (slate: Slate): string => {
  const byGame = new Map<string, Leg[]>();
  for (const leg of slate.legs) {
    const group = byGame.get(leg.gameId);
    if (group) group.push(leg);
    else byGame.set(leg.gameId, [leg]);
  }
  const arbs = [...byGame.values()].filter((group) => group.length >= 2);

  const lines: string[] = [];
  if (arbs.length > 0) {
    lines.push('Arbs', ...arbs.map((group) => group.map(formatLeg).join(' | ')), '');
  }
  lines.push(slate.legs.length > 0 ? 'Legs' : 'No +EV legs');
  lines.push(...slate.legs.map(formatLeg), '');
  const top = slate.parlays.slice(0, 5);
  lines.push(top.length > 0 ? 'Parlays' : 'No +EV parlays');
  top.forEach((parlay, index) => {
    const desc = parlay.legs
      .map((leg) => `${leg.side} ${formatAmerican(leg.american)} ${leg.bookTitle}`)
      .join(' | ');
    lines.push(`${index + 1}. ${pct(parlay.ev)}  ${desc}`);
  });
  return lines.join('\n');
};

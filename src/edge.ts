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

export type Slate = {
  gamesInWindow: number;
  pricedGames: number;
  legs: Leg[];
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
  };
};

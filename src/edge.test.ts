import { describe, expect, it } from 'vitest';
import { americanToDecimal, devig, Game, impliedProbability, priceGame, priceSlate, Quote } from './edge';

const quote = (book: string, title: string, side: 'home' | 'away', american: number): Quote => ({
  book,
  bookTitle: title,
  side,
  american,
});

const game = (id: string, startsAt: Date, quotes: Quote[]): Game => ({
  id,
  startsAt,
  home: `${id} Home`,
  away: `${id} Away`,
  quotes,
});

const evenSharp = (): Quote[] => [
  quote('pinnacle', 'Pinnacle', 'home', -110),
  quote('pinnacle', 'Pinnacle', 'away', -110),
];

describe('american odds', () => {
  it('converts positive and negative prices', () => {
    expect(americanToDecimal(150)).toBeCloseTo(2.5);
    expect(impliedProbability(150)).toBeCloseTo(0.4);
    expect(americanToDecimal(-200)).toBeCloseTo(1.5);
    expect(impliedProbability(-200)).toBeCloseTo(2 / 3);
  });

  it('rejects prices that are not American odds', () => {
    expect(() => americanToDecimal(1.91)).toThrow('Invalid American odds');
  });

  it('removes the vig from a two-way market', () => {
    expect(devig(impliedProbability(-110), impliedProbability(-110))).toEqual({ home: 0.5, away: 0.5 });
  });
});

describe('priceGame', () => {
  it('uses the sharp fair price and the best other American price', () => {
    const priced = priceGame(
      game('g', new Date(), [
        ...evenSharp(),
        quote('draftkings', 'DraftKings', 'home', 150),
        quote('draftkings', 'DraftKings', 'away', -200),
        quote('fanduel', 'FanDuel', 'home', 140),
        quote('fanduel', 'FanDuel', 'away', -180),
      ]),
      'pinnacle',
    );

    expect(priced).toHaveLength(2);
    const home = priced?.find((leg) => leg.side === 'g Home');
    const away = priced?.find((leg) => leg.side === 'g Away');
    expect(home).toMatchObject({ book: 'draftkings', american: 150, fair: 0.5 });
    expect(home?.ev).toBeCloseTo(0.25);
    expect(away).toMatchObject({ book: 'fanduel', american: -180 });
    expect(away?.ev).toBeCloseTo(0.5 * (1 + 100 / 180) - 1);
  });

  it('returns undefined when the sharp book is missing a side', () => {
    expect(
      priceGame(game('g', new Date(), [quote('pinnacle', 'Pinnacle', 'home', -110)]), 'pinnacle'),
    ).toBeUndefined();
  });
});

describe('priceSlate', () => {
  it('keeps +EV legs for games starting inside the window, best EV first', () => {
    const now = new Date('2026-09-21T15:00:00Z');
    const slate = priceSlate(
      [
        game('a', new Date('2026-09-21T20:00:00Z'), [...evenSharp(), quote('draftkings', 'DraftKings', 'home', 150)]),
        game('b', new Date('2026-09-21T23:00:00Z'), [...evenSharp(), quote('fanduel', 'FanDuel', 'away', 120)]),
        game('later', new Date('2026-09-23T20:00:00Z'), [...evenSharp(), quote('draftkings', 'DraftKings', 'home', 150)]),
      ],
      now,
    );

    expect(slate.gamesInWindow).toBe(2);
    expect(slate.pricedGames).toBe(2);
    expect(slate.legs.map((leg) => leg.side)).toEqual(['a Home', 'b Away']);
  });
});

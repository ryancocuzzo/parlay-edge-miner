import { describe, expect, it } from 'vitest';
import { settleSlate } from './settle';
import { priceSlate, type Game, type Quote } from './edge';

const quote = (book: string, title: string, side: 'home' | 'away', american: number): Quote => ({
  book,
  bookTitle: title,
  side,
  american,
});

describe('settleSlate', () => {
  it('grades singles and parlays from final scores', () => {
    const now = new Date('2025-09-20T12:00:00Z');
    const games: Game[] = [
      {
        id: 'g1',
        startsAt: new Date('2025-09-20T19:00:00Z'),
        home: 'Michigan',
        away: 'Ohio State',
        quotes: [
          quote('pinnacle', 'Pinnacle', 'home', -110),
          quote('pinnacle', 'Pinnacle', 'away', -110),
          quote('draftkings', 'DraftKings', 'home', 150),
          quote('fanduel', 'FanDuel', 'away', 150),
        ],
      },
      {
        id: 'g2',
        startsAt: new Date('2025-09-20T23:00:00Z'),
        home: 'Alabama',
        away: 'Georgia',
        quotes: [
          quote('pinnacle', 'Pinnacle', 'home', -110),
          quote('pinnacle', 'Pinnacle', 'away', -110),
          quote('draftkings', 'DraftKings', 'home', 150),
          quote('fanduel', 'FanDuel', 'away', 150),
        ],
      },
    ];
    const slate = priceSlate(games, now);
    const settled = settleSlate(slate, [
      {
        id: 'g1',
        startsAt: new Date('2025-09-20T19:00:00Z'),
        completed: true,
        home: 'Michigan',
        away: 'Ohio State',
        homeScore: 31,
        awayScore: 24,
      },
      {
        id: 'g2',
        startsAt: new Date('2025-09-20T23:00:00Z'),
        completed: true,
        home: 'Alabama',
        away: 'Georgia',
        homeScore: 28,
        awayScore: 21,
      },
    ]);
    expect(settled.singles).toEqual({ n: 4, wins: 2, unitPl: 1 });
    expect(settled.twoLegs.wins).toBe(1);
    expect(settled.legs.filter((leg) => leg.won).map((leg) => leg.side).sort()).toEqual([
      'Alabama',
      'Michigan',
    ]);
  });
});

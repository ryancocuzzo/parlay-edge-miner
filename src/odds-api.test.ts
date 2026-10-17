import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearOddsApiCache, toGames, toScores, fetchNcaafOdds } from './odds-api';

const event = {
  id: 'game-1',
  commence_time: '2025-09-20T23:10:00Z',
  home_team: 'Michigan',
  away_team: 'Ohio State',
  bookmakers: [
    {
      key: 'pinnacle',
      title: 'Pinnacle',
      markets: [
        {
          key: 'h2h',
          outcomes: [
            { name: 'Michigan', price: -120 },
            { name: 'Ohio State', price: 110 },
          ],
        },
        {
          key: 'spreads',
          outcomes: [
            { name: 'Michigan', price: -110, point: -3.5 },
            { name: 'Ohio State', price: -110, point: 3.5 },
          ],
        },
      ],
    },
    {
      key: 'draftkings',
      title: 'DraftKings',
      markets: [
        {
          key: 'h2h',
          outcomes: [
            { name: 'Michigan', price: -130 },
            { name: 'Ohio State', price: 105 },
            { name: 'Draw', price: 900 },
          ],
        },
      ],
    },
  ],
};

afterEach(() => {
  clearOddsApiCache();
  vi.unstubAllGlobals();
});

describe('toGames', () => {
  it('keeps two-way moneylines and drops other markets', () => {
    const [game] = toGames([event]);
    expect(game.home).toBe('Michigan');
    expect(game.startsAt.toISOString()).toBe('2025-09-20T23:10:00.000Z');
    expect(game.quotes).toEqual([
      { book: 'pinnacle', bookTitle: 'Pinnacle', side: 'home', american: -120 },
      { book: 'pinnacle', bookTitle: 'Pinnacle', side: 'away', american: 110 },
    ]);
  });

  it('rejects a payload that is not the odds API shape', () => {
    expect(() => toGames([{ id: 'x' }])).toThrow();
  });
});

describe('toScores', () => {
  it('parses completed NCAAF scores', () => {
    const [score] = toScores([
      {
        id: 'game-1',
        commence_time: '2025-09-20T23:10:00Z',
        completed: true,
        home_team: 'Michigan',
        away_team: 'Ohio State',
        scores: [
          { name: 'Michigan', score: '31' },
          { name: 'Ohio State', score: '24' },
        ],
      },
    ]);
    expect(score).toMatchObject({
      id: 'game-1',
      completed: true,
      home: 'Michigan',
      away: 'Ohio State',
      homeScore: 31,
      awayScore: 24,
    });
  });
});

describe('fetchNcaafOdds cache', () => {
  it('reuses an in-flight TTL cache for expensive re-requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [event],
    });
    vi.stubGlobal('fetch', fetchMock);
    const first = await fetchNcaafOdds('test-key');
    const second = await fetchNcaafOdds('test-key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first[0]?.home).toBe('Michigan');
  });
});

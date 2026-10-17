import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearOddsApiCache, toGames, fetchNcaafOdds } from './odds-api';

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

describe('fetchNcaafOdds', () => {
  const calls: Array<{ path: string; status: number; remaining?: number }> = [];
  const input = (remaining?: number) => ({
    apiKey: 'test-key',
    remainingCredits: async () => remaining,
    recordCall: async (call: { path: string; status: number; remaining?: number }) => {
      calls.push(call);
    },
  });

  it('records the call with remaining credits and caches the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([event]), { headers: { 'x-requests-remaining': '312' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchNcaafOdds(input(400));
    const second = await fetchNcaafOdds(input(400));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(calls.at(-1)).toMatchObject({ status: 200, remaining: 312 });
    expect(calls.at(-1)?.path).not.toContain('test-key');
  });

  it('refuses to spend the reserve', async () => {
    vi.stubGlobal('fetch', vi.fn());

    await expect(fetchNcaafOdds(input(10))).rejects.toThrow('reserve');
  });
});

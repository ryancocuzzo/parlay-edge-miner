import { z } from 'zod';
import { Game, Quote } from './edge';
import type { ApiCallRecorder } from './data/cfbd';

export const NCAAF_SPORT = 'americanfootball_ncaaf';
export const ODDS_RESERVE_CREDITS = 25;
export const ODDS_CACHE_TTL_MS = 5 * 60 * 1000;

const eventSchema = z.object({
  id: z.string(),
  commence_time: z.string().datetime(),
  home_team: z.string(),
  away_team: z.string(),
  bookmakers: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      markets: z.array(
        z.object({
          key: z.string(),
          outcomes: z.array(z.object({ name: z.string(), price: z.number() })),
        }),
      ),
    }),
  ),
});

let cache: { key: string; expiresAt: number; games: Game[] } | undefined;

export const clearOddsApiCache = (): void => {
  cache = undefined;
};

export const toGames = (payload: unknown): Game[] =>
  eventSchema.array().parse(payload).map((event) => {
    const quotes: Quote[] = [];
    for (const book of event.bookmakers) {
      const market = book.markets.find((candidate) => candidate.key === 'h2h');
      if (!market || market.outcomes.length !== 2) continue;
      const home = market.outcomes.find((outcome) => outcome.name === event.home_team);
      const away = market.outcomes.find((outcome) => outcome.name === event.away_team);
      if (!home || !away) continue;
      quotes.push(
        { book: book.key, bookTitle: book.title, side: 'home', american: home.price },
        { book: book.key, bookTitle: book.title, side: 'away', american: away.price },
      );
    }
    return {
      id: event.id,
      startsAt: new Date(event.commence_time),
      home: event.home_team,
      away: event.away_team,
      quotes,
    };
  });

export const fetchNcaafOdds = async (input: {
  apiKey: string;
  remainingCredits: () => Promise<number | undefined>;
  recordCall: ApiCallRecorder;
}): Promise<Game[]> => {
  const key = input.apiKey.slice(0, 8);
  if (cache?.key === key && cache.expiresAt > Date.now()) return cache.games;
  const remaining = await input.remainingCredits();
  if (remaining !== undefined && remaining <= ODDS_RESERVE_CREDITS) {
    throw new Error(`Odds API budget reserve reached (${remaining} credits left this month)`);
  }
  const path = `/v4/sports/${NCAAF_SPORT}/odds?regions=us,eu&markets=h2h&oddsFormat=american`;
  const response = await fetch(`https://api.the-odds-api.com${path}&apiKey=${input.apiKey}`);
  const header = response.headers.get('x-requests-remaining');
  await input.recordCall({ path, status: response.status, remaining: header === null ? undefined : Number(header) });
  if (!response.ok) throw new Error(`Odds API ${response.status}: ${await response.text()}`);
  const games = toGames(await response.json());
  cache = { key, expiresAt: Date.now() + ODDS_CACHE_TTL_MS, games };
  return games;
};

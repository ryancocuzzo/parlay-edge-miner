import { z } from 'zod';
import { Game, Quote } from './edge';

export const NCAAF_SPORT = 'americanfootball_ncaaf';

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

const scoreSchema = z.object({
  id: z.string(),
  commence_time: z.string().datetime(),
  completed: z.boolean(),
  home_team: z.string(),
  away_team: z.string(),
  scores: z
    .array(z.object({ name: z.string(), score: z.string() }))
    .nullable()
    .optional(),
});

export type GameScore = {
  id: string;
  startsAt: Date;
  completed: boolean;
  home: string;
  away: string;
  homeScore?: number;
  awayScore?: number;
};

type CacheEntry<T> = { expiresAt: number; value: T };

const memoryCache = new Map<string, CacheEntry<unknown>>();

export const ODDS_CACHE_TTL_MS = 5 * 60 * 1000;
export const SCORES_CACHE_TTL_MS = 60 * 1000;

export const clearOddsApiCache = (): void => {
  memoryCache.clear();
};

const cached = async <T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> => {
  const hit = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await load();
  memoryCache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
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

export const toScores = (payload: unknown): GameScore[] =>
  scoreSchema.array().parse(payload).map((event) => {
    const homeRaw = event.scores?.find((row) => row.name === event.home_team)?.score;
    const awayRaw = event.scores?.find((row) => row.name === event.away_team)?.score;
    const homeScore = homeRaw === undefined ? undefined : Number(homeRaw);
    const awayScore = awayRaw === undefined ? undefined : Number(awayRaw);
    return {
      id: event.id,
      startsAt: new Date(event.commence_time),
      completed: event.completed,
      home: event.home_team,
      away: event.away_team,
      homeScore: Number.isFinite(homeScore) ? homeScore : undefined,
      awayScore: Number.isFinite(awayScore) ? awayScore : undefined,
    };
  });

const fetchJson = async (url: URL): Promise<unknown> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Odds API ${response.status}: ${await response.text()}`);
  }
  return response.json();
};

export const fetchNcaafOdds = async (apiKey: string): Promise<Game[]> =>
  cached(`odds:${NCAAF_SPORT}:${apiKey.slice(0, 8)}`, ODDS_CACHE_TTL_MS, async () => {
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${NCAAF_SPORT}/odds`);
    url.searchParams.set('apiKey', apiKey);
    url.searchParams.set('regions', 'us,eu');
    url.searchParams.set('markets', 'h2h');
    url.searchParams.set('oddsFormat', 'american');
    return toGames(await fetchJson(url));
  });

export const fetchNcaafScores = async (apiKey: string, daysFrom = 3): Promise<GameScore[]> =>
  cached(`scores:${NCAAF_SPORT}:${daysFrom}:${apiKey.slice(0, 8)}`, SCORES_CACHE_TTL_MS, async () => {
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${NCAAF_SPORT}/scores`);
    url.searchParams.set('apiKey', apiKey);
    url.searchParams.set('daysFrom', String(daysFrom));
    url.searchParams.set('dateFormat', 'iso');
    return toScores(await fetchJson(url));
  });

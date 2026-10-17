import { SHARP_BOOK, type Leg, type Quote } from '../edge';
import { matchGame, normalizeTeamName, type SchedulableGame } from '../data/teams';
import type { Grade } from './candidates';

export const LEGACY_SLUG = 'pinnacle-ev-legacy';

export type LegacySnapshot = {
  id: string;
  fetchedAt: Date;
  games: Array<{ id: string; home: string; away: string; startsAt: string; quotes: Quote[] }>;
  legs: Leg[];
};

type CfbScheduleGame = SchedulableGame & { season: number; seasonType: string; week: number };

export type LegacyPick = {
  gameId: number;
  season: number;
  seasonType: string;
  week: number;
  selection: 'home' | 'away';
  team: string;
  price: number;
  provider: string;
  score: number;
  rank: number;
  pickedAt: Date;
  inputs: { fair: number; ev: number; pinnacleHome?: number; pinnacleAway?: number; oddsApiEventId: string; snapshotId: string };
};

export type UnmatchedLeg = { team: string; matchup: string; startsAt: string };

export const legacyPicksFromSnapshots = (
  snapshots: LegacySnapshot[],
  teamIndex: Map<string, string>,
  cfbGames: CfbScheduleGame[],
  existingKeys: Set<string>,
): { picks: LegacyPick[]; unmatched: UnmatchedLeg[] } => {
  const seen = new Set(existingKeys);
  const unmatched = new Map<string, UnmatchedLeg>();
  const picks: LegacyPick[] = [];

  for (const snapshot of [...snapshots].sort((a, b) => a.fetchedAt.getTime() - b.fetchedAt.getTime())) {
    const eventsById = new Map(snapshot.games.map((game) => [game.id, game]));
    snapshot.legs.forEach((leg, index) => {
      const event = eventsById.get(leg.gameId);
      const game = event && matchGame({ ...event, startsAt: new Date(event.startsAt) }, teamIndex, cfbGames);
      if (!event || !game) {
        unmatched.set(`${leg.gameId}:${leg.side}`, {
          team: leg.side,
          matchup: event ? `${event.away} @ ${event.home}` : leg.gameId,
          startsAt: event?.startsAt ?? '',
        });
        return;
      }
      const selection = teamIndex.get(normalizeTeamName(leg.side)) === game.homeTeam ? 'home' : 'away';
      const key = `${game.id}:${selection}`;
      if (seen.has(key)) return;
      seen.add(key);
      const pinnacle = (side: 'home' | 'away') =>
        event.quotes.find((quote) => quote.book === SHARP_BOOK && quote.side === side)?.american;
      picks.push({
        gameId: game.id,
        season: game.season,
        seasonType: game.seasonType,
        week: game.week,
        selection,
        team: selection === 'home' ? game.homeTeam : game.awayTeam,
        price: leg.american,
        provider: leg.bookTitle,
        score: Math.round(leg.ev * 1000) / 10,
        rank: index + 1,
        pickedAt: snapshot.fetchedAt,
        inputs: {
          fair: leg.fair,
          ev: leg.ev,
          pinnacleHome: pinnacle('home'),
          pinnacleAway: pinnacle('away'),
          oddsApiEventId: leg.gameId,
          snapshotId: snapshot.id,
        },
      });
    });
  }
  return { picks, unmatched: [...unmatched.values()] };
};

const decimalToAmerican = (decimal: number): number =>
  Math.round(decimal >= 2 ? (decimal - 1) * 100 : -100 / (decimal - 1));

const combosOf = (legs: Leg[]): Leg[][] =>
  legs.flatMap((first, i) =>
    legs.slice(i + 1).flatMap((second, j) => [
      [first, second],
      ...legs.slice(i + j + 2).map((third) => [first, second, third]),
    ]),
  );

export const legacyParlayRecord = (
  snapshots: Array<Pick<LegacySnapshot, 'legs'>>,
  resultForLeg: (leg: Leg) => string | undefined,
) => {
  const unique = new Map<string, Leg[]>();
  let rowsShown = 0;
  for (const { legs } of snapshots) {
    for (const combo of combosOf(legs.filter((leg) => leg.ev > 0))) {
      if (new Set(combo.map((leg) => leg.gameId)).size !== combo.length) continue;
      rowsShown += 1;
      const key = combo.map((leg) => `${leg.gameId}:${leg.side}`).sort().join('|');
      if (!unique.has(key)) unique.set(key, combo);
    }
  }
  const graded: Record<2 | 3, Array<Grade & { price: number }>> = { 2: [], 3: [] };
  let pending = 0;
  for (const combo of unique.values()) {
    const results = combo.map(resultForLeg);
    const decimal = combo.reduce((product, leg) => product * leg.decimal, 1);
    const price = decimalToAmerican(decimal);
    const size = combo.length as 2 | 3;
    if (results.includes('loss')) graded[size].push({ result: 'loss', profit: -1, price });
    else if (results.includes(undefined)) pending += 1;
    else {
      const payout = combo.reduce((product, leg, i) => product * (results[i] === 'win' ? leg.decimal : 1), 1);
      graded[size].push({ result: payout > 1 ? 'win' : 'push', profit: payout - 1, price });
    }
  }
  return { rowsShown, unique: unique.size, pending, twoLeg: graded[2], threeLeg: graded[3] };
};

export type TeamNames = { school: string; mascot?: string; alternateNames: string[] };

export const normalizeTeamName = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');

export const buildTeamIndex = (teams: TeamNames[]): Map<string, string> => {
  const owners = new Map<string, Set<string>>();
  for (const team of teams) {
    for (const name of new Set([team.school, ...team.alternateNames])) {
      const key = normalizeTeamName(`${name} ${team.mascot ?? ''}`);
      owners.set(key, (owners.get(key) ?? new Set()).add(team.school));
    }
  }
  return new Map(
    [...owners].filter(([, schools]) => schools.size === 1).map(([key, schools]) => [key, [...schools][0]]),
  );
};

export type SchedulableGame = { id: number; homeTeam: string; awayTeam: string; startsAt: Date };

const MATCH_WINDOW_MS = 36 * 60 * 60 * 1000;

export const matchGame = <G extends SchedulableGame>(
  event: { home: string; away: string; startsAt: Date },
  index: Map<string, string>,
  games: G[],
): G | undefined => {
  const home = index.get(normalizeTeamName(event.home));
  const away = index.get(normalizeTeamName(event.away));
  if (!home || !away) return undefined;
  return games.find(
    (game) =>
      Math.abs(game.startsAt.getTime() - event.startsAt.getTime()) <= MATCH_WINDOW_MS &&
      ((game.homeTeam === home && game.awayTeam === away) || (game.homeTeam === away && game.awayTeam === home)),
  );
};

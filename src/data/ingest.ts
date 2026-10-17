import type { PrismaClient } from '@prisma/client';
import type { CfbdClient, CfbdGame, CfbdGameLines } from './cfbd';

export const FIRST_HISTORY_SEASON = 2019;
export const CURRENT_SEASON_REFRESH_MS = 12 * 60 * 60 * 1000;

export const seasonFor = (date: Date): number =>
  date.getUTCMonth() < 6 ? date.getUTCFullYear() - 1 : date.getUTCFullYear();

const TRACKED_CLASSIFICATIONS = new Set(['fbs', 'fcs']);

export const toGameRows = (games: CfbdGame[], now: Date) =>
  games
    .filter(
      (game) =>
        TRACKED_CLASSIFICATIONS.has(game.homeClassification ?? '') ||
        TRACKED_CLASSIFICATIONS.has(game.awayClassification ?? ''),
    )
    .map((game) => ({
      id: game.id,
      season: game.season,
      week: game.week,
      seasonType: game.seasonType,
      startsAt: game.startDate,
      completed: game.completed,
      neutralSite: game.neutralSite,
      conferenceGame: game.conferenceGame,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeConference: game.homeConference,
      awayConference: game.awayConference,
      homeClassification: game.homeClassification,
      awayClassification: game.awayClassification,
      homePoints: game.homePoints,
      awayPoints: game.awayPoints,
      homeElo: game.homePregameElo === undefined ? undefined : Math.round(game.homePregameElo),
      awayElo: game.awayPregameElo === undefined ? undefined : Math.round(game.awayPregameElo),
      updatedAt: now.toISOString(),
    }));

export const toLineRows = (gameLines: CfbdGameLines[], gameIds: Set<number>) =>
  gameLines
    .filter((game) => gameIds.has(game.id))
    .flatMap((game) =>
      game.lines.map((line) => ({
        gameId: game.id,
        provider: line.provider,
        spread: line.spread,
        spreadOpen: line.spreadOpen,
        total: line.overUnder,
        totalOpen: line.overUnderOpen,
        homeMoneyline: line.homeMoneyline,
        awayMoneyline: line.awayMoneyline,
      })),
    );

const GAME_COLUMNS = [
  'season',
  'week',
  'seasonType',
  'startsAt',
  'completed',
  'neutralSite',
  'conferenceGame',
  'homeTeam',
  'awayTeam',
  'homeConference',
  'awayConference',
  'homeClassification',
  'awayClassification',
  'homePoints',
  'awayPoints',
  'homeElo',
  'awayElo',
  'updatedAt',
].map((column) => `"${column}"`);

export const syncSeason = async (prisma: PrismaClient, client: CfbdClient, season: number) => {
  const [games, lines] = await Promise.all([client.games(season), client.lines(season)]);
  const gameRows = toGameRows(games, new Date());
  const lineRows = toLineRows(lines, new Set(gameRows.map((row) => row.id)));
  const columns = ['"id"', ...GAME_COLUMNS].join(', ');
  const updates = GAME_COLUMNS.map((column) => `${column} = EXCLUDED.${column}`).join(', ');

  await prisma.$transaction([
    prisma.$executeRawUnsafe(
      `INSERT INTO "CfbGame" (${columns}) SELECT ${columns} FROM json_populate_recordset(NULL::"CfbGame", $1::json) ON CONFLICT ("id") DO UPDATE SET ${updates}`,
      JSON.stringify(gameRows),
    ),
    prisma.$executeRawUnsafe(
      `DELETE FROM "GameLine" WHERE "gameId" IN (SELECT "id" FROM "CfbGame" WHERE "season" = $1)`,
      season,
    ),
    prisma.$executeRawUnsafe(
      `INSERT INTO "GameLine" SELECT * FROM json_populate_recordset(NULL::"GameLine", $1::json)`,
      JSON.stringify(lineRows),
    ),
  ]);
  return { season, games: gameRows.length, lines: lineRows.length };
};

export const syncTeams = async (prisma: PrismaClient, client: CfbdClient) => {
  const teams = await client.teams();
  await prisma.$transaction([
    prisma.cfbTeam.deleteMany(),
    prisma.cfbTeam.createMany({
      data: teams.map((team) => ({
        id: team.id,
        school: team.school,
        mascot: team.mascot,
        alternateNames: team.alternateNames ?? [],
        conference: team.conference,
        classification: team.classification,
      })),
    }),
  ]);
  return teams.length;
};

export const syncCfbd = async (prisma: PrismaClient, client: CfbdClient, now: Date) => {
  const currentSeason = seasonFor(now);
  const storedSeasons = new Set(
    (await prisma.cfbGame.groupBy({ by: ['season'] })).map((row) => row.season),
  );
  const lastCurrentSync = await prisma.apiCall.findFirst({
    where: { api: 'cfbd', path: `/games?year=${currentSeason}`, status: 200 },
    orderBy: { createdAt: 'desc' },
  });
  const missingHistory = Array.from(
    { length: currentSeason - FIRST_HISTORY_SEASON },
    (_, offset) => FIRST_HISTORY_SEASON + offset,
  ).filter((season) => !storedSeasons.has(season));
  const currentStale =
    !lastCurrentSync || now.getTime() - lastCurrentSync.createdAt.getTime() > CURRENT_SEASON_REFRESH_MS;

  const teams = (await prisma.cfbTeam.count()) === 0 ? await syncTeams(prisma, client) : undefined;
  const synced = [];
  for (const season of [...missingHistory, ...(currentStale ? [currentSeason] : [])]) {
    synced.push(await syncSeason(prisma, client, season));
  }
  return { teams, synced };
};

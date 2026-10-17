import { z } from 'zod';

const CFBD_BASE = 'https://api.collegefootballdata.com';
export const CFBD_RESERVE_CALLS = 50;

const optional = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullish().transform((value) => value ?? undefined);

const gameSchema = z.object({
  id: z.number().int(),
  season: z.number().int(),
  week: z.number().int(),
  seasonType: z.string(),
  startDate: z.string(),
  completed: z.boolean(),
  neutralSite: z.boolean(),
  conferenceGame: z.boolean(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  homeConference: optional(z.string()),
  awayConference: optional(z.string()),
  homeClassification: optional(z.string()),
  awayClassification: optional(z.string()),
  homePoints: optional(z.number().int()),
  awayPoints: optional(z.number().int()),
  homePregameElo: optional(z.number()),
  awayPregameElo: optional(z.number()),
});

const lineSchema = z.object({
  provider: z.string(),
  spread: optional(z.number()),
  spreadOpen: optional(z.number()),
  overUnder: optional(z.number()),
  overUnderOpen: optional(z.number()),
  homeMoneyline: optional(z.number()),
  awayMoneyline: optional(z.number()),
});

const gameLinesSchema = z.object({ id: z.number().int(), lines: z.array(lineSchema) });

const teamSchema = z.object({
  id: z.number().int(),
  school: z.string(),
  mascot: optional(z.string()),
  alternateNames: optional(z.array(z.string())),
  conference: optional(z.string()),
  classification: optional(z.string()),
});

export type CfbdGame = z.infer<typeof gameSchema>;
export type CfbdGameLines = z.infer<typeof gameLinesSchema>;
export type CfbdTeam = z.infer<typeof teamSchema>;

export type ApiCallRecorder = (call: { path: string; status: number; remaining?: number }) => Promise<void>;

export type CfbdClient = {
  games: (season: number) => Promise<CfbdGame[]>;
  lines: (season: number) => Promise<CfbdGameLines[]>;
  teams: () => Promise<CfbdTeam[]>;
};

export const createCfbdClient = (input: {
  apiKey: string;
  remainingCalls: () => Promise<number | undefined>;
  recordCall: ApiCallRecorder;
}): CfbdClient => {
  const get = async <T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> => {
    const remaining = await input.remainingCalls();
    if (remaining !== undefined && remaining <= CFBD_RESERVE_CALLS) {
      throw new Error(`CFBD budget reserve reached (${remaining} calls left this month)`);
    }
    const response = await fetch(`${CFBD_BASE}${path}`, {
      headers: { Authorization: `Bearer ${input.apiKey}` },
    });
    const header = response.headers.get('x-calllimit-remaining');
    await input.recordCall({
      path,
      status: response.status,
      remaining: header === null ? undefined : Number(header),
    });
    if (!response.ok) throw new Error(`CFBD ${response.status} ${path}: ${await response.text()}`);
    return schema.parse(await response.json());
  };

  return {
    games: (season) => get(`/games?year=${season}`, z.array(gameSchema)),
    lines: (season) => get(`/lines?year=${season}`, z.array(gameLinesSchema)),
    teams: () => get('/teams', z.array(teamSchema)),
  };
};

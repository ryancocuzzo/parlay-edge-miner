import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { syncCfbd } from './data/ingest';
import { appCfbdClient, latestRemaining, recordApiCall } from './data/usage';
import { priceSlate } from './edge';
import { advanceFactory } from './factory/service';
import { fetchNcaafOdds } from './odds-api';
import { generateBoards, gradeOpenPicks, importLegacyPicks, refreshLegacyParlays } from './strategy/service';

const refreshLegacySlate = async (now: Date) => {
  const games = await fetchNcaafOdds({
    apiKey: z.string().min(1).parse(process.env.ODDS_API_KEY),
    remainingCredits: () => latestRemaining('odds'),
    recordCall: recordApiCall('odds'),
  });
  const slate = priceSlate(games, now);
  await prisma.slateSnapshot.create({
    data: {
      fetchedAt: now,
      games: games as unknown as Prisma.InputJsonValue,
      slate: slate as unknown as Prisma.InputJsonValue,
    },
  });
  return { gamesInWindow: slate.gamesInWindow, legs: slate.legs.length };
};

const JOBS = [
  ['legacySlate', refreshLegacySlate],
  ['cfbd', (now: Date) => syncCfbd(prisma, appCfbdClient(), now)],
  ['legacyImport', () => importLegacyPicks()],
  ['grade', gradeOpenPicks],
  ['legacyParlays', refreshLegacyParlays],
  ['boards', generateBoards],
  ['factory', advanceFactory],
] as const;

export const runScheduledJobs = async (now: Date) => {
  const results: Record<string, unknown> = {};
  for (const [name, job] of JOBS) {
    try {
      results[name] = await job(now);
    } catch (error) {
      results[name] = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  const failed = Object.entries(results).filter(([, value]) => value && typeof value === 'object' && 'error' in value);
  return { ok: failed.length === 0, results };
};

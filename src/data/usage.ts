import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createCfbdClient } from './cfbd';

const startOfUtcMonth = (now: Date): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export const recordApiCall =
  (api: string, actor?: string) =>
  async (call: { path: string; status: number; remaining?: number }): Promise<void> => {
    await prisma.apiCall.create({ data: { api, actor, ...call } });
  };

export const latestRemaining = async (api: string): Promise<number | undefined> => {
  const latest = await prisma.apiCall.findFirst({
    where: { api, remaining: { not: null }, createdAt: { gte: startOfUtcMonth(new Date()) } },
    orderBy: { createdAt: 'desc' },
  });
  return latest?.remaining ?? undefined;
};

export const callsSince = (api: string, since: Date, actor?: string): Promise<number> =>
  prisma.apiCall.count({ where: { api, actor, createdAt: { gte: since } } });

export const appCfbdClient = () =>
  createCfbdClient({
    apiKey: z.string().min(1).parse(process.env.CFBD_API_KEY),
    remainingCalls: () => latestRemaining('cfbd'),
    recordCall: recordApiCall('cfbd'),
  });

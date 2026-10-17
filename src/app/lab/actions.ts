'use server';

import { requireUser } from '@/auth';
import { saveStrategy } from '@/strategy/service';

export async function saveStrategyFromRun(runId: string): Promise<string> {
  const user = await requireUser();
  return (await saveStrategy(runId, user.email)).slug;
}

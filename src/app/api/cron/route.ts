import { NextResponse } from 'next/server';
import { runScheduledJobs } from '@/jobs';

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const outcome = await runScheduledJobs(new Date());
  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 500 });
}

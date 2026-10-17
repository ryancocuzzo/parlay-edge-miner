import { NextResponse } from 'next/server';
import { parseEnv } from '@/env';
import { createSlateStore } from '@/lib/store';
import { refreshSlate, settleOpenSnapshots, rollupStrategyBenchmarks, seedFixtureBenchmarks } from '@/run';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BacktestFixture } from '@/backtest';

const authorized = (request: Request): boolean => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
};

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const job = url.searchParams.get('job') ?? 'all';
  const env = parseEnv(process.env);
  const store = createSlateStore();
  const result: Record<string, unknown> = {};

  if (job === 'refresh' || job === 'all') {
    result.refresh = await refreshSlate({
      oddsApiKey: env.oddsApiKey,
      store,
      twilio: env.twilio,
    });
  }
  if (job === 'settle' || job === 'all') {
    result.settled = await settleOpenSnapshots({ oddsApiKey: env.oddsApiKey, store });
  }
  if (job === 'rollup' || job === 'weekly') {
    await rollupStrategyBenchmarks({ store });
    result.rollup = true;
  }
  if (job === 'seed-fixtures') {
    const fixtures = JSON.parse(
      readFileSync(join(process.cwd(), 'fixtures/ncaaf/week-1.json'), 'utf8'),
    ) as BacktestFixture[];
    await seedFixtureBenchmarks({ store, fixtures });
    result.seeded = true;
  }

  return NextResponse.json({ ok: true, result });
}

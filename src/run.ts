import { formatReport, priceSlate, SHARP_BOOK, SLATE_HOURS, Slate, Game } from './edge';
import { fetchNcaafOdds, fetchNcaafScores, GameScore } from './odds-api';
import { settleSlate, SettledSlate, strategyFromSettled, StrategyKey } from './settle';
import { FIXTURE_BENCHMARKS, runBacktest, BacktestFixture } from './backtest';

export type TwilioConfig = {
  sid: string;
  token: string;
  from: string;
  to: string;
};

export type SlateStore = {
  createSnapshot: (input: {
    fetchedAt: Date;
    games: Game[];
    slate: Omit<Slate, never>;
  }) => Promise<{ id: string }>;
  listUnsettleSnapshots: () => Promise<
    Array<{ id: string; slate: Slate; settledAt: Date | null }>
  >;
  writeSettlement: (input: {
    id: string;
    settledAt: Date;
    scores: GameScore[];
    settled: SettledSlate;
  }) => Promise<void>;
  listSettledForWeek: (weekStart: Date, weekEnd: Date) => Promise<SettledSlate[]>;
  upsertBenchmark: (input: {
    strategy: StrategyKey;
    weekStart: Date;
    n: number;
    wins: number;
    unitPl: number;
    source: 'fixture' | 'live';
  }) => Promise<void>;
};

const sendSms = async (twilio: TwilioConfig, body: string): Promise<void> => {
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilio.sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${twilio.sid}:${twilio.token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: twilio.to, From: twilio.from, Body: body }),
    },
  );
  if (!response.ok) throw new Error(`Twilio ${response.status}: ${await response.text()}`);
};

export const run = async (input: {
  oddsApiKey: string;
  twilio?: TwilioConfig;
  now?: Date;
}): Promise<string> => {
  const slate = priceSlate(await fetchNcaafOdds(input.oddsApiKey), input.now ?? new Date());
  if (slate.gamesInWindow === 0) {
    throw new Error(`No NCAAF games starting in the next ${SLATE_HOURS} hours`);
  }
  if (slate.pricedGames === 0) {
    throw new Error(`No games had a two-way ${SHARP_BOOK} moneyline`);
  }
  const text = formatReport(slate);
  if (input.twilio && slate.legs.length > 0) await sendSms(input.twilio, text);
  return text;
};

export const refreshSlate = async (input: {
  oddsApiKey: string;
  store: SlateStore;
  twilio?: TwilioConfig;
  now?: Date;
}): Promise<{ id: string; report: string }> => {
  const now = input.now ?? new Date();
  const games = await fetchNcaafOdds(input.oddsApiKey);
  const slate = priceSlate(games, now);
  const { id } = await input.store.createSnapshot({ fetchedAt: now, games, slate });
  const report = formatReport(slate);
  if (input.twilio && slate.legs.length > 0) await sendSms(input.twilio, report);
  return { id, report };
};

export const settleOpenSnapshots = async (input: {
  oddsApiKey: string;
  store: SlateStore;
}): Promise<number> => {
  const open = await input.store.listUnsettleSnapshots();
  if (open.length === 0) return 0;
  const scores = await fetchNcaafScores(input.oddsApiKey, 3);
  let settledCount = 0;
  for (const snapshot of open) {
    const settled = settleSlate(snapshot.slate, scores);
    if (settled.legs.length === 0 && settled.parlays.length === 0) continue;
    await input.store.writeSettlement({
      id: snapshot.id,
      settledAt: new Date(),
      scores,
      settled,
    });
    settledCount += 1;
  }
  return settledCount;
};

export const weekStartUtc = (date: Date): Date => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
};

export const rollupStrategyBenchmarks = async (input: {
  store: SlateStore;
  weekStart?: Date;
}): Promise<void> => {
  const start = input.weekStart ?? weekStartUtc(new Date());
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  const settled = await input.store.listSettledForWeek(start, end);
  const totals: Record<StrategyKey, { n: number; wins: number; unitPl: number }> = {
    single: { n: 0, wins: 0, unitPl: 0 },
    two_leg: { n: 0, wins: 0, unitPl: 0 },
    three_leg: { n: 0, wins: 0, unitPl: 0 },
  };
  for (const slate of settled) {
    const byStrategy = strategyFromSettled(slate);
    for (const key of Object.keys(totals) as StrategyKey[]) {
      totals[key].n += byStrategy[key].n;
      totals[key].wins += byStrategy[key].wins;
      totals[key].unitPl += byStrategy[key].unitPl;
    }
  }
  for (const strategy of Object.keys(totals) as StrategyKey[]) {
    await input.store.upsertBenchmark({
      strategy,
      weekStart: start,
      n: totals[strategy].n,
      wins: totals[strategy].wins,
      unitPl: totals[strategy].unitPl,
      source: 'live',
    });
  }
};

export const seedFixtureBenchmarks = async (input: {
  store: SlateStore;
  fixtures: BacktestFixture[];
  weekStart?: Date;
}): Promise<void> => {
  const result = runBacktest(input.fixtures);
  const start = input.weekStart ?? new Date(Date.UTC(1970, 0, 5));
  for (const strategy of Object.keys(result.byStrategy) as StrategyKey[]) {
    const row = result.byStrategy[strategy];
    await input.store.upsertBenchmark({
      strategy,
      weekStart: start,
      n: row.n,
      wins: row.wins,
      unitPl: row.unitPl,
      source: 'fixture',
    });
  }
};

export { FIXTURE_BENCHMARKS };

import { describe, expect, it } from 'vitest';
import { reviewChanges } from './deploy-guard';
import { estimateCost, limitsFor, outcomeOf, outOfQuotaMessage, quota } from './policy';

const now = new Date('2026-10-18T18:00:00Z');
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

describe('quota', () => {
  it('counts feature requests per rolling hour and day', () => {
    const result = quota(now, [minutesAgo(10), minutesAgo(90), minutesAgo(600)], { perHour: 2, perDay: 5 });

    expect(result).toMatchObject({ hourLeft: 1, dayLeft: 2, nextAt: undefined });
  });

  it('says when the next hourly slot opens once the hour is used up', () => {
    const result = quota(now, [minutesAgo(50), minutesAgo(20)], { perHour: 2, perDay: 5 });

    expect(result.hourLeft).toBe(0);
    expect(result.nextAt).toEqual(minutesAgo(50 - 60));
    expect(outOfQuotaMessage(result)).toContain('2 feature requests for this hour');
  });

  it('prefers the daily limit when both are exhausted and lets per-user overrides win', () => {
    const limits = limitsFor({ perHour: 2, perDay: 5 }, { factoryPerHour: null, factoryPerDay: 1 });

    const result = quota(now, [minutesAgo(30)], limits);

    expect(limits).toEqual({ perHour: 2, perDay: 1 });
    expect(result).toMatchObject({ hourLeft: 1, dayLeft: 0 });
    expect(result.nextAt).toEqual(minutesAgo(30 - 24 * 60));
  });
});

describe('estimateCost', () => {
  it('prices every token bucket at its own rate', () => {
    const cost = estimateCost(
      { inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 2_000_000, cacheWriteTokens: 0 },
      { inputUsdPerM: 2, outputUsdPerM: 10, cacheReadUsdPerM: 0.1, cacheWriteUsdPerM: 2.5 },
    );

    expect(cost).toBeCloseTo(2 + 1 + 0.2);
  });
});

describe('deploy guard', () => {
  it('allows ordinary feature work and additive migrations', () => {
    const violations = reviewChanges(
      [
        { status: 'M', path: 'src/strategy/engine.ts' },
        { status: 'A', path: 'prisma/migrations/3_streaks/migration.sql' },
        { status: 'M', path: 'prisma/schema.prisma' },
      ],
      { 'prisma/migrations/3_streaks/migration.sql': 'ALTER TABLE "Strategy" ADD COLUMN "streak" INTEGER;' },
    );

    expect(violations).toEqual([]);
  });

  it('blocks protected files, edited migrations, destructive SQL and protected tables', () => {
    const violations = reviewChanges(
      [
        { status: 'M', path: 'src/auth.ts' },
        { status: 'M', path: 'src/app/admin/page.tsx' },
        { status: 'A', path: '.env.local' },
        { status: 'M', path: 'prisma/migrations/0_init/migration.sql' },
        { status: 'A', path: 'prisma/migrations/3_x/migration.sql' },
      ],
      { 'prisma/migrations/3_x/migration.sql': 'DROP TABLE "ChatThread"; ALTER TABLE "AllowlistUser" ADD COLUMN "x" TEXT;' },
    );

    expect(violations).toEqual([
      'protected file changed: src/auth.ts',
      'protected file changed: src/app/admin/page.tsx',
      'protected file changed: .env.local',
      'existing migration modified: prisma/migrations/0_init/migration.sql',
      'destructive SQL in prisma/migrations/3_x/migration.sql',
      'migration touches AllowlistUser in prisma/migrations/3_x/migration.sql',
    ]);
  });

  it('does not mistake similarly named files or foreign-key actions for violations', () => {
    const fk = 'ALTER TABLE "Note" ADD CONSTRAINT "Note_fkey" FOREIGN KEY ("id") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;';

    expect(reviewChanges([{ status: 'M', path: 'src/authors.ts' }], {})).toEqual([]);
    expect(reviewChanges([], { 'prisma/migrations/3_notes/migration.sql': fk })).toEqual([]);
    expect(reviewChanges([], { 'prisma/migrations/3_x/migration.sql': 'DELETE FROM "Strategy";' })).toHaveLength(1);
  });
});

describe('outcomeOf', () => {
  const run = { id: 'run-1', status: 'FINISHED' as const, updatedAt: now, result: 'Added a streak column to Track record.', git: { branches: [{ branch: 'main' }] } };

  it('moves a finished run that pushed to main into deploying', () => {
    expect(outcomeOf(run)).toEqual({ status: 'deploying', detail: 'Added a streak column to Track record.' });
  });

  it('honors a builder decline and flags runs that pushed nothing', () => {
    expect(outcomeOf({ ...run, result: 'DECLINED: That needs a new paid data source.' })).toEqual({
      status: 'declined',
      detail: 'That needs a new paid data source.',
    });
    expect(outcomeOf({ ...run, git: undefined })?.status).toBe('failed');
    expect(outcomeOf({ ...run, status: 'RUNNING' })).toBeUndefined();
    expect(outcomeOf({ ...run, status: 'ERROR' })?.status).toBe('failed');
  });
});

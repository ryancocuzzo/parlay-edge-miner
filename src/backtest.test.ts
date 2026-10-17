import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FIXTURE_BENCHMARKS, runBacktest, type BacktestFixture } from './backtest';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'ncaaf');
const fixtures = JSON.parse(readFileSync(join(fixturesDir, 'week-1.json'), 'utf8')) as BacktestFixture[];

describe('runBacktest', () => {
  it('matches committed fixture benchmarks for each strategy', () => {
    const result = runBacktest(fixtures);
    for (const strategy of ['single', 'two_leg', 'three_leg'] as const) {
      const actual = result.byStrategy[strategy];
      const expected = FIXTURE_BENCHMARKS[strategy];
      expect(actual.n).toBe(expected.n);
      expect(actual.wins).toBe(expected.wins);
      expect(actual.hitRate).toBeCloseTo(expected.hitRate);
      expect(actual.unitPl).toBeCloseTo(expected.unitPl);
    }
  });
});

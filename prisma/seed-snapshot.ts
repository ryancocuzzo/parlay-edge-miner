import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { priceFixture, type BacktestFixture } from '../src/backtest';

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  const fixtures = JSON.parse(
    readFileSync('fixtures/ncaaf/week-1.json', 'utf8'),
  ) as BacktestFixture[];
  const fixture = fixtures[0]!;
  await prisma.slateSnapshot.create({
    data: {
      fetchedAt: new Date(fixture.pricedAt),
      games: fixture.games,
      slate: priceFixture(fixture),
    },
  });
  console.log('seeded fixture slate snapshot');
};

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

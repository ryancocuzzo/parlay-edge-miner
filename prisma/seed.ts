import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSlateStore } from '../src/lib/store';
import { seedFixtureBenchmarks } from '../src/run';
import type { BacktestFixture } from '../src/backtest';

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'ryancocuzzo@gmail.com').toLowerCase();
  await prisma.allowlistUser.upsert({
    where: { email: adminEmail },
    create: { email: adminEmail, isAdmin: true },
    update: { isAdmin: true },
  });

  const fixtures = JSON.parse(
    readFileSync(join(process.cwd(), 'fixtures/ncaaf/week-1.json'), 'utf8'),
  ) as BacktestFixture[];
  await seedFixtureBenchmarks({ store: createSlateStore(), fixtures });
  console.log(`Seeded admin ${adminEmail} and fixture benchmarks`);
};

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { addAllowlist } from '../src/allowlist';
import { prisma } from '../src/lib/prisma';

const main = async (): Promise<void> => {
  const admin = await addAllowlist(process.env.ADMIN_EMAIL ?? 'ryancocuzzo@gmail.com', true);
  console.log(`Seeded admin ${admin.email}`);
};

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { prisma } from './lib/prisma';

export const normalizeEmail = (email: string): string => {
  const [local = '', domain = ''] = email.trim().toLowerCase().split('@');
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return `${local}@${domain}`;
  return `${local.split('+')[0]!.replace(/\./g, '')}@gmail.com`;
};

export const findAllowlisted = (email: string) =>
  prisma.allowlistUser.findUnique({ where: { email: normalizeEmail(email) } });

export const MAX_USERS = 10;

export const admitUser = (email: string): Promise<boolean> =>
  prisma.$transaction(
    async (tx) => {
      const normalized = normalizeEmail(email);
      if (await tx.allowlistUser.findUnique({ where: { email: normalized } })) return true;
      if ((await tx.allowlistUser.count()) >= MAX_USERS) return false;
      await tx.allowlistUser.create({ data: { email: normalized } });
      return true;
    },
    { isolationLevel: 'Serializable' },
  );

export const listAllowlist = () => prisma.allowlistUser.findMany({ orderBy: [{ isAdmin: 'desc' }, { email: 'asc' }] });

export const addAllowlist = (email: string, isAdmin: boolean) =>
  prisma.allowlistUser.upsert({
    where: { email: normalizeEmail(email) },
    create: { email: normalizeEmail(email), isAdmin },
    update: { isAdmin },
  });

export const removeAllowlist = (email: string) => prisma.allowlistUser.delete({ where: { email: normalizeEmail(email) } });

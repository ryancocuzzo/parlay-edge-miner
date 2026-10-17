import { prisma } from './lib/prisma';

export const normalizeEmail = (email: string): string => {
  const [local = '', domain = ''] = email.trim().toLowerCase().split('@');
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return `${local}@${domain}`;
  return `${local.split('+')[0]!.replace(/\./g, '')}@gmail.com`;
};

export const findAllowlisted = (email: string) =>
  prisma.allowlistUser.findUnique({ where: { email: normalizeEmail(email) } });

export const listAllowlist = () => prisma.allowlistUser.findMany({ orderBy: [{ isAdmin: 'desc' }, { email: 'asc' }] });

export const addAllowlist = (email: string, isAdmin: boolean) =>
  prisma.allowlistUser.upsert({
    where: { email: normalizeEmail(email) },
    create: { email: normalizeEmail(email), isAdmin },
    update: { isAdmin },
  });

export const removeAllowlist = (email: string) => prisma.allowlistUser.delete({ where: { email: normalizeEmail(email) } });

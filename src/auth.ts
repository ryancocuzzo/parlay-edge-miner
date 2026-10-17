import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Nodemailer from 'next-auth/providers/nodemailer';
import { prisma } from './lib/prisma';
import { isAllowlisted } from './lib/store';
import { authConfig } from './auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM ?? 'noreply@parlay-edge.local',
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      return isAllowlisted(email);
    },
    async session({ session }) {
      if (session.user?.email) {
        session.user.email = session.user.email.toLowerCase();
      }
      return session;
    },
  },
});

import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  providers: [],
  pages: {
    signIn: '/login',
    verifyRequest: '/login/verify',
    error: '/login',
  },
  callbacks: {
    authorized() {
      return true;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;

import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';

const PUBLIC_PATHS = ['/login', '/privacy', '/api/auth', '/api/cron'];

export const authConfig = {
  providers: [Google],
  pages: { signIn: '/login', error: '/login' },
  session: { strategy: 'jwt' },
  callbacks: {
    authorized({ auth, request }) {
      return Boolean(auth?.user) || PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;

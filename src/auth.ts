import NextAuth from 'next-auth';
import { admitUser } from './allowlist';
import { authConfig } from './auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      return Boolean(user.email && (await admitUser(user.email)));
    },
  },
});

export const requireUser = async () => {
  const session = await auth();
  if (!session?.user?.email) throw new Error('Not signed in');
  return { email: session.user.email, name: session.user.name ?? undefined, image: session.user.image ?? undefined };
};

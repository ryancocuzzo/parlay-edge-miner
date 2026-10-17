import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import { findAllowlisted } from '@/allowlist';
import { auth, signOut } from '@/auth';
import { TabBar, TopNav } from '@/components/nav';
import './globals.css';

const sans = Geist({ subsets: ['latin'], variable: '--font-sans' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'NCAAF Edge',
  description: 'Build, backtest and track college football betting strategies',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f6f7f9',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const email = session?.user?.email ?? undefined;
  const isAdmin = email ? (await findAllowlisted(email))?.isAdmin === true : false;

  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className={email ? 'signed-in' : undefined}>
        <header className="top">
          <Link href="/" className="brand">
            <span className="logo" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 17l5-5 4 3 7-8" />
              </svg>
            </span>
            NCAAF Edge
          </Link>
          {email && (
            <>
              <TopNav isAdmin={isAdmin} />
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/login' });
                }}
              >
                <button type="submit" className="avatar" title={`Signed in as ${email} — sign out`}>
                  {session?.user?.image ? <img src={session.user.image} alt="" referrerPolicy="no-referrer" /> : email[0]?.toUpperCase()}
                </button>
              </form>
            </>
          )}
        </header>
        <main className="shell">{children}</main>
        {email && <TabBar isAdmin={isAdmin} />}
      </body>
    </html>
  );
}

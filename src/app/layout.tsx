import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Barlow_Condensed, Source_Sans_3, IBM_Plex_Mono } from 'next/font/google';
import { findAllowlisted } from '@/allowlist';
import { auth, signOut } from '@/auth';
import { TabBar } from '@/components/nav';
import './globals.css';

const display = Barlow_Condensed({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-display' });
const body = Source_Sans_3({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-body' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'NCAAF Edge',
  description: 'Build, backtest and track college football betting strategies',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#eef1f4',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const email = session?.user?.email ?? undefined;
  const isAdmin = email ? (await findAllowlisted(email))?.isAdmin === true : false;

  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className={email ? 'signed-in' : undefined}>
        <header className="top">
          <Link href="/" className="brand">
            NCAAF Edge
          </Link>
          {email && (
            <>
              <nav className="topnav">
                <Link href="/">Strategies</Link>
                <Link href="/lab">Lab</Link>
                {isAdmin && <Link href="/admin">Admin</Link>}
              </nav>
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

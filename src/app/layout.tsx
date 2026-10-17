import type { Metadata } from 'next';
import Link from 'next/link';
import { Barlow_Condensed, Source_Sans_3, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const display = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
});

const body = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-body',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'NCAAF Edge Board',
  description: 'Auditable +EV college football board',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <header className="top">
          <Link href="/" className="brand">
            NCAAF Edge
          </Link>
          <nav>
            <Link href="/">Board</Link>
            <Link href="/results">Results</Link>
            <Link href="/admin">Admin</Link>
          </nav>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}

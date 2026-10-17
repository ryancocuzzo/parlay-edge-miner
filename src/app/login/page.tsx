import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MAX_USERS } from '@/allowlist';
import { auth, signIn } from '@/auth';

const ERRORS: Record<string, string> = {
  AccessDenied: `All ${MAX_USERS} spots are taken. Ask the admin to free one up.`,
  Configuration: 'Sign-in is misconfigured on the server. Check the Google OAuth settings.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  if ((await auth())?.user) redirect(callbackUrl ?? '/');

  return (
    <div className="login-shell">
      <div className="login-card">
        <p className="brand-mark">NCAAF Edge</p>
        <p className="lede">Build betting strategies with an AI analyst, backtest them on seven seasons of lines, and track every pick.</p>
        {error && <p className="notice neg">{ERRORS[error] ?? 'Sign-in failed. Try again.'}</p>}
        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: callbackUrl ?? '/' });
          }}
        >
          <button type="submit" className="google">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" />
              <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
              <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
            </svg>
            Continue with Google
          </button>
        </form>
        <p className="fine">
          Open to the first {MAX_USERS} people. <Link href="/privacy">Privacy</Link>
        </p>
      </div>
    </div>
  );
}

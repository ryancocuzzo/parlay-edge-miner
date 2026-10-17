import { auth, signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user) redirect(params.callbackUrl ?? '/');

  return (
    <div className="login-shell">
      <div className="login-card">
        <p className="brand-mark">NCAAF Edge</p>
        <h1>Sign in</h1>
        <p className="lede">Email magic link. Only allowlisted addresses get through.</p>
        {params.error && <p className="neg">Sign-in failed. Check that your email is on the allowlist.</p>}
        <form
          className="stack"
          action={async (formData) => {
            'use server';
            const email = String(formData.get('email') ?? '').toLowerCase();
            try {
              await signIn('nodemailer', {
                email,
                redirectTo: params.callbackUrl ?? '/',
              });
            } catch (error) {
              if (error instanceof AuthError) redirect('/login?error=AccessDenied');
              throw error;
            }
          }}
        >
          <label>
            Email
            <input type="email" name="email" required placeholder="you@example.com" />
          </label>
          <button type="submit">Email me a link</button>
        </form>
      </div>
    </div>
  );
}

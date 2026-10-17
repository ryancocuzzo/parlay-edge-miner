import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { addAllowlist, findAllowlisted, listAllowlist, MAX_USERS, removeAllowlist } from '@/allowlist';
import { requireUser } from '@/auth';
import { Stat } from '@/components/strategy/stats';
import { latestRemaining } from '@/data/usage';
import { runScheduledJobs } from '@/jobs';
import { prisma } from '@/lib/prisma';
import { shortDate } from '@/lib/format';
import { LEGACY_SLUG } from '@/strategy/legacy';
import type { LegacyMeta } from '@/strategy/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const requireAdmin = async () => {
  const user = await requireUser();
  if (!(await findAllowlisted(user.email))?.isAdmin) notFound();
  return user;
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ran?: string }> }) {
  await requireAdmin();
  const { ran } = await searchParams;
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [users, cfbdRemaining, oddsRemaining, callsByApi, runs, legacy] = await Promise.all([
    listAllowlist(),
    latestRemaining('cfbd'),
    latestRemaining('odds'),
    prisma.apiCall.groupBy({ by: ['api'], where: { createdAt: { gte: monthStart } }, _count: true, _max: { createdAt: true } }),
    prisma.backtestRun.findMany({ orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, spec: true, createdBy: true, createdAt: true } }),
    prisma.strategy.findUnique({ where: { slug: LEGACY_SLUG }, select: { meta: true } }),
  ]);
  const calls = Object.fromEntries(callsByApi.map((row) => [row.api, row]));
  const unmatched = ((legacy?.meta ?? {}) as LegacyMeta).unmatched ?? [];

  return (
    <div>
      <h1>Admin</h1>

      <section className="panel">
        <h2>API budgets this month</h2>
        <div className="stats">
          <Stat label="CollegeFootballData" value={cfbdRemaining ?? '—'} sub={`left of 1,000 · ${calls.cfbd?._count ?? 0} used`} />
          <Stat label="The Odds API" value={oddsRemaining ?? '—'} sub={`credits left · ${calls.odds?._count ?? 0} calls`} />
          <Stat label="AI messages" value={calls.llm?._count ?? 0} sub="this month" />
        </div>
        <form
          action={async () => {
            'use server';
            await requireAdmin();
            const outcome = await runScheduledJobs(new Date());
            revalidatePath('/', 'layout');
            redirect(`/admin?ran=${encodeURIComponent(JSON.stringify(outcome.results))}`);
          }}
        >
          <button type="submit" className="secondary full">
            Run scheduled jobs now
          </button>
        </form>
        {ran && <pre className="raw-out">{JSON.stringify(JSON.parse(ran), null, 2)}</pre>}
        <p className="fine">Cron runs every 6 hours. CFBD re-syncs the current season at most every 12 hours; history is never re-fetched.</p>
      </section>

      <section className="panel">
        <h2>
          Users <span className="mono">{users.length} / {MAX_USERS}</span>
        </h2>
        <p className="fine">Anyone who signs in with Google joins automatically until all {MAX_USERS} spots are taken. Removing someone frees their spot.</p>
        <ul className="allowlist">
          {users.map((user) => (
            <li key={user.id}>
              <span className="mono">{user.email}</span>
              {user.isAdmin ? (
                <span className="tag">admin</span>
              ) : (
                <form
                  action={async () => {
                    'use server';
                    await requireAdmin();
                    await removeAllowlist(user.email);
                    revalidatePath('/admin');
                  }}
                >
                  <button type="submit" className="secondary small">
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <form
          className="inline-form"
          action={async (formData) => {
            'use server';
            await requireAdmin();
            const email = String(formData.get('email') ?? '');
            if (email) await addAllowlist(email, formData.get('isAdmin') === 'on');
            revalidatePath('/admin');
          }}
        >
          <input type="email" name="email" required placeholder="friend@gmail.com" aria-label="Email to allow" />
          <label className="check">
            <input type="checkbox" name="isAdmin" /> Admin
          </label>
          <button type="submit">Add</button>
        </form>
        <p className="fine">Gmail addresses are matched without dots or +tags.</p>
      </section>

      <section className="panel">
        <h2>Recent backtests</h2>
        <ul className="plain-links">
          {runs.map((run) => (
            <li key={run.id}>
              <Link href={`/backtests/${run.id}`}>{(run.spec as { name?: string }).name ?? run.id}</Link>
              <span className="fine">
                {run.createdBy} · {shortDate(run.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {unmatched.length > 0 && (
        <section className="panel">
          <h2>Original-board legs we could not match to a game</h2>
          <ul className="plain">
            {unmatched.map((leg) => (
              <li key={`${leg.matchup}-${leg.team}`}>
                {leg.team} · {leg.matchup} · {leg.startsAt.slice(0, 10)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { listAllowlist, normalizeEmail } from '@/allowlist';
import { Stat } from '@/components/strategy/stats';
import { STATUS, type RequestStatus } from '@/factory/policy';
import { advanceFactory, factorySettings } from '@/factory/service';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from './require-admin';

const DAY_MS = 24 * 60 * 60 * 1000;
const usd = (value: number) => `$${value.toFixed(value < 10 ? 2 : 0)}`;

const settingsSchema = z.object({
  perHour: z.coerce.number().int().min(0).max(50),
  perDay: z.coerce.number().int().min(0).max(200),
  maxActive: z.coerce.number().int().min(1).max(5),
  dailyBudgetUsd: z.coerce.number().min(0).max(1000),
  model: z.string().trim().min(1).max(80),
  inputUsdPerM: z.coerce.number().min(0),
  outputUsdPerM: z.coerce.number().min(0),
  cacheReadUsdPerM: z.coerce.number().min(0),
  cacheWriteUsdPerM: z.coerce.number().min(0),
});

const optionalLimit = z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(0).max(200).optional());

const saveSettings = async (formData: FormData) => {
  'use server';
  await requireAdmin();
  const data = settingsSchema.parse(Object.fromEntries(formData));
  await prisma.factorySettings.update({ where: { id: 1 }, data: { ...data, enabled: formData.get('enabled') === 'on' } });
  revalidatePath('/admin');
};

const saveUserLimits = async (formData: FormData) => {
  'use server';
  await requireAdmin();
  await prisma.allowlistUser.update({
    where: { email: normalizeEmail(String(formData.get('email'))) },
    data: {
      factoryPaused: formData.get('paused') === 'on',
      factoryPerHour: optionalLimit.parse(formData.get('perHour')) ?? null,
      factoryPerDay: optionalLimit.parse(formData.get('perDay')) ?? null,
    },
  });
  revalidatePath('/admin');
};

const SETTING_FIELDS = [
  ['perHour', 'Features per user per hour', '1'],
  ['perDay', 'Features per user per day', '1'],
  ['maxActive', 'Builds at once', '1'],
  ['dailyBudgetUsd', 'Daily budget (USD)', '0.5'],
  ['inputUsdPerM', 'Input $/M tokens', '0.01'],
  ['outputUsdPerM', 'Output $/M tokens', '0.01'],
  ['cacheReadUsdPerM', 'Cache read $/M', '0.01'],
  ['cacheWriteUsdPerM', 'Cache write $/M', '0.01'],
] as const;

export async function FactoryPanel() {
  const now = new Date();
  const syncError = await advanceFactory(now).then(
    () => undefined,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
  const since = (days: number) => ({ dispatchedAt: { gte: new Date(now.getTime() - days * DAY_MS) } });
  const [settings, users, today, week, allTime, byUser, featuresToday, recent] = await Promise.all([
    factorySettings(),
    listAllowlist(),
    prisma.featureRequest.aggregate({ where: since(1), _sum: { costUsd: true } }),
    prisma.featureRequest.aggregate({ where: since(7), _sum: { costUsd: true } }),
    prisma.featureRequest.aggregate({ _sum: { costUsd: true }, _count: true }),
    prisma.featureRequest.groupBy({ by: ['userEmail'], _sum: { costUsd: true }, _count: true }),
    prisma.featureRequest.groupBy({
      by: ['userEmail'],
      where: { kind: 'feature', status: { not: 'declined' }, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
      _count: true,
    }),
    prisma.featureRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { id: true, userEmail: true, kind: true, title: true, status: true, statusDetail: true, costUsd: true, agentId: true, createdAt: true },
    }),
  ]);
  const spentToday = today._sum.costUsd ?? 0;
  const statsFor = (email: string) => ({
    cost: byUser.find((row) => row.userEmail === email)?._sum.costUsd ?? 0,
    requests: byUser.find((row) => row.userEmail === email)?._count ?? 0,
    featuresToday: featuresToday.find((row) => row.userEmail === email)?._count ?? 0,
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Feature factory</h2>
        <span className={`verdict verdict-${settings.enabled ? 'proven' : 'unproven'}`}>{settings.enabled ? 'On' : 'Paused'}</span>
      </div>
      {syncError && <p className="notice neg">Status sync failed: {syncError}</p>}
      <div className="stats">
        <Stat label="Spent today" value={usd(spentToday)} sub={`of ${usd(settings.dailyBudgetUsd)} budget`} />
        <Stat label="Last 7 days" value={usd(week._sum.costUsd ?? 0)} sub="estimated" />
        <Stat label="All time" value={usd(allTime._sum.costUsd ?? 0)} sub={`${allTime._count} requests`} />
        <Stat label="Building now" value={recent.filter((r) => r.status === 'building').length} sub={`max ${settings.maxActive} at once`} />
      </div>

      <details className="disclosure">
        <summary>Limits, budget and model</summary>
        <form action={saveSettings} className="factory-settings">
          <label className="check">
            <input type="checkbox" name="enabled" defaultChecked={settings.enabled} /> Accept new requests
          </label>
          <div className="field-grid">
            {SETTING_FIELDS.map(([name, label, step]) => (
              <label key={name}>
                {label}
                <input type="number" name={name} step={step} min="0" defaultValue={settings[name]} required />
              </label>
            ))}
          </div>
          <label>
            Builder model (Cursor model id)
            <input name="model" defaultValue={settings.model} required />
          </label>
          <button type="submit" className="secondary full">
            Save factory settings
          </button>
          <p className="fine">Costs are estimates: tokens reported by Cursor × the rates above. New requests stop dispatching once today's spend reaches the budget.</p>
        </form>
      </details>

      <h3 className="section-title">Per user</h3>
      <ul className="factory-users">
        {users.map((user) => {
          const stats = statsFor(user.email);
          return (
            <li key={user.id}>
              <div>
                <span className="mono">{user.email}</span>
                <span className="fine">
                  {stats.featuresToday} features today · {stats.requests} total · {usd(stats.cost)}
                </span>
              </div>
              <form action={saveUserLimits} className="user-limits">
                <input type="hidden" name="email" value={user.email} />
                <label className="check">
                  <input type="checkbox" name="paused" defaultChecked={user.factoryPaused} /> Paused
                </label>
                <input type="number" name="perHour" min="0" placeholder={`${settings.perHour}/h`} defaultValue={user.factoryPerHour ?? ''} aria-label="Features per hour" />
                <input type="number" name="perDay" min="0" placeholder={`${settings.perDay}/day`} defaultValue={user.factoryPerDay ?? ''} aria-label="Features per day" />
                <button type="submit" className="secondary small">
                  Save
                </button>
              </form>
            </li>
          );
        })}
      </ul>

      <h3 className="section-title">Recent requests</h3>
      <ul className="factory-log">
        {recent.map((request) => (
          <li key={request.id}>
            <div className="request-top">
              <strong>{request.title}</strong>
              <span className={`verdict verdict-${request.status === 'live' ? 'proven' : request.status === 'failed' ? 'losing' : 'unproven'}`}>
                {STATUS[request.status as RequestStatus]}
              </span>
            </div>
            <span className="fine">
              {request.userEmail} · {request.kind} · {usd(request.costUsd)} · {request.createdAt.toLocaleString('en-US', { timeZone: 'America/New_York' })}
              {request.agentId && (
                <>
                  {' · '}
                  <a href={`https://cursor.com/agents/${request.agentId}`} target="_blank" rel="noreferrer">
                    agent
                  </a>
                </>
              )}
            </span>
            {request.statusDetail && <span className="fine">{request.statusDetail}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

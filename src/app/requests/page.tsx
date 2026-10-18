import { normalizeEmail } from '@/allowlist';
import { requireUser } from '@/auth';
import { IN_FLIGHT, outOfQuotaMessage, STATUS, type RequestStatus } from '@/factory/policy';
import { advanceFactory, userQuota } from '@/factory/service';
import { prisma } from '@/lib/prisma';
import { AutoRefresh, RequestForm } from './request-form';

export const dynamic = 'force-dynamic';

const TONE: Record<RequestStatus, string> = {
  queued: 'promising',
  building: 'promising',
  deploying: 'promising',
  live: 'proven',
  declined: 'unproven',
  failed: 'losing',
};

const STEPS: Array<[RequestStatus, string]> = [
  ['queued', 'Accepted'],
  ['building', 'Building'],
  ['deploying', 'Deploying'],
  ['live', 'Live'],
];

const ago = (date: Date, now: Date) => {
  const minutes = Math.round((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default async function RequestsPage() {
  const user = await requireUser();
  const now = new Date();
  const syncError = await advanceFactory(now).then(
    () => undefined,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
  const [quota, requests] = await Promise.all([
    userQuota(user.email, now),
    prisma.featureRequest.findMany({
      where: { userEmail: normalizeEmail(user.email) },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, kind: true, title: true, description: true, status: true, statusDetail: true, createdAt: true },
    }),
  ]);
  const outOfFeatures = quota.hourLeft === 0 || quota.dayLeft === 0 ? outOfQuotaMessage(quota) : undefined;

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Requests</h1>
          <p className="lede">Ask for a feature or report a bug. An AI engineer builds it and ships it straight into the app, usually within half an hour.</p>
        </div>
      </header>

      {quota.settings.enabled ? (
        <RequestForm
          quotaNote={`${quota.hourLeft} of ${quota.perHour} feature requests left this hour · ${quota.dayLeft} of ${quota.perDay} today · bug reports are free`}
          outOfFeatures={outOfFeatures}
        />
      ) : (
        <p className="notice warn">Requests are paused right now. Check back soon.</p>
      )}
      {syncError && <p className="notice neg">Couldn't refresh build status: {syncError}</p>}

      <h2 className="section-title">Your requests</h2>
      {requests.length === 0 ? (
        <p className="empty">Nothing yet. Your first idea goes here.</p>
      ) : (
        <ul className="requests">
          {requests.map((request) => {
            const status = request.status as RequestStatus;
            const step = STEPS.findIndex(([s]) => s === status);
            return (
              <li key={request.id} className="panel request">
                <div className="request-top">
                  <span className="tag">{request.kind === 'bug' ? 'Bug fix' : 'Feature'}</span>
                  <span className={`verdict verdict-${TONE[status]}`}>{STATUS[status]}</span>
                </div>
                <h3>{request.title}</h3>
                {step >= 0 && (
                  <ol className="progress" aria-label="Progress">
                    {STEPS.map(([key, label], index) => (
                      <li key={key} className={index < step ? 'done' : index === step ? 'current' : undefined}>
                        {label}
                      </li>
                    ))}
                  </ol>
                )}
                {request.statusDetail && <p className="request-detail">{request.statusDetail}</p>}
                <details className="disclosure">
                  <summary>What you asked · {ago(request.createdAt, now)}</summary>
                  <p className="request-ask">{request.description}</p>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {requests.some((r) => IN_FLIGHT.includes(r.status as RequestStatus)) && <AutoRefresh />}
    </div>
  );
}

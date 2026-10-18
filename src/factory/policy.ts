import type { FactorySettings } from '@prisma/client';
import type { AgentRun } from './cursor';

export const CATEGORIES = {
  'lab-analysis': 'New filters, features, breakdowns or analysis tools for building and testing strategies, using data we already have.',
  'data-coverage': 'New stats derived from CollegeFootballData (rankings, venues, team or game stats) that fit the existing monthly API budget.',
  display: 'New views, charts, tables or stats for strategies, backtests, picks and boards.',
  'ui-polish': 'Layout, styling, mobile usability, navigation and accessibility improvements.',
  copy: 'Wording, labels, explanations and help text.',
  'bug-fix': 'Something that is broken, wrong, or behaves differently than it should.',
} as const;

export type Category = keyof typeof CATEGORIES;

export const BLOCKED = [
  'Sign-in, accounts, the allowlist, admin powers, sessions or permissions',
  'Security, secrets, API keys, environment variables or anything that weakens a protection',
  'Payments, money movement, or placing real bets',
  "Seeing, sharing or changing other users' data, or anything social between users",
  'New paid services or APIs, bigger or more AI models, higher usage limits, more frequent jobs, or anything else that raises running costs',
  'Deployment, CI, infrastructure, dependencies, or this feature-request system itself',
  'Removing or redefining existing features, saved strategies, or how bets are graded in a way other users would notice',
  'Anything illegal, deceptive, or unrelated to college football strategy research',
];

export const MAX_SCREENSHOTS = 3;

export const STATUS = {
  queued: 'Waiting for a free builder',
  building: 'Being built',
  deploying: 'Deploying',
  live: 'Live',
  declined: 'Not accepted',
  failed: "Couldn't ship",
} as const;

export type RequestStatus = keyof typeof STATUS;
export const IN_FLIGHT: RequestStatus[] = ['queued', 'building', 'deploying'];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type Limits = { perHour: number; perDay: number };

export const limitsFor = (
  settings: Pick<FactorySettings, 'perHour' | 'perDay'>,
  user: { factoryPerHour: number | null; factoryPerDay: number | null } | undefined,
): Limits => ({ perHour: user?.factoryPerHour ?? settings.perHour, perDay: user?.factoryPerDay ?? settings.perDay });

export const quota = (now: Date, featureTimes: Date[], limits: Limits) => {
  const ago = (date: Date) => now.getTime() - date.getTime();
  const lastHour = featureTimes.filter((t) => ago(t) < HOUR_MS).sort((a, b) => a.getTime() - b.getTime());
  const lastDay = featureTimes.filter((t) => ago(t) < DAY_MS).sort((a, b) => a.getTime() - b.getTime());
  const hourLeft = Math.max(0, limits.perHour - lastHour.length);
  const dayLeft = Math.max(0, limits.perDay - lastDay.length);
  const freesAt = (window: Date[], limit: number, span: number) => {
    const oldest = window[window.length - limit];
    return oldest && new Date(oldest.getTime() + span);
  };
  const nextAt =
    dayLeft === 0
      ? freesAt(lastDay, limits.perDay, DAY_MS)
      : hourLeft === 0
        ? freesAt(lastHour, limits.perHour, HOUR_MS)
        : undefined;
  return { hourLeft, dayLeft, nextAt, ...limits };
};

const timeOf = (date: Date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

export const outOfQuotaMessage = (q: Pick<ReturnType<typeof quota>, 'perHour' | 'perDay' | 'dayLeft' | 'nextAt'>) =>
  `You've used all ${q.dayLeft === 0 ? `${q.perDay} feature requests for today` : `${q.perHour} feature requests for this hour`}.` +
  `${q.nextAt ? ` Your next one opens up at ${timeOf(q.nextAt)} ET.` : ''} Bug reports are always free.`;

export const outcomeOf = (run: AgentRun): { status: RequestStatus; detail: string } | undefined => {
  if (run.status === 'CREATING' || run.status === 'RUNNING') return undefined;
  const result = run.result?.trim() ?? '';
  if (run.status !== 'FINISHED') return { status: 'failed', detail: `The builder stopped (${run.status.toLowerCase()}).` };
  if (result.startsWith('DECLINED:')) return { status: 'declined', detail: result.slice('DECLINED:'.length).trim() };
  if (!run.git?.branches.some((b) => b.branch === 'main')) return { status: 'failed', detail: result || 'The builder finished without shipping any changes.' };
  return { status: 'deploying', detail: result };
};

export type TokenUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

export const estimateCost = (
  usage: TokenUsage,
  rates: Pick<FactorySettings, 'inputUsdPerM' | 'outputUsdPerM' | 'cacheReadUsdPerM' | 'cacheWriteUsdPerM'>,
): number =>
  (usage.inputTokens * rates.inputUsdPerM +
    usage.outputTokens * rates.outputUsdPerM +
    usage.cacheReadTokens * rates.cacheReadUsdPerM +
    usage.cacheWriteTokens * rates.cacheWriteUsdPerM) /
  1_000_000;

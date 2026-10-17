import { createHash } from 'node:crypto';
import { americanToDecimal } from '../edge';
import { candidatesForGame, gradeCandidate, weekKey, type Candidate, type DatasetGame, type Grade } from './candidates';
import { FEATURES, type FeatureKey, type StrategySpec } from './spec';

const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;

export const specHash = (spec: StrategySpec): string =>
  createHash('sha256')
    .update(JSON.stringify(canonical({ ...spec, name: undefined, summary: undefined })))
    .digest('hex')
    .slice(0, 16);

export const TRAIN_LAST_SEASON = 2023;
export const HOLDOUT_LAST_SEASON = 2025;

export type Split = 'train' | 'holdout' | 'live';
export const splitFor = (season: number): Split =>
  season <= TRAIN_LAST_SEASON ? 'train' : season <= HOLDOUT_LAST_SEASON ? 'holdout' : 'live';

export type SelectedPick = Candidate & { strength: number; rank: number };
export type GradedPick = SelectedPick & Grade & { homePoints: number; awayPoints: number };

export type Summary = {
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number;
  breakEven: number;
  units: number;
  roi: number;
  roiLow: number;
  roiHigh: number;
  maxDrawdown: number;
};

export type Verdict = { level: 'proven' | 'promising' | 'unproven' | 'losing' | 'thin'; label: string };

export type BacktestReport = {
  specHash: string;
  splits: Record<Split, Summary>;
  outOfSample: Summary;
  verdict: Verdict;
  bySeason: Array<Summary & { season: number }>;
  breakdowns: Array<{ title: string; rows: Array<Summary & { label: string }> }>;
  series: Array<{ key: string; units: number }>;
  candidates: number;
  warnings: string[];
};

const MIN_OUT_OF_SAMPLE_BETS = 50;

export const inConferences = (
  { conferences, opponentConferences }: Pick<StrategySpec, 'conferences' | 'opponentConferences'>,
  candidate: Candidate,
): boolean =>
  (!conferences || conferences.some((conference) => candidate.conferences.includes(conference))) &&
  (!opponentConferences || opponentConferences.some((conference) => conference === candidate.opponentConference));

const eligible = (spec: StrategySpec, candidate: Candidate): boolean =>
  inConferences(spec, candidate) &&
  spec.filters.every(({ feature, min, max }) => {
    const value = candidate.features[feature];
    return value !== undefined && (min === undefined || value >= min) && (max === undefined || value <= max);
  }) && spec.score.every(({ feature }) => candidate.features[feature] !== undefined);

export const prepareScorer = (spec: StrategySpec, training: Candidate[]) => {
  const stats = new Map(
    spec.score.map(({ feature }) => {
      const values = training.map((c) => c.features[feature]).filter((v): v is number => v !== undefined);
      const mean = values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);
      const sd = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / Math.max(values.length, 1)) || 1;
      return [feature, { mean, sd }] as const;
    }),
  );
  const raw = (candidate: Candidate): number =>
    spec.score.reduce((sum, { feature, weight }) => {
      const { mean, sd } = stats.get(feature)!;
      return sum + (weight * (candidate.features[feature]! - mean)) / sd;
    }, 0);
  const distribution = training.filter((c) => eligible(spec, c)).map(raw).sort((a, b) => a - b);
  const strength = (value: number): number => {
    if (distribution.length === 0) return 50;
    let low = 0;
    let high = distribution.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (distribution[mid] <= value) low = mid + 1;
      else high = mid;
    }
    return Math.round((low / distribution.length) * 1000) / 10;
  };
  return { raw, strength };
};

export const selectWeek = (
  spec: StrategySpec,
  candidates: Candidate[],
  scorer: ReturnType<typeof prepareScorer>,
): SelectedPick[] => {
  const scored = candidates
    .filter((candidate) => eligible(spec, candidate))
    .map((candidate) => {
      const raw = scorer.raw(candidate);
      return { candidate, raw, strength: scorer.strength(raw) };
    })
    .filter(({ strength }) => spec.minStrength === undefined || strength >= spec.minStrength)
    .sort((a, b) => b.raw - a.raw || a.candidate.gameId - b.candidate.gameId);
  const seenGames = new Set<number>();
  return scored
    .filter(({ candidate }) => !seenGames.has(candidate.gameId) && seenGames.add(candidate.gameId))
    .slice(0, spec.picksPerWeek)
    .map(({ candidate, strength }, index) => ({ ...candidate, strength, rank: index + 1 }));
};

export const summarize = (picks: Array<Pick<GradedPick, 'result' | 'profit' | 'price'>>): Summary => {
  const bets = picks.length;
  const wins = picks.filter((p) => p.result === 'win').length;
  const losses = picks.filter((p) => p.result === 'loss').length;
  const profits = picks.map((p) => p.profit);
  const units = profits.reduce((sum, p) => sum + p, 0);
  const roi = bets ? units / bets : 0;
  const variance = bets > 1 ? profits.reduce((sum, p) => sum + (p - roi) ** 2, 0) / (bets - 1) : 0;
  const margin = bets ? 1.96 * Math.sqrt(variance / bets) : 0;
  const { maxDrawdown } = profits.reduce(
    (acc, p) => {
      const running = acc.running + p;
      const peak = Math.max(acc.peak, running);
      return { running, peak, maxDrawdown: Math.max(acc.maxDrawdown, peak - running) };
    },
    { running: 0, peak: 0, maxDrawdown: 0 },
  );
  return {
    bets,
    wins,
    losses,
    pushes: bets - wins - losses,
    hitRate: wins + losses ? wins / (wins + losses) : 0,
    breakEven: bets ? picks.reduce((sum, p) => sum + 1 / americanToDecimal(p.price), 0) / bets : 0,
    units,
    roi,
    roiLow: roi - margin,
    roiHigh: roi + margin,
    maxDrawdown,
  };
};

export const verdictFor = (summary: Summary): Verdict => {
  if (summary.bets < MIN_OUT_OF_SAMPLE_BETS) {
    return { level: 'thin', label: `Only ${summary.bets} out-of-sample bets — too few to judge` };
  }
  if (summary.roiLow > 0) return { level: 'proven', label: 'Profitable out of sample (95% CI above zero)' };
  if (summary.roiHigh < 0) return { level: 'losing', label: 'Loses money out of sample (95% CI below zero)' };
  return summary.roi > 0
    ? { level: 'promising', label: 'Positive out of sample, but not statistically proven' }
    : { level: 'unproven', label: 'No edge out of sample' };
};

const groupBy = <T>(items: T[], key: (item: T) => string): Map<string, T[]> =>
  items.reduce((groups, item) => groups.set(key(item), [...(groups.get(key(item)) ?? []), item]), new Map<string, T[]>());

const bucket = (value: number | undefined, edges: number[], labels: string[]): string => {
  if (value === undefined) return 'n/a';
  const index = edges.findIndex((edge) => value <= edge);
  return labels[index === -1 ? labels.length - 1 : index];
};

const breakdownsFor = (spec: StrategySpec, picks: GradedPick[]): BacktestReport['breakdowns'] => {
  const table = (title: string, label: (pick: GradedPick) => string) => ({
    title,
    rows: [...groupBy(picks, label)].map(([name, rows]) => ({ label: name, ...summarize(rows) })),
  });
  if (spec.market === 'total') {
    return [
      table('Over vs under', (p) => (p.selection === 'over' ? 'Over' : 'Under')),
      table('Total', (p) => bucket(p.line, [44.5, 54.5, 64.5], ['≤ 44.5', '45–54.5', '55–64.5', '65+'])),
    ];
  }
  return [
    spec.market === 'moneyline'
      ? table('Price', (p) => bucket(p.price, [-150, -101, 200, 500], ['≤ -150', '-149 to -101', '+100 to +200', '+201 to +500', '> +500']))
      : table('Spread', (p) => bucket(p.line, [-14, -7.5, -0.5, 6.5, 13.5], ['≤ -14', '-13.5 to -7.5', '-7 to -0.5', '+0.5 to +6.5', '+7 to +13.5', '≥ +14'])),
    table('Home vs away', (p) => (p.features.isHome ? 'Home' : 'Away')),
    table('Favorite vs underdog', (p) => (p.features.isFavorite ? 'Favorite' : 'Underdog')),
    table('Conference', (p) => p.conferences[0] ?? 'Unknown'),
  ];
};

const warningsFor = (spec: StrategySpec): string[] => [
  ...(spec.market === 'moneyline' ? ['Moneylines exist from 2021 on (DraftKings from 2023), so moneyline training covers 2021–2023 only.'] : []),
  ...(spec.market !== 'moneyline' ? ['Spreads and totals are graded at -110 against the closing consensus line.'] : []),
  ...([...spec.filters.map((f) => f.feature), ...spec.score.map((s) => s.feature)].some((f) => f.startsWith('elo'))
    ? ['Elo features only exist for FBS vs FBS games.']
    : []),
  ...([...spec.filters.map((f) => f.feature), ...spec.score.map((s) => s.feature)].some((f) => f.endsWith('Move'))
    ? ['Line moves use the closing line, so these picks assume betting at the close.']
    : []),
];

export const candidatesFor = (spec: StrategySpec, games: DatasetGame[]): Candidate[] =>
  games.flatMap((game) => candidatesForGame(game, spec.market, spec.books));

export const runBacktest = (spec: StrategySpec, games: DatasetGame[]) => {
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const candidates = candidatesFor(spec, games.filter((game) => game.completed));
  const scorer = prepareScorer(spec, candidates.filter((c) => splitFor(c.season) === 'train'));
  const picks: GradedPick[] = [...groupBy(candidates, weekKey)]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, week]) => selectWeek(spec, week, scorer))
    .flatMap((pick) => {
      const game = gamesById.get(pick.gameId)!;
      const grade = gradeCandidate(pick, game);
      return grade ? [{ ...pick, ...grade, homePoints: game.homePoints!, awayPoints: game.awayPoints! }] : [];
    });

  const bySplit = (split: Split) => summarize(picks.filter((p) => splitFor(p.season) === split));
  const outOfSample = summarize(picks.filter((p) => splitFor(p.season) !== 'train'));
  const series = [...groupBy(picks, weekKey)].reduce<Array<{ key: string; units: number }>>((acc, [key, rows]) => {
    const previous = acc.at(-1)?.units ?? 0;
    return [...acc, { key, units: previous + rows.reduce((sum, p) => sum + p.profit, 0) }];
  }, []);

  const report: BacktestReport = {
    specHash: specHash(spec),
    splits: { train: bySplit('train'), holdout: bySplit('holdout'), live: bySplit('live') },
    outOfSample,
    verdict: verdictFor(outOfSample),
    bySeason: [...groupBy(picks, (p) => String(p.season))].map(([season, rows]) => ({ season: Number(season), ...summarize(rows) })),
    breakdowns: breakdownsFor(spec, picks),
    series,
    candidates: candidates.length,
    warnings: warningsFor(spec),
  };
  return { report, picks };
};

export const upcomingWeek = (games: DatasetGame[], now: Date): DatasetGame[] => {
  const upcoming = games.filter((game) => !game.completed && game.startsAt > now);
  if (upcoming.length === 0) return [];
  const next = upcoming.reduce((first, game) => (weekKey(game) < weekKey(first) ? game : first));
  return upcoming.filter((game) => weekKey(game) === weekKey(next));
};

export const buildBoard = (spec: StrategySpec, games: DatasetGame[], now: Date) => {
  const week = upcomingWeek(games, now);
  const training = candidatesFor(spec, games.filter((g) => g.completed && splitFor(g.season) === 'train'));
  const candidates = candidatesFor(spec, week);
  return {
    week: week[0] && { season: week[0].season, seasonType: week[0].seasonType, week: week[0].week },
    firstKickoff: week.reduce<Date | undefined>((first, g) => (!first || g.startsAt < first ? g.startsAt : first), undefined),
    candidates: candidates.length,
    picks: selectWeek(spec, candidates, prepareScorer(spec, training)),
  };
};

export const featureValues = (pick: Candidate, spec: StrategySpec): Partial<Record<FeatureKey, number>> =>
  Object.fromEntries(
    [...new Set([...spec.filters.map((f) => f.feature), ...spec.score.map((s) => s.feature), 'price' as FeatureKey])]
      .filter((key) => key in FEATURES)
      .map((key) => [key, pick.features[key]]),
  );

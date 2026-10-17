import { z } from 'zod';

export const MARKETS = ['moneyline', 'spread', 'total'] as const;
export type Market = (typeof MARKETS)[number];

export const BOOKS = ['DraftKings', 'Bovada', 'ESPN Bet'] as const;

export const CONFERENCES = [
  'ACC',
  'American Athletic',
  'Big 12',
  'Big Ten',
  'Conference USA',
  'FBS Independents',
  'Mid-American',
  'Mountain West',
  'Pac-12',
  'SEC',
  'Sun Belt',
] as const;

export const FEATURES = {
  price: { label: 'Price', unit: 'american', markets: MARKETS, description: 'American odds of the selection. Moneyline uses the best price among allowed books; spreads and totals are priced at -110.' },
  marketProb: { label: 'Market win prob', unit: 'prob', markets: ['moneyline'], description: 'No-vig win probability implied by the closing moneylines, averaged across books.' },
  isHome: { label: 'Home team', unit: 'flag', markets: ['moneyline', 'spread'], description: '1 when the selection is the listed home team.' },
  neutralSite: { label: 'Neutral site', unit: 'flag', markets: MARKETS, description: '1 when the game is at a neutral site.' },
  isFavorite: { label: 'Favorite', unit: 'flag', markets: ['moneyline', 'spread'], description: '1 when the selection is favored by the closing line.' },
  spread: { label: 'Spread', unit: 'points', markets: ['moneyline', 'spread'], description: "Selection's closing point spread (median across books). Negative = favored, e.g. -7 lays a touchdown." },
  spreadMove: { label: 'Spread move', unit: 'points', markets: ['moneyline', 'spread'], description: "Selection's closing spread minus opening spread. Negative = the market moved toward this side." },
  total: { label: 'Total', unit: 'points', markets: MARKETS, description: 'Closing over/under (median across books).' },
  totalMove: { label: 'Total move', unit: 'points', markets: ['total'], description: 'Closing total minus opening total. Positive = moved up.' },
  eloDiff: { label: 'Elo difference', unit: 'elo', markets: ['moneyline', 'spread'], description: 'Selection pregame Elo minus opponent pregame Elo (FBS vs FBS only).' },
  eloProb: { label: 'Elo win prob', unit: 'prob', markets: ['moneyline', 'spread'], description: 'Win probability from pregame Elo, logistic with no home bonus.' },
  eloEdge: { label: 'Elo edge', unit: 'prob', markets: ['moneyline'], description: 'Elo win prob minus market win prob. Positive = Elo likes the selection more than the market does.' },
  eloSpreadEdge: { label: 'Elo spread edge', unit: 'points', markets: ['moneyline', 'spread'], description: 'Elo-implied margin (Elo difference / 25) plus the spread. Positive = Elo expects the selection to beat the number.' },
  conferenceGame: { label: 'Conference game', unit: 'flag', markets: MARKETS, description: '1 for conference games.' },
  isPower: { label: 'Power conference', unit: 'flag', markets: ['moneyline', 'spread'], description: '1 when the selection plays in the SEC, Big Ten, Big 12, ACC or Pac-12.' },
  opponentPower: { label: 'Opponent power conf.', unit: 'flag', markets: ['moneyline', 'spread'], description: '1 when the opponent plays in the SEC, Big Ten, Big 12, ACC or Pac-12.' },
  fcsOpponent: { label: 'FCS opponent', unit: 'flag', markets: ['moneyline', 'spread'], description: '1 when the opponent is an FCS team.' },
  lastMargin: { label: 'Last game margin', unit: 'points', markets: ['moneyline', 'spread'], description: "Selection's point margin in its previous game this season. Negative = lost. Missing before a team's first game." },
  lostLast: { label: 'Lost last game', unit: 'flag', markets: ['moneyline', 'spread'], description: '1 when the selection lost its previous game this season.' },
  streak: { label: 'Streak', unit: 'games', markets: ['moneyline', 'spread'], description: 'Current win (+) or loss (−) streak this season. -2 = lost two straight.' },
  opponentLostLast: { label: 'Opponent lost last game', unit: 'flag', markets: ['moneyline', 'spread'], description: '1 when the opponent lost its previous game this season.' },
  isOver: { label: 'Over', unit: 'flag', markets: ['total'], description: '1 for the over, 0 for the under.' },
  week: { label: 'Week', unit: 'week', markets: MARKETS, description: 'Season week number (postseason games count as week 20+).' },
} as const satisfies Record<string, { label: string; unit: string; markets: readonly Market[]; description: string }>;

export type FeatureKey = keyof typeof FEATURES;
const FEATURE_KEYS = Object.keys(FEATURES) as [FeatureKey, ...FeatureKey[]];

const filterSchema = z.object({
  feature: z.enum(FEATURE_KEYS),
  min: z.number().optional().describe('Inclusive lower bound. Flags: min 1 means "must be true".'),
  max: z.number().optional().describe('Inclusive upper bound. Flags: max 0 means "must be false".'),
});

export const strategySpecShape = z.object({
  name: z.string().trim().min(3).max(60),
  summary: z.string().trim().min(10).max(280).describe('One or two plain-English sentences describing the idea.'),
  market: z.enum(MARKETS),
  books: z.array(z.enum(BOOKS)).min(1).optional().describe('Moneyline price sources. Omit to line-shop across all.'),
  conferences: z
    .array(z.enum(CONFERENCES))
    .min(1)
    .optional()
    .describe("Only bet on teams in these conferences (the team's conference that season). For totals, either team qualifies. Omit for all."),
  opponentConferences: z
    .array(z.enum(CONFERENCES))
    .min(1)
    .optional()
    .describe('Only bet when the opponent is in these conferences, e.g. fading Big Ten teams. Moneyline and spread only.'),
  filters: z.array(filterSchema).max(8),
  score: z
    .array(z.object({ feature: z.enum(FEATURE_KEYS), weight: z.number().min(-5).max(5) }))
    .min(1)
    .max(4)
    .describe('Strength = weighted sum of standardized features. Higher strength picks are taken first.'),
  picksPerWeek: z.number().int().min(1).max(20),
  minStrength: z.number().min(0).max(100).optional().describe('Only take picks at or above this strength percentile.'),
});

export const strategySpecSchema = strategySpecShape.superRefine((spec, ctx) => {
  if (spec.market === 'total' && spec.opponentConferences) {
    ctx.addIssue({ code: 'custom', message: 'Opponent conferences only apply to moneyline and spread bets' });
  }
  for (const filter of spec.filters) {
    if (filter.min === undefined && filter.max === undefined) {
      ctx.addIssue({ code: 'custom', message: `Filter on "${filter.feature}" needs min, max, or both` });
    }
  }
  for (const key of [...spec.filters.map((f) => f.feature), ...spec.score.map((s) => s.feature)]) {
    if (!(FEATURES[key].markets as readonly Market[]).includes(spec.market)) {
      ctx.addIssue({ code: 'custom', message: `Feature "${key}" is not available for the ${spec.market} market` });
    }
  }
});

export type StrategySpec = z.infer<typeof strategySpecSchema>;
export type StrategyFilter = z.infer<typeof filterSchema>;

const formatValue = (key: FeatureKey, value: number): string => {
  const unit = FEATURES[key].unit;
  if (unit === 'prob') return `${Math.round(value * 1000) / 10}%`;
  if (unit === 'american') return value > 0 ? `+${value}` : `${value}`;
  return `${value}`;
};

export const describeFilter = (filter: StrategyFilter): string => {
  const { label, unit } = FEATURES[filter.feature];
  if (unit === 'flag') return filter.min !== undefined && filter.min >= 1 ? label : `Not ${label.toLowerCase()}`;
  if (filter.min !== undefined && filter.max !== undefined) {
    return `${label} ${formatValue(filter.feature, filter.min)} to ${formatValue(filter.feature, filter.max)}`;
  }
  return filter.min !== undefined
    ? `${label} ≥ ${formatValue(filter.feature, filter.min)}`
    : `${label} ≤ ${formatValue(filter.feature, filter.max!)}`;
};

export const describeBet = (bet: { market: string; selection: string; team: string; line?: number | null }): string => {
  if (bet.market === 'total') return `${bet.selection === 'over' ? 'Over' : 'Under'} ${bet.line}`;
  if (bet.market === 'spread' && bet.line !== undefined && bet.line !== null) {
    return `${bet.team} ${bet.line > 0 ? `+${bet.line}` : bet.line === 0 ? 'PK' : bet.line}`;
  }
  return `${bet.team} ML`;
};

export const describeScore = (spec: StrategySpec): string =>
  spec.score
    .map(({ feature, weight }) => `${weight < 0 ? '−' : '+'}${Math.abs(weight) === 1 ? '' : `${Math.abs(weight)}×`}${FEATURES[feature].label}`)
    .join(' ');

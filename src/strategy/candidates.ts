import { americanToDecimal, devig, impliedProbability } from '../edge';
import type { FeatureKey, Market } from './spec';

export type GameLine = {
  provider: string;
  spread?: number;
  spreadOpen?: number;
  total?: number;
  totalOpen?: number;
  homeMoneyline?: number;
  awayMoneyline?: number;
};

export type DatasetGame = {
  id: number;
  season: number;
  week: number;
  seasonType: string;
  startsAt: Date;
  completed: boolean;
  neutralSite: boolean;
  conferenceGame: boolean;
  homeTeam: string;
  awayTeam: string;
  homeConference?: string;
  awayConference?: string;
  homeClassification?: string;
  awayClassification?: string;
  homePoints?: number;
  awayPoints?: number;
  homeElo?: number;
  awayElo?: number;
  homeForm?: TeamForm;
  awayForm?: TeamForm;
  lines: GameLine[];
};

export type TeamForm = { lastMargin: number; streak: number };

export type Selection = 'home' | 'away' | 'over' | 'under';

export type Candidate = {
  gameId: number;
  season: number;
  seasonType: string;
  week: number;
  startsAt: Date;
  market: Market;
  selection: Selection;
  team: string;
  opponent: string;
  price: number;
  line?: number;
  provider: string;
  conferences: string[];
  opponentConference?: string;
  features: Partial<Record<FeatureKey, number>>;
};

export type Grade = { result: 'win' | 'loss' | 'push'; profit: number };

const STANDARD_PRICE = -110;
const ELO_POINTS_PER_POINT = 25;
const POWER_CONFERENCES = new Set(['SEC', 'Big Ten', 'Big 12', 'ACC', 'Pac-12']);

const isAmerican = (odds: number | undefined): odds is number => odds !== undefined && Math.abs(odds) >= 100;
const flag = (value: boolean): number => (value ? 1 : 0);

const median = (values: Array<number | undefined>): number | undefined => {
  const sorted = values.filter((v): v is number => v !== undefined).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export const weekKey = (game: { season: number; seasonType: string; week: number }): string =>
  `${game.season}-${game.seasonType}-${String(game.week).padStart(2, '0')}`;

export const withTeamForm = (games: DatasetGame[]): DatasetGame[] => {
  const latest = new Map<string, TeamForm>();
  return [...games]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((game) => {
      const homeKey = `${game.season}:${game.homeTeam}`;
      const awayKey = `${game.season}:${game.awayTeam}`;
      const withForm = { ...game, homeForm: latest.get(homeKey), awayForm: latest.get(awayKey) };
      if (game.completed && game.homePoints !== undefined && game.awayPoints !== undefined) {
        const next = (form: TeamForm | undefined, margin: number): TeamForm => ({
          lastMargin: margin,
          streak: form && Math.sign(form.streak) === Math.sign(margin) ? form.streak + Math.sign(margin) : Math.sign(margin),
        });
        latest.set(homeKey, next(withForm.homeForm, game.homePoints - game.awayPoints));
        latest.set(awayKey, next(withForm.awayForm, game.awayPoints - game.homePoints));
      }
      return withForm;
    });
};

export const candidatesForGame = (game: DatasetGame, market: Market, books?: readonly string[]): Candidate[] => {
  const spread = median(game.lines.map((line) => line.spread));
  const spreadOpen = median(game.lines.map((line) => line.spreadOpen));
  const total = median(game.lines.map((line) => line.total));
  const totalOpen = median(game.lines.map((line) => line.totalOpen));
  const shared = {
    gameId: game.id,
    season: game.season,
    seasonType: game.seasonType,
    week: game.week,
    startsAt: game.startsAt,
    market,
  };
  const context = {
    neutralSite: flag(game.neutralSite),
    conferenceGame: flag(game.conferenceGame),
    week: game.seasonType === 'postseason' ? 20 + game.week : game.week,
  };

  if (market === 'total') {
    if (total === undefined) return [];
    const totalMove = totalOpen === undefined ? undefined : total - totalOpen;
    return (['over', 'under'] as const).map((selection) => ({
      ...shared,
      selection,
      team: `${game.awayTeam} @ ${game.homeTeam}`,
      opponent: '',
      price: STANDARD_PRICE,
      line: total,
      provider: 'consensus',
      conferences: [game.homeConference, game.awayConference].filter((c): c is string => c !== undefined),
      features: { ...context, price: STANDARD_PRICE, total, totalMove, isOver: flag(selection === 'over') },
    }));
  }

  const priced = game.lines.filter((line) => isAmerican(line.homeMoneyline) && isAmerican(line.awayMoneyline));
  const homeProbs = priced.map(
    (line) => devig(impliedProbability(line.homeMoneyline!), impliedProbability(line.awayMoneyline!)).home,
  );
  const homeMarketProb = homeProbs.length ? homeProbs.reduce((sum, p) => sum + p, 0) / homeProbs.length : undefined;
  const allowed = priced.filter((line) => !books || books.includes(line.provider));

  return (['home', 'away'] as const).flatMap((selection): Candidate[] => {
    const isHome = selection === 'home';
    const [team, opponent] = isHome ? [game.homeTeam, game.awayTeam] : [game.awayTeam, game.homeTeam];
    const [elo, oppElo] = isHome ? [game.homeElo, game.awayElo] : [game.awayElo, game.homeElo];
    const [conference, oppConference] = isHome ? [game.homeConference, game.awayConference] : [game.awayConference, game.homeConference];
    const [form, oppForm] = isHome ? [game.homeForm, game.awayForm] : [game.awayForm, game.homeForm];
    const sideSpread = spread === undefined ? undefined : isHome ? spread : -spread;
    const sideSpreadOpen = spreadOpen === undefined ? undefined : isHome ? spreadOpen : -spreadOpen;
    const eloDiff = elo === undefined || oppElo === undefined ? undefined : elo - oppElo;
    const eloProb = eloDiff === undefined ? undefined : 1 / (1 + 10 ** (-eloDiff / 400));
    const marketProb = homeMarketProb === undefined ? undefined : isHome ? homeMarketProb : 1 - homeMarketProb;
    const sideFeatures = {
      ...context,
      isHome: flag(isHome),
      spread: sideSpread,
      spreadMove: sideSpread === undefined || sideSpreadOpen === undefined ? undefined : sideSpread - sideSpreadOpen,
      total,
      eloDiff,
      eloProb,
      eloSpreadEdge:
        eloDiff === undefined || sideSpread === undefined ? undefined : eloDiff / ELO_POINTS_PER_POINT + sideSpread,
      isPower: flag(POWER_CONFERENCES.has(conference ?? '')),
      opponentPower: flag(POWER_CONFERENCES.has(oppConference ?? '')),
      fcsOpponent: flag((isHome ? game.awayClassification : game.homeClassification) === 'fcs'),
      lastMargin: form?.lastMargin,
      lostLast: form && flag(form.lastMargin < 0),
      streak: form?.streak,
      opponentLostLast: oppForm && flag(oppForm.lastMargin < 0),
    };
    const sideShared = { ...shared, selection, team, opponent, conferences: conference ? [conference] : [], opponentConference: oppConference };

    if (market === 'spread') {
      if (sideSpread === undefined) return [];
      return [
        {
          ...sideShared,
          price: STANDARD_PRICE,
          line: sideSpread,
          provider: 'consensus',
          features: { ...sideFeatures, price: STANDARD_PRICE, isFavorite: flag(sideSpread < 0) },
        },
      ];
    }

    const best = allowed.reduce<{ price: number; provider: string } | undefined>((top, line) => {
      const price = isHome ? line.homeMoneyline! : line.awayMoneyline!;
      return !top || americanToDecimal(price) > americanToDecimal(top.price) ? { price, provider: line.provider } : top;
    }, undefined);
    if (!best || marketProb === undefined) return [];
    return [
      {
        ...sideShared,
        price: best.price,
        provider: best.provider,
        features: {
          ...sideFeatures,
          price: best.price,
          marketProb,
          isFavorite: flag(marketProb > 0.5),
          eloEdge: eloProb === undefined ? undefined : eloProb - marketProb,
        },
      },
    ];
  });
};

export const gradeCandidate = (
  candidate: Pick<Candidate, 'market' | 'selection' | 'price' | 'line'>,
  game: Pick<DatasetGame, 'completed' | 'homePoints' | 'awayPoints'>,
): Grade | undefined => {
  if (!game.completed || game.homePoints === undefined || game.awayPoints === undefined) return undefined;
  const payout = americanToDecimal(candidate.price) - 1;
  const settle = (edge: number): Grade =>
    edge > 0 ? { result: 'win', profit: payout } : edge < 0 ? { result: 'loss', profit: -1 } : { result: 'push', profit: 0 };

  if (candidate.market === 'total') {
    const sum = game.homePoints + game.awayPoints;
    return settle(candidate.selection === 'over' ? sum - candidate.line! : candidate.line! - sum);
  }
  const margin =
    candidate.selection === 'home' ? game.homePoints - game.awayPoints : game.awayPoints - game.homePoints;
  return settle(candidate.market === 'spread' ? margin + candidate.line! : margin);
};

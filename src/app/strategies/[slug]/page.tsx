import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  EquityCurve,
  HowToRead,
  KeyNumbers,
  PickItem,
  record,
  RuleChips,
  SplitRow,
  SplitRows,
  SummaryStats,
  VerdictBadge,
  VerdictNote,
} from '@/components/strategy/stats';
import { kickoff, shortDate, signedPct, tone, units, weekLabel } from '@/lib/format';
import { summarize, verdictFor, type Summary } from '@/strategy/engine';
import type { LegacyPick } from '@/strategy/legacy';
import { strategyDetail, type StrategyDetail, type StrategyPickRow } from '@/strategy/queries';
import { describeBet, FEATURES } from '@/strategy/spec';

export const dynamic = 'force-dynamic';

const TABS = ['board', 'record', 'backtest', 'rules'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { board: 'This week', record: 'Track record', backtest: 'Backtest', rules: 'Rules' };

const weekKeyOf = (pick: StrategyPickRow) => `${pick.season}-${pick.seasonType}-${String(pick.week).padStart(2, '0')}`;

const graded = (picks: StrategyPickRow[]) =>
  picks.flatMap((p) => (p.result && p.profit !== null ? [{ result: p.result as 'win' | 'loss' | 'push', profit: p.profit, price: p.price }] : []));

const matchup = (pick: StrategyPickRow) =>
  pick.market === 'total' ? pick.team : pick.team === pick.game.homeTeam ? `vs ${pick.game.awayTeam}` : `@ ${pick.game.homeTeam}`;

const finalScore = (pick: StrategyPickRow) =>
  pick.game.completed && pick.game.homePoints !== null && pick.game.awayPoints !== null
    ? `Final ${pick.game.awayTeam} ${pick.game.awayPoints}–${pick.game.homePoints} ${pick.game.homeTeam}`
    : kickoff(pick.game.startsAt);

const PickRow = ({ pick, legacy }: { pick: StrategyPickRow; legacy: boolean }) => (
  <PickItem
    title={describeBet(pick)}
    price={pick.price}
    result={pick.result}
    profit={pick.profit}
    strength={legacy ? undefined : pick.score}
    meta={
      <>
        <span>{matchup(pick)}</span>
        <span>{finalScore(pick)}</span>
        <span>{pick.provider}</span>
        {legacy && <span className="pos">EV {signedPct((pick.inputs as LegacyPick['inputs']).ev)}</span>}
      </>
    }
  />
);

const WeekGroups = ({ picks, legacy }: { picks: StrategyPickRow[]; legacy: boolean }) => {
  const weeks = [...Map.groupBy(picks, weekKeyOf)].sort(([a], [b]) => b.localeCompare(a));
  return (
    <div className="weeks">
      {weeks.map(([key, rows], index) => {
        const summary = summarize(graded(rows));
        return (
          <details key={key} open={index === 0} className="week">
            <summary>
              <span>
                {rows[0]!.season} · {weekLabel(rows[0]!.seasonType, rows[0]!.week)}
              </span>
              <span className="mono">{summary.bets ? record(summary) : `${rows.length} open`}</span>
              <span className={`mono ${tone(summary.units) ?? ''}`}>{summary.bets ? units(summary.units) : ''}</span>
            </summary>
            <ul className="picks">
              {rows.map((pick) => (
                <PickRow key={pick.id} pick={pick} legacy={legacy} />
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
};

const BoardTab = ({ strategy }: { strategy: StrategyDetail }) => {
  const legacy = strategy.kind === 'legacy';
  const board = strategy.boards[0];
  const picks = legacy
    ? strategy.picks.filter((p) => !p.result)
    : strategy.picks.filter((p) => board && p.season === board.season && p.seasonType === board.seasonType && p.week === board.week);
  if (picks.length === 0) {
    return <p className="empty">{legacy ? 'No open picks right now. The board refreshes every 6 hours.' : 'No board yet. It is generated once lines for the next week are posted.'}</p>;
  }
  return (
    <section>
      <p className="section-note">
        {board
          ? `${board.season} ${weekLabel(board.seasonType, board.week)} · generated ${shortDate(board.generatedAt)} from ${board.candidates} candidate bets. Picks and prices are frozen when generated.`
          : 'Open +EV moneylines at the first price seen. Each game side counts once.'}
      </p>
      <ul className="picks">
        {picks.map((pick) => (
          <PickRow key={pick.id} pick={pick} legacy={legacy} />
        ))}
      </ul>
    </section>
  );
};

const PRICE_BANDS: Array<[string, (price: number) => boolean]> = [
  ['Favorites', (p) => p < 0],
  ['+100 to +200', (p) => p >= 100 && p <= 200],
  ['+201 to +500', (p) => p > 200 && p <= 500],
  ['Longer than +500', (p) => p > 500],
];

const LegacyExtras = ({ strategy }: { strategy: StrategyDetail }) => {
  const parlays = strategy.meta.parlays;
  return (
    <>
      <section className="panel">
        <h2>By price</h2>
        {PRICE_BANDS.map(([label, inBand]) => (
          <SplitRow key={label} label={label} sub={`${strategy.picks.filter((p) => p.result && inBand(p.price)).length} bets`} summary={summarize(graded(strategy.picks.filter((p) => inBand(p.price))))} />
        ))}
      </section>
      {parlays && (
        <section className="panel">
          <h2>Parlays built from these picks</h2>
          <p className="section-note">
            The old board listed {parlays.rowsShown.toLocaleString()} parlay rows. They were {parlays.unique.toLocaleString()} distinct combinations of the same singles, each counted once here at
            the prices first shown. Combos share legs, so their ranges are narrower than they should be. {parlays.pending.toLocaleString()} are waiting on games.
          </p>
          <SplitRow label="2-leg" sub={`${parlays.twoLeg.bets.toLocaleString()} combos`} summary={parlays.twoLeg} />
          <SplitRow label="3-leg" sub={`${parlays.threeLeg.bets.toLocaleString()} combos`} summary={parlays.threeLeg} />
        </section>
      )}
    </>
  );
};

const weeklySeries = (picks: StrategyPickRow[]) =>
  [...Map.groupBy(picks.filter((p) => p.result), weekKeyOf)]
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce<Array<{ key: string; units: number }>>((acc, [key, rows]) => [...acc, { key, units: (acc.at(-1)?.units ?? 0) + rows.reduce((s, p) => s + (p.profit ?? 0), 0) }], []);

const RecordTab = ({ strategy }: { strategy: StrategyDetail }) => {
  const legacy = strategy.kind === 'legacy';
  const series = weeklySeries(strategy.picks);
  return (
    <>
      <section className="panel">
        <h2>{legacy ? 'Every real pick' : 'Since saved'}</h2>
        <SummaryStats summary={strategy.live} />
        {series.length > 1 && <EquityCurve series={series} />}
      </section>
      {legacy && <LegacyExtras strategy={strategy} />}
      {strategy.picks.length === 0 ? <p className="empty">No picks yet.</p> : <WeekGroups picks={strategy.picks} legacy={legacy} />}
    </>
  );
};

const BacktestTab = ({ strategy }: { strategy: StrategyDetail }) => {
  const report = strategy.report;
  if (!report || !strategy.backtestRun) {
    return (
      <section className="panel">
        <h2>No backtest</h2>
        <p className="section-note">
          The original board priced live odds against Pinnacle. Historical Pinnacle prices are not in our data, so it cannot be replayed. Its real record is the evidence.
        </p>
      </section>
    );
  }
  return (
    <section className="panel">
      <h2>Results by period</h2>
      <SplitRows splits={report.splits} />
      <EquityCurve series={report.series} />
      {report.warnings.length > 0 && (
        <ul className="warnings">
          {report.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <HowToRead />
      <Link href={`/backtests/${strategy.backtestRun.id}`} className="button secondary full">
        Audit every backtest pick
      </Link>
    </section>
  );
};

const RulesTab = ({ strategy }: { strategy: StrategyDetail }) => {
  if (!strategy.spec) {
    return (
      <section className="panel">
        <h2>How picks were made</h2>
        <ul className="plain">
          <li>Every 6 hours, pull moneylines for games starting in the next 30 hours.</li>
          <li>Remove Pinnacle’s vig to get a fair win probability.</li>
          <li>Keep any side where the best other price has positive expected value against that fair probability.</li>
          <li>Here each game side counts once, at the first price seen, graded by the official final score.</li>
        </ul>
      </section>
    );
  }
  const used = [...new Set([...strategy.spec.filters.map((f) => f.feature), ...strategy.spec.score.map((s) => s.feature)])];
  return (
    <section className="panel">
      <h2>Rules</h2>
      <RuleChips spec={strategy.spec} />
      <dl className="glossary">
        {used.map((key) => (
          <div key={key}>
            <dt>{FEATURES[key].label}</dt>
            <dd>{FEATURES[key].description}</dd>
          </div>
        ))}
      </dl>
      <p className="fine">
        Rules are frozen when saved · fingerprint <span className="mono">{strategy.specHash}</span>
        {strategy.createdBy && ` · saved by ${strategy.createdBy}`} · {shortDate(strategy.createdAt)}
      </p>
      <details className="raw">
        <summary>Raw spec</summary>
        <pre>{JSON.stringify(strategy.spec, null, 2)}</pre>
      </details>
    </section>
  );
};

export default async function StrategyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ slug }, { tab: rawTab }] = await Promise.all([params, searchParams]);
  const strategy = await strategyDetail(slug);
  if (!strategy) notFound();
  const tabs = TABS.filter((t) => t !== 'backtest' || strategy.kind !== 'legacy');
  const tab: Tab = tabs.find((t) => t === rawTab) ?? (strategy.kind === 'legacy' ? 'record' : 'board');
  const verdict = strategy.report?.verdict ?? verdictFor(strategy.live);
  const headline: Summary = strategy.report?.outOfSample ?? strategy.live;

  return (
    <div>
      <Link href="/" className="back">
        ← Strategies
      </Link>
      <header className="hero">
        <div className="card-top">
          <VerdictBadge verdict={verdict} />
          <span className="kind">{strategy.kind === 'legacy' ? 'Original board' : 'Saved strategy'}</span>
        </div>
        <h1>{strategy.name}</h1>
        <p className="lede">{strategy.summary}</p>
        <KeyNumbers summary={headline} scope={strategy.report ? 'Blind test · 2024 on' : 'Real picks'} />
        <VerdictNote verdict={verdict} />
      </header>
      <nav className="tabs" aria-label="Strategy sections">
        {tabs.map((t) => (
          <Link key={t} href={`?tab=${t}`} scroll={false} className={t === tab ? 'active' : undefined} aria-current={t === tab ? 'page' : undefined}>
            {TAB_LABELS[t]}
          </Link>
        ))}
      </nav>
      {tab === 'board' && <BoardTab strategy={strategy} />}
      {tab === 'record' && <RecordTab strategy={strategy} />}
      {tab === 'backtest' && <BacktestTab strategy={strategy} />}
      {tab === 'rules' && <RulesTab strategy={strategy} />}
    </div>
  );
}

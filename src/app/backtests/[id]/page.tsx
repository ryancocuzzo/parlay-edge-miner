import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/auth';
import {
  EquityCurve,
  HowToRead,
  KeyNumbers,
  PickItem,
  record,
  RuleChips,
  SplitRow,
  SplitRows,
  splitLabel,
  VerdictBadge,
  VerdictNote,
} from '@/components/strategy/stats';
import { formatAmerican, formatLine, pct, shortDate, tone, units, weekLabel } from '@/lib/format';
import { featureValues, splitFor, summarize, type GradedPick } from '@/strategy/engine';
import { replayBacktest, saveStrategy } from '@/strategy/service';
import { describeBet, FEATURES, type FeatureKey } from '@/strategy/spec';

export const dynamic = 'force-dynamic';

const formatFeature = (key: FeatureKey, value: number): string => {
  const unit = FEATURES[key].unit;
  if (unit === 'prob') return pct(value);
  if (unit === 'american') return formatAmerican(value);
  if (unit === 'flag') return value ? 'yes' : 'no';
  if (unit === 'points') return formatLine(Math.round(value * 10) / 10);
  return String(Math.round(value));
};

const finalScore = (pick: GradedPick) => {
  if (pick.market === 'total') return `Final ${pick.homePoints + pick.awayPoints} pts`;
  const [mine, theirs] = pick.features.isHome ? [pick.homePoints, pick.awayPoints] : [pick.awayPoints, pick.homePoints];
  return `Final ${mine}–${theirs}`;
};

export default async function BacktestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ season?: string }> }) {
  const [{ id }, { season: rawSeason }] = await Promise.all([params, searchParams]);
  const replay = await replayBacktest(id);
  if (!replay) notFound();
  const { run, spec, stored, report, picks, reproduced, dataVersion } = replay;
  const saved = run.strategies[0];

  const seasons = [...new Set(picks.map((p) => p.season))].sort((a, b) => b - a);
  const season = seasons.find((s) => String(s) === rawSeason) ?? seasons.find((s) => splitFor(s) === 'holdout') ?? seasons[0];
  const seasonPicks = picks.filter((p) => p.season === season);
  const weeks = [...Map.groupBy(seasonPicks, (p) => `${p.seasonType}-${String(p.week).padStart(2, '0')}`)].sort(([a], [b]) => b.localeCompare(a));

  return (
    <div>
      <Link href={saved ? `/strategies/${saved.slug}?tab=backtest` : '/lab'} className="back">
        ← {saved ? saved.name : 'Lab'}
      </Link>
      <header className="hero">
        <div className="card-top">
          <VerdictBadge verdict={report.verdict} />
          <span className="kind">Backtest report</span>
        </div>
        <h1>{spec.name}</h1>
        <p className="lede">{spec.summary}</p>
        <RuleChips spec={spec} />
        <KeyNumbers summary={report.outOfSample} scope="Blind test · 2024 on" />
        <VerdictNote verdict={report.verdict} />
        <p className={`proof ${reproduced ? 'ok' : 'warn'}`}>
          {reproduced
            ? '✓ Reproduced: re-running these rules on today’s data gives the same 2019–25 results as when this run was first saved.'
            : `⚠ 2019–25 results differ from the saved run (build seasons ${record(stored.splits.train)}, ${units(stored.splits.train.units)} → ${record(report.splits.train)}, ${units(report.splits.train.units)}; blind test ${record(stored.splits.holdout)}, ${units(stored.splits.holdout.units)} → ${record(report.splits.holdout)}, ${units(report.splits.holdout.units)}). Historical scores or prices were revised after this run.`}
        </p>
      </header>

      {!saved && (
        <form
          className="save-bar"
          action={async () => {
            'use server';
            const user = await requireUser();
            const strategy = await saveStrategy(id, user.email);
            redirect(`/strategies/${strategy.slug}`);
          }}
        >
          <span>Like it? Saving freezes these rules and starts a weekly top-{spec.picksPerWeek} board.</span>
          <button type="submit">Save strategy</button>
        </form>
      )}

      <section className="panel">
        <h2>Results by period</h2>
        <SplitRows splits={report.splits} />
        <EquityCurve series={report.series} />
        <HowToRead />
      </section>

      <section className="panel">
        <h2>By season</h2>
        {report.bySeason.map((row) => (
          <SplitRow key={row.season} label={String(row.season)} sub={splitLabel(splitFor(row.season))} summary={row} />
        ))}
      </section>

      {report.breakdowns.map((breakdown) => (
        <section className="panel" key={breakdown.title}>
          <h2>{breakdown.title}</h2>
          {breakdown.rows.map((row) => (
            <SplitRow key={row.label} label={row.label} sub={`${row.bets} bets`} summary={row} />
          ))}
        </section>
      ))}

      {report.warnings.length > 0 && (
        <ul className="warnings">
          {report.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <section>
        <h2 className="section-title">Every pick</h2>
        <nav className="season-chips" aria-label="Season">
          {seasons.map((s) => (
            <Link key={s} href={`?season=${s}`} scroll={false} className={s === season ? 'active' : undefined}>
              {s}
            </Link>
          ))}
        </nav>
        <div className="weeks">
          {weeks.map(([key, rows], index) => {
            const summary = summarize(rows);
            return (
              <details key={key} open={index === 0} className="week">
                <summary>
                  <span>{weekLabel(rows[0]!.seasonType, rows[0]!.week)}</span>
                  <span className="mono">{record(summary)}</span>
                  <span className={`mono ${tone(summary.units) ?? ''}`}>{units(summary.units)}</span>
                </summary>
                <ul className="picks">
                  {rows.map((pick) => (
                    <PickItem
                      key={`${pick.gameId}-${pick.selection}`}
                      title={describeBet(pick)}
                      price={pick.price}
                      result={pick.result}
                      profit={pick.profit}
                      strength={pick.strength}
                      meta={
                        <>
                          <span>{pick.market === 'total' ? pick.team : `${pick.features.isHome ? 'vs' : '@'} ${pick.opponent}`}</span>
                          <span>{shortDate(pick.startsAt)}</span>
                          <span>{finalScore(pick)}</span>
                          <span>{pick.provider}</span>
                        </>
                      }
                    >
                      <div className="inputs">
                        {Object.entries(featureValues(pick, spec)).map(([key, value]) =>
                          value === undefined ? null : (
                            <span key={key}>
                              {FEATURES[key as FeatureKey].label} <b>{formatFeature(key as FeatureKey, value)}</b>
                            </span>
                          ),
                        )}
                      </div>
                    </PickItem>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      </section>

      <p className="fine">
        Run {run.id} · rules fingerprint <span className="mono">{run.specHash}</span> · data {dataVersion}
        {run.createdBy && ` · by ${run.createdBy}`} · {shortDate(run.createdAt)} · {report.candidates.toLocaleString()} candidate bets considered
      </p>
    </div>
  );
}

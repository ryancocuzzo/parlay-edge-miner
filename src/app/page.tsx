import Link from 'next/link';
import { CiBar, record, VerdictBadge } from '@/components/strategy/stats';
import { signedPct, tone, units } from '@/lib/format';
import { verdictFor } from '@/strategy/engine';
import { listStrategies } from '@/strategy/queries';

export const dynamic = 'force-dynamic';

export default async function StrategiesPage() {
  const strategies = (await listStrategies())
    .map((strategy) => {
      const evidence = strategy.backtest?.outOfSample ?? strategy.live;
      return { ...strategy, evidence, verdict: strategy.backtest?.verdict ?? verdictFor(strategy.live) };
    })
    .sort((a, b) => b.evidence.roiLow - a.evidence.roiLow);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Strategies</h1>
          <p className="lede">Every strategy and every pick, graded against final scores. Ranked by the worst case of each strategy’s 95% range.</p>
        </div>
        <Link href="/lab" className="button cta">
          + Build a strategy
        </Link>
      </div>

      {strategies.length === 0 && <p className="empty">No strategies yet. Build one in the Lab.</p>}

      <ol className="strategy-list">
        {strategies.map((strategy, index) => (
          <li key={strategy.slug}>
            <Link href={`/strategies/${strategy.slug}`} className="strategy-card">
              <div className="card-top">
                <span className="rank">{index + 1}</span>
                <span className="kind">{strategy.kind === 'legacy' ? 'Original board' : 'Saved strategy'}</span>
                <VerdictBadge verdict={strategy.verdict} />
              </div>
              <h2>{strategy.name}</h2>
              <p className="card-summary">{strategy.summary}</p>
              <div className="card-rows">
                {strategy.backtest && (
                  <div className="card-row">
                    <span className="row-label">Backtest · out of sample</span>
                    <span className="mono">{record(strategy.backtest.outOfSample)}</span>
                    <span className={`mono ${tone(strategy.backtest.outOfSample.roi) ?? ''}`}>{signedPct(strategy.backtest.outOfSample.roi)}</span>
                    <CiBar summary={strategy.backtest.outOfSample} />
                  </div>
                )}
                <div className="card-row">
                  <span className="row-label">{strategy.kind === 'legacy' ? 'Real picks' : 'Tracked since saved'}</span>
                  <span className="mono">{strategy.live.bets ? record(strategy.live) : 'no results yet'}</span>
                  <span className={`mono ${tone(strategy.live.units) ?? ''}`}>{strategy.live.bets ? units(strategy.live.units) : ''}</span>
                  {strategy.live.bets > 0 && <CiBar summary={strategy.live} />}
                </div>
              </div>
              {strategy.open > 0 && <span className="card-foot">{strategy.open} open picks this week →</span>}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

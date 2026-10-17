import Link from 'next/link';
import { KeyNumbers, record, VerdictBadge } from '@/components/strategy/stats';
import { tone, units } from '@/lib/format';
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
          <p className="lede">Betting ideas tested on seasons they never saw, then tracked pick by pick. Strongest evidence first, so lucky small samples don’t float to the top.</p>
        </div>
        <Link href="/lab" className="button primary">
          New strategy
        </Link>
      </div>

      {strategies.length === 0 && <p className="empty">No strategies yet. Build one in the Lab.</p>}

      <ol className="strategy-list">
        {strategies.map((strategy) => (
          <li key={strategy.slug}>
            <Link href={`/strategies/${strategy.slug}`} className="strategy-card">
              <div className="card-top">
                <VerdictBadge verdict={strategy.verdict} />
                <span className="kind">{strategy.kind === 'legacy' ? 'Original board' : 'Saved strategy'}</span>
              </div>
              <h2>{strategy.name}</h2>
              <p className="card-summary">{strategy.summary}</p>
              <KeyNumbers summary={strategy.evidence} scope={strategy.backtest ? 'Blind test · 2024 on' : 'Real picks'} />
              <div className="card-foot">
                {strategy.backtest && (
                  <span>
                    Since saved:{' '}
                    {strategy.live.bets ? (
                      <span className="mono">
                        {record(strategy.live)} · <span className={tone(strategy.live.units)}>{units(strategy.live.units)}</span>
                      </span>
                    ) : (
                      'no results yet'
                    )}
                  </span>
                )}
                {strategy.open > 0 && <span className="card-link">{strategy.open} open picks →</span>}
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

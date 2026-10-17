'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { EquityCurve, HowToRead, KeyNumbers, RuleChips, SplitRows, VerdictBadge, VerdictNote } from '@/components/strategy/stats';
import type { BacktestReport } from '@/strategy/engine';
import type { StrategySpec } from '@/strategy/spec';
import { saveStrategyFromRun } from './actions';

export function BacktestCard({
  runId,
  spec,
  report,
  onEdit,
}: {
  runId: string;
  spec: StrategySpec;
  report: BacktestReport;
  onEdit: (spec: StrategySpec) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [savedSlug, setSavedSlug] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  const save = () =>
    startSaving(async () => {
      try {
        setSavedSlug(await saveStrategyFromRun(runId));
        setError(undefined);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Save failed');
      }
      setConfirming(false);
    });

  return (
    <article className="bt-card">
      <header>
        <div className="card-top">
          <VerdictBadge verdict={report.verdict} />
          <span className="kind">Backtest</span>
        </div>
        <h3>{spec.name}</h3>
        <p>{spec.summary}</p>
      </header>

      <KeyNumbers summary={report.outOfSample} scope="Blind test · 2024 on" />
      <VerdictNote verdict={report.verdict} />
      <EquityCurve series={report.series} height={80} />

      <details className="disclosure">
        <summary>By period & rules</summary>
        <SplitRows splits={report.splits} />
        <RuleChips spec={spec} />
      </details>
      <HowToRead />

      {error && <p className="notice neg">{error}</p>}

      <footer>
        {savedSlug ? (
          <Link href={`/strategies/${savedSlug}`} className="button primary full">
            Saved · View weekly board
          </Link>
        ) : confirming ? (
          <div className="confirm">
            <span>Freeze these rules and start a weekly top-{spec.picksPerWeek} board?</span>
            <div className="actions">
              <button type="button" className="secondary" onClick={() => setConfirming(false)} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="actions">
            <button type="button" className="secondary" onClick={() => onEdit(spec)}>
              Edit rules
            </button>
            <Link href={`/backtests/${runId}`} className="button secondary">
              Audit picks
            </Link>
            <button type="button" className="primary" onClick={() => setConfirming(true)}>
              Save
            </button>
          </div>
        )}
      </footer>
    </article>
  );
}

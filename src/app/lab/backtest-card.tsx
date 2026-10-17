'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { CiBar, EquityCurve, record, RuleChips, SplitRow, VerdictBadge } from '@/components/strategy/stats';
import { signedPct, tone } from '@/lib/format';
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
  const oos = report.outOfSample;

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
        <div>
          <h3>{spec.name}</h3>
          <p>{spec.summary}</p>
        </div>
        <VerdictBadge verdict={report.verdict} />
      </header>

      <div className="bt-headline">
        <div>
          <span className="stat-label">Out of sample</span>
          <span className={`bt-roi ${tone(oos.roi) ?? ''}`}>{signedPct(oos.roi)}</span>
          <span className="stat-sub">
            {record(oos)} · {oos.bets} bets
          </span>
        </div>
        <div className="bt-ci">
          <CiBar summary={oos} />
          <span className="stat-sub">
            95% range {signedPct(oos.roiLow, 0)} to {signedPct(oos.roiHigh, 0)}
          </span>
        </div>
      </div>

      <EquityCurve series={report.series} height={80} />

      <details className="bt-more">
        <summary>Splits & rules</summary>
        <SplitRow label="Training" sub="2019–2023" summary={report.splits.train} />
        <SplitRow label="Holdout" sub="2024–2025" summary={report.splits.holdout} />
        <SplitRow label="Live" sub="2026" summary={report.splits.live} />
        <RuleChips spec={spec} />
      </details>

      {error && <p className="notice neg">{error}</p>}

      <footer>
        {savedSlug ? (
          <Link href={`/strategies/${savedSlug}`} className="button full">
            Saved ✓ View strategy board →
          </Link>
        ) : confirming ? (
          <div className="confirm">
            <span>Freeze these rules and start a weekly top-{spec.picksPerWeek} board?</span>
            <div className="actions">
              <button type="button" className="secondary" onClick={() => setConfirming(false)} disabled={saving}>
                Cancel
              </button>
              <button type="button" onClick={save} disabled={saving}>
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
            <button type="button" onClick={() => setConfirming(true)}>
              Save
            </button>
          </div>
        )}
      </footer>
    </article>
  );
}

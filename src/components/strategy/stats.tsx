import type { ReactNode } from 'react';
import { formatAmerican, pct, signedPct, tone, units } from '@/lib/format';
import type { Summary, Verdict } from '@/strategy/engine';
import { describeFilter, describeScore, type StrategySpec } from '@/strategy/spec';

const VERDICT_LABELS: Record<Verdict['level'], string> = {
  proven: 'Proven edge',
  promising: 'Promising',
  unproven: 'No edge yet',
  losing: 'Losing',
  thin: 'Too few bets',
};

export const VerdictBadge = ({ verdict }: { verdict: Verdict }) => (
  <span className={`verdict verdict-${verdict.level}`} title={verdict.label}>
    {VERDICT_LABELS[verdict.level]}
  </span>
);

export const record = (s: Summary): string => `${s.wins}-${s.losses}${s.pushes ? `-${s.pushes}` : ''}`;

export const CiBar = ({ summary, scale = 0.4 }: { summary: Summary; scale?: number }) => {
  const x = (value: number) => Math.min(100, Math.max(0, ((value + scale) / (2 * scale)) * 100));
  const rangeTone = summary.roiLow > 0 ? 'pos' : summary.roiHigh < 0 ? 'neg' : '';
  return (
    <div
      className="ci"
      role="img"
      aria-label={`ROI ${signedPct(summary.roi)}, 95% range ${signedPct(summary.roiLow)} to ${signedPct(summary.roiHigh)}`}
    >
      <span className="ci-zero" />
      {summary.bets > 1 && (
        <span className={`ci-range ${rangeTone}`} style={{ left: `${x(summary.roiLow)}%`, width: `${x(summary.roiHigh) - x(summary.roiLow)}%` }} />
      )}
      {summary.bets > 0 && <span className="ci-dot" style={{ left: `${x(summary.roi)}%` }} />}
    </div>
  );
};

export const Stat = ({ label, value, sub, valueTone }: { label: string; value: ReactNode; sub?: ReactNode; valueTone?: string }) => (
  <div className="stat">
    <span className="stat-label">{label}</span>
    <span className={`stat-value ${valueTone ?? ''}`}>{value}</span>
    {sub && <span className="stat-sub">{sub}</span>}
  </div>
);

export const SummaryStats = ({ summary }: { summary: Summary }) => (
  <div className="stats">
    <Stat label="Record" value={record(summary)} sub={`${summary.bets} bets`} />
    <Stat label="Units" value={units(summary.units)} valueTone={tone(summary.units)} sub={`max drawdown ${summary.maxDrawdown.toFixed(1)}u`} />
    <Stat
      label="ROI"
      value={signedPct(summary.roi)}
      valueTone={tone(summary.roi)}
      sub={summary.bets > 1 ? `95%: ${signedPct(summary.roiLow, 0)} to ${signedPct(summary.roiHigh, 0)}` : 'no range yet'}
    />
    <Stat label="Hit rate" value={pct(summary.hitRate)} sub={`needs ${pct(summary.breakEven)} to break even`} />
  </div>
);

export const SplitRow = ({ label, sub, summary }: { label: string; sub: string; summary: Summary }) => (
  <div className="split-row">
    <div className="split-head">
      <span className="split-label">{label}</span>
      <span className="split-sub">{sub}</span>
    </div>
    <div className="split-nums">
      <span className="mono">{summary.bets ? record(summary) : '—'}</span>
      <span className={`mono ${tone(summary.roi) ?? ''}`}>{summary.bets ? signedPct(summary.roi) : ''}</span>
    </div>
    <CiBar summary={summary} />
  </div>
);

export const EquityCurve = ({ series, height = 120 }: { series: Array<{ key: string; units: number }>; height?: number }) => {
  if (series.length < 2) return <p className="empty">Not enough weeks to chart.</p>;
  const values = [0, ...series.map((point) => point.units)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 300;
  const x = (index: number) => (index / (series.length - 1)) * width;
  const y = (value: number) => height - ((value - min) / span) * (height - 8) - 4;
  const boundary = (season: number) => series.findIndex((point) => Number(point.key.slice(0, 4)) >= season);
  const markers = [
    { index: boundary(2024), label: 'holdout' },
    { index: boundary(2026), label: 'live' },
  ].filter((marker) => marker.index > 0);
  const last = series.at(-1)!.units;
  return (
    <figure className="equity">
      <span className={`equity-total mono ${tone(last) ?? ''}`}>{units(last)}</span>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Cumulative units by week">
        <line x1={0} x2={width} y1={y(0)} y2={y(0)} className="equity-zero" />
        {markers.map((marker) => (
          <line key={marker.label} x1={x(marker.index)} x2={x(marker.index)} y1={0} y2={height} className="equity-marker" />
        ))}
        <polyline
          points={series.map((point, index) => `${x(index)},${y(point.units)}`).join(' ')}
          className={`equity-line ${last >= 0 ? 'pos' : 'neg'}`}
        />
      </svg>
      <figcaption>
        <span>{series[0]!.key.slice(0, 4)}</span>
        {markers.map((marker) => (
          <span key={marker.label} style={{ left: `${(marker.index / (series.length - 1)) * 100}%` }} className="equity-tick">
            {marker.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
};

export const RuleChips = ({ spec }: { spec: StrategySpec }) => (
  <div className="chips">
    <span className="chip chip-market">{spec.market}</span>
    {spec.filters.map((filter, index) => (
      <span key={index} className="chip">
        {describeFilter(filter)}
      </span>
    ))}
    <span className="chip chip-score">Rank: {describeScore(spec)}</span>
    <span className="chip">Top {spec.picksPerWeek}/week</span>
    {spec.minStrength !== undefined && <span className="chip">Strength ≥ {spec.minStrength}</span>}
    {spec.books && <span className="chip">{spec.books.join(', ')}</span>}
  </div>
);

export const ResultTag = ({ result, profit }: { result?: string | null; profit?: number | null }) => (
  <span className={`tag ${result ?? 'open'}`}>
    {result ? `${result}${profit !== undefined && profit !== null && result !== 'push' ? ` ${units(profit)}` : ''}` : 'open'}
  </span>
);

export const StrengthMeter = ({ value }: { value: number }) => (
  <span className="strength" title={`Strength ${value} — percentile vs. training candidates`}>
    <span className="strength-bar">
      <span style={{ width: `${Math.max(4, value)}%` }} />
    </span>
    <span className="mono">{Math.round(value)}</span>
  </span>
);

export const PickItem = ({
  title,
  price,
  meta,
  result,
  profit,
  strength,
  children,
}: {
  title: string;
  price: number;
  meta: ReactNode;
  result?: string | null;
  profit?: number | null;
  strength?: number;
  children?: ReactNode;
}) => (
  <li className={`pick ${result ?? 'open'}`}>
    <div className="pick-main">
      <div className="pick-title">
        <strong>{title}</strong>
        <span className="mono pick-price">{formatAmerican(price)}</span>
      </div>
      <div className="pick-meta">{meta}</div>
      {children}
    </div>
    <div className="pick-side">
      <ResultTag result={result} profit={profit} />
      {strength !== undefined && <StrengthMeter value={strength} />}
    </div>
  </li>
);

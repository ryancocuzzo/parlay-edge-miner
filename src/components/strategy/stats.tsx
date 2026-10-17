import type { ReactNode } from 'react';
import { formatAmerican, pct, signedNumber, signedPct, tone, units } from '@/lib/format';
import type { Split, Summary, Verdict } from '@/strategy/engine';
import { describeFilter, describeScore, type StrategySpec } from '@/strategy/spec';

const VERDICT_LABELS: Record<Verdict['level'], string> = {
  proven: 'Proven edge',
  promising: 'Promising',
  unproven: 'No edge yet',
  losing: 'Losing',
  thin: 'Too few bets',
};

const CI_SCALE = 0.4;

export const VerdictBadge = ({ verdict }: { verdict: Verdict }) => (
  <span className={`verdict verdict-${verdict.level}`} title={verdict.label}>
    {VERDICT_LABELS[verdict.level]}
  </span>
);

export const VerdictNote = ({ verdict }: { verdict: Verdict }) => <p className={`verdict-note verdict-${verdict.level}`}>{verdict.label}.</p>;

export const record = (s: Summary): string => `${s.wins}-${s.losses}${s.pushes ? `-${s.pushes}` : ''}`;

const CiBar = ({ summary }: { summary: Summary }) => {
  const x = (value: number) => Math.min(100, Math.max(0, ((value + CI_SCALE) / (2 * CI_SCALE)) * 100));
  const rangeTone = summary.roiLow > 0 ? 'pos' : summary.roiHigh < 0 ? 'neg' : '';
  return (
    <div
      className="ci"
      role="img"
      aria-label={`ROI ${signedPct(summary.roi)}, likely range ${signedPct(summary.roiLow)} to ${signedPct(summary.roiHigh)}`}
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

export const KeyNumbers = ({ summary, scope }: { summary: Summary; scope: string }) => (
  <div className="key-numbers">
    <p className="eyebrow">{scope}</p>
    <div className="kpis">
      <Stat label="ROI" value={summary.bets ? signedPct(summary.roi) : '—'} valueTone={tone(summary.roi)} sub="return per bet" />
      <Stat label="Record" value={summary.bets ? record(summary) : '—'} sub={`${summary.bets} bets`} />
      <Stat label="Profit" value={summary.bets ? signedNumber(summary.units, 1) : '—'} valueTone={tone(summary.units)} sub="units" />
    </div>
    <div className="likely">
      <div className="likely-head">
        <span>Likely ROI range</span>
        <span className="mono">{summary.bets > 1 ? `${signedPct(summary.roiLow, 0)} to ${signedPct(summary.roiHigh, 0)}` : 'needs more bets'}</span>
      </div>
      <CiBar summary={summary} />
      <div className="ci-axis" aria-hidden="true">
        <span>{signedPct(-CI_SCALE, 0)}</span>
        <span>break-even</span>
        <span>{signedPct(CI_SCALE, 0)}</span>
      </div>
    </div>
  </div>
);

export const SummaryStats = ({ summary }: { summary: Summary }) => (
  <div className="stats">
    <Stat label="Record" value={record(summary)} sub={`${summary.bets} bets`} />
    <Stat label="Profit" value={units(summary.units)} valueTone={tone(summary.units)} sub={`worst dip ${summary.maxDrawdown.toFixed(1)} units`} />
    <Stat
      label="ROI"
      value={signedPct(summary.roi)}
      valueTone={tone(summary.roi)}
      sub={summary.bets > 1 ? `likely ${signedPct(summary.roiLow, 0)} to ${signedPct(summary.roiHigh, 0)}` : 'no range yet'}
    />
    <Stat label="Hit rate" value={pct(summary.hitRate)} sub={`needs ${pct(summary.breakEven)} to break even`} />
  </div>
);

const SPLITS: Record<Split, { label: string; sub: string }> = {
  train: { label: 'Build seasons', sub: '2019–23 · rules were tuned on these, so they flatter' },
  holdout: { label: 'Blind test', sub: '2024–25 · rules never saw these' },
  live: { label: 'This season', sub: '2026 · also never seen' },
};

export const splitLabel = (split: Split) => SPLITS[split].label;

export const SplitRows = ({ splits }: { splits: Record<Split, Summary> }) => (
  <div className="split-rows">
    {(Object.keys(SPLITS) as Split[]).map((split) => (
      <SplitRow key={split} label={SPLITS[split].label} sub={SPLITS[split].sub} summary={splits[split]} />
    ))}
  </div>
);

const GLOSSARY: Array<[string, string]> = [
  ['Blind test', 'Rules are built using 2019–23 games only, then run on 2024 onward, games they never saw. Only the blind test counts toward the verdict, because almost anything looks good on the data it was tuned on.'],
  ['ROI', 'Profit per dollar bet. +5% means $5 profit for every $100 wagered. Picking at random loses roughly 4–5% to the bookmaker’s cut.'],
  ['Units', 'One unit is one standard bet. +10 units means you are up ten times your usual stake.'],
  ['Likely range', 'Where the true ROI probably sits (95% confidence) given how many bets there are. If the whole bar sits right of break-even, the edge is very unlikely to be luck.'],
  ['Strength', 'How a pick ranks, from 0 to 100, against every pick these rules would have made in 2019–23.'],
];

export const HowToRead = () => (
  <details className="explainer">
    <summary>How to read this</summary>
    <dl>
      {GLOSSARY.map(([term, meaning]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{meaning}</dd>
        </div>
      ))}
    </dl>
  </details>
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
    { index: boundary(2024), label: 'blind test' },
    { index: boundary(2026), label: '2026' },
  ].filter((marker) => marker.index > 0);
  const last = series.at(-1)!.units;
  const line = series.map((point, index) => `${x(index)},${y(point.units)}`).join(' ');
  return (
    <figure className={`equity ${last >= 0 ? 'pos' : 'neg'}`}>
      <div className="equity-head">
        <span>Total profit since {series[0]!.key.slice(0, 4)}</span>
        <span className={`mono ${tone(last) ?? ''}`}>{units(last)}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Total profit in units, week by week" style={{ height }}>
        <polygon points={`${line} ${width},${y(0)} 0,${y(0)}`} className="equity-area" />
        <line x1={0} x2={width} y1={y(0)} y2={y(0)} className="equity-zero" />
        {markers.map((marker) => (
          <line key={marker.label} x1={x(marker.index)} x2={x(marker.index)} y1={0} y2={height} className="equity-marker" />
        ))}
        <polyline points={line} className="equity-line" />
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
    {spec.conferences && <span className="chip">{spec.conferences.join(', ')}</span>}
    {spec.opponentConferences && <span className="chip">vs {spec.opponentConferences.join(', ')}</span>}
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

const ResultTag = ({ result, profit }: { result?: string | null; profit?: number | null }) => (
  <span className={`tag ${result ?? 'open'}`}>
    {result ? `${result}${profit !== undefined && profit !== null && result !== 'push' ? ` ${signedNumber(profit)}` : ''}` : 'open'}
  </span>
);

const StrengthMeter = ({ value }: { value: number }) => (
  <span className="strength" title={`Strength ${value}: how this pick ranks against every pick these rules would have made in 2019–23 (0–100)`}>
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

'use client';

import { useEffect, useRef, useState } from 'react';
import { CONFERENCES, FEATURES, MARKETS, strategySpecSchema, type FeatureKey, type Market, type StrategySpec } from '@/strategy/spec';

const featuresFor = (market: Market) =>
  (Object.keys(FEATURES) as FeatureKey[]).filter((key) => (FEATURES[key].markets as readonly Market[]).includes(market));

const toNumber = (value: string): number | undefined => (value.trim() === '' || Number.isNaN(Number(value)) ? undefined : Number(value));

const STARTER: StrategySpec = {
  name: 'My strategy',
  summary: 'Describe the idea in a sentence or two.',
  market: 'spread',
  filters: [],
  score: [{ feature: 'eloSpreadEdge', weight: 1 }],
  picksPerWeek: 10,
};

type Conference = (typeof CONFERENCES)[number];

function ConferencePicker({ legend, value, onChange, hint }: { legend: string; value?: Conference[]; onChange: (value?: Conference[]) => void; hint: string }) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="chips">
        {CONFERENCES.map((conference) => {
          const selected = value?.includes(conference) ?? false;
          const next = selected ? value!.filter((c) => c !== conference) : [...(value ?? []), conference];
          return (
            <button key={conference} type="button" className="secondary small" aria-pressed={selected} onClick={() => onChange(next.length ? next : undefined)}>
              {conference}
            </button>
          );
        })}
      </div>
      <p className="fine">{hint}</p>
    </fieldset>
  );
}

export function RuleEditor({ spec, onClose, onRun }: { spec?: StrategySpec; onClose: () => void; onRun: (spec: StrategySpec) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<StrategySpec>(spec ?? STARTER);
  const [errors, setErrors] = useState<string[]>([]);
  const available = featuresFor(draft.market);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const update = (patch: Partial<StrategySpec>) => setDraft((current) => ({ ...current, ...patch }));

  const changeMarket = (market: Market) => {
    const allowed = new Set(featuresFor(market));
    const score = draft.score.filter((s) => allowed.has(s.feature));
    update({
      market,
      books: market === 'moneyline' ? draft.books : undefined,
      opponentConferences: market === 'total' ? undefined : draft.opponentConferences,
      filters: draft.filters.filter((f) => allowed.has(f.feature)),
      score: score.length ? score : [{ feature: market === 'total' ? 'total' : 'spread', weight: 1 }],
    });
  };

  const run = () => {
    const parsed = strategySpecSchema.safeParse(draft);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((issue) => issue.message));
      return;
    }
    onRun(parsed.data);
  };

  return (
    <dialog ref={dialog} className="sheet" onClose={onClose} aria-labelledby="rule-editor-title">
      <div className="sheet-grip" aria-hidden="true" />
      <header className="sheet-head">
        <h2 id="rule-editor-title">Edit rules</h2>
        <button type="button" className="icon" onClick={() => dialog.current?.close()} aria-label="Close">
          ×
        </button>
      </header>

      <div className="sheet-body">
        <label>
          Name
          <input value={draft.name} onChange={(e) => update({ name: e.target.value })} maxLength={60} />
        </label>

        <fieldset>
          <legend>Market</legend>
          <div className="segmented">
            {MARKETS.map((market) => (
              <button key={market} type="button" className={draft.market === market ? 'active' : undefined} onClick={() => changeMarket(market)}>
                {market}
              </button>
            ))}
          </div>
        </fieldset>

        <ConferencePicker
          legend="Team conference"
          value={draft.conferences}
          onChange={(conferences) => update({ conferences })}
          hint={draft.market === 'total' ? 'None selected means every conference. For totals, either team counts.' : 'None selected means every conference.'}
        />
        {draft.market !== 'total' && (
          <ConferencePicker
            legend="Opponent conference"
            value={draft.opponentConferences}
            onChange={(opponentConferences) => update({ opponentConferences })}
            hint="Use this to fade a conference."
          />
        )}

        <fieldset>
          <legend>Only bet when</legend>
          {draft.filters.length === 0 && <p className="fine">No filters — every candidate qualifies.</p>}
          {draft.filters.map((filter, index) => {
            const meta = FEATURES[filter.feature];
            const setFilter = (patch: Partial<typeof filter>) =>
              update({ filters: draft.filters.map((f, i) => (i === index ? { ...f, ...patch } : f)) });
            return (
              <div key={index} className="rule-row">
                <select value={filter.feature} onChange={(e) => setFilter({ feature: e.target.value as FeatureKey, min: undefined, max: undefined })}>
                  {available.map((key) => (
                    <option key={key} value={key}>
                      {FEATURES[key].label}
                    </option>
                  ))}
                </select>
                {meta.unit === 'flag' ? (
                  <div className="segmented small">
                    <button type="button" className={filter.min === 1 ? 'active' : undefined} onClick={() => setFilter({ min: 1, max: undefined })}>
                      Yes
                    </button>
                    <button type="button" className={filter.max === 0 ? 'active' : undefined} onClick={() => setFilter({ min: undefined, max: 0 })}>
                      No
                    </button>
                  </div>
                ) : (
                  <div className="range-inputs">
                    <input inputMode="decimal" placeholder="min" value={filter.min ?? ''} onChange={(e) => setFilter({ min: toNumber(e.target.value) })} aria-label={`${meta.label} minimum`} />
                    <span>to</span>
                    <input inputMode="decimal" placeholder="max" value={filter.max ?? ''} onChange={(e) => setFilter({ max: toNumber(e.target.value) })} aria-label={`${meta.label} maximum`} />
                  </div>
                )}
                <button type="button" className="icon" onClick={() => update({ filters: draft.filters.filter((_, i) => i !== index) })} aria-label="Remove filter">
                  ×
                </button>
                <p className="fine rule-help">{meta.description}</p>
              </div>
            );
          })}
          {draft.filters.length < 8 && (
            <button type="button" className="secondary add" onClick={() => update({ filters: [...draft.filters, { feature: available[0]!, min: 0 }] })}>
              + Add filter
            </button>
          )}
        </fieldset>

        <fieldset>
          <legend>Rank picks by</legend>
          {draft.score.map((score, index) => (
            <div key={index} className="rule-row">
              <select
                value={score.feature}
                onChange={(e) => update({ score: draft.score.map((s, i) => (i === index ? { ...s, feature: e.target.value as FeatureKey } : s)) })}
              >
                {available.map((key) => (
                  <option key={key} value={key}>
                    {FEATURES[key].label}
                  </option>
                ))}
              </select>
              <div className="stepper">
                <button type="button" className="secondary" onClick={() => update({ score: draft.score.map((s, i) => (i === index ? { ...s, weight: Math.max(-5, s.weight - 0.5) } : s)) })} aria-label="Less weight">
                  −
                </button>
                <span className="mono">{score.weight > 0 ? `+${score.weight}` : score.weight}</span>
                <button type="button" className="secondary" onClick={() => update({ score: draft.score.map((s, i) => (i === index ? { ...s, weight: Math.min(5, s.weight + 0.5) } : s)) })} aria-label="More weight">
                  +
                </button>
              </div>
              {draft.score.length > 1 && (
                <button type="button" className="icon" onClick={() => update({ score: draft.score.filter((_, i) => i !== index) })} aria-label="Remove ranking factor">
                  ×
                </button>
              )}
            </div>
          ))}
          <p className="fine">Positive weight prefers higher values; negative prefers lower.</p>
          {draft.score.length < 4 && (
            <button type="button" className="secondary add" onClick={() => update({ score: [...draft.score, { feature: available[0]!, weight: 1 }] })}>
              + Add ranking factor
            </button>
          )}
        </fieldset>

        <fieldset>
          <legend>
            Picks per week <span className="mono">{draft.picksPerWeek}</span>
          </legend>
          <input type="range" min={1} max={20} value={draft.picksPerWeek} onChange={(e) => update({ picksPerWeek: Number(e.target.value) })} />
        </fieldset>

        <fieldset>
          <legend>
            Minimum strength <span className="mono">{draft.minStrength ?? 'off'}</span>
          </legend>
          <input type="range" min={0} max={95} step={5} value={draft.minStrength ?? 0} onChange={(e) => update({ minStrength: Number(e.target.value) || undefined })} />
        </fieldset>

        {errors.length > 0 && (
          <ul className="notice neg">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>

      <footer className="sheet-foot">
        <button type="button" className="secondary" onClick={() => dialog.current?.close()}>
          Cancel
        </button>
        <button type="button" onClick={run}>
          Run backtest
        </button>
      </footer>
    </dialog>
  );
}

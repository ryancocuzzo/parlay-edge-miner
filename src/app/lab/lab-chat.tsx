'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type InferUITools, type UIDataTypes, type UIMessage } from 'ai';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { RuleChips } from '@/components/strategy/stats';
import { signedPct, tone } from '@/lib/format';
import type { LabTools } from '@/lab/tools';
import { FEATURES, strategySpecSchema, type StrategySpec } from '@/strategy/spec';
import { BacktestCard } from './backtest-card';
import { RuleEditor } from './rule-editor';

export type LabMessage = UIMessage<unknown, UIDataTypes, InferUITools<LabTools>>;
type Part = LabMessage['parts'][number];

const SUGGESTIONS = [
  'Moneyline underdogs that Elo likes more than the market',
  'Home underdogs on the spread in conference games',
  'Unders when the total is high',
  'Why did the original board lose money?',
  'Top-10 teams after playing a ranked opponent',
];

const GROUP_LABELS = {
  venue: 'Venues',
  team: 'Teams',
  opponent: 'Opponents',
  conference: 'Conferences',
  opponentConference: 'Opponent conferences',
  apRank: 'AP rank',
  opponentApRank: 'Opponent AP rank',
  season: 'Seasons',
} as const;

const EDITED_SPEC = /```json\n([\s\S]*?)\n```/;

const editedSpec = (text: string): StrategySpec | undefined => {
  const match = EDITED_SPEC.exec(text);
  if (!match) return undefined;
  try {
    const parsed = strategySpecSchema.safeParse(JSON.parse(match[1]!));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

const Working = ({ label }: { label: string }) => (
  <p className="tool-line working">
    <span className="spinner" aria-hidden="true" />
    {label}
  </p>
);

function ToolPart({ part, onEdit }: { part: Part; onEdit: (spec: StrategySpec) => void }) {
  if (part.type === 'tool-getDataCatalog') {
    return part.state === 'output-available' ? <p className="tool-line">Checked data coverage</p> : <Working label="Checking data coverage…" />;
  }
  if (part.type === 'tool-featureDistribution') {
    const label = part.input?.feature ? `${FEATURES[part.input.feature].label} · ${part.input.market}` : '';
    if (part.state !== 'output-available') return <Working label={`Studying ${label}…`} />;
    const output = part.output;
    return (
      <details className="tool-line">
        <summary>Studied {label} in 2019–23 games</summary>
        {'quintiles' in output && output.quintiles && (
          <>
            <p className="fine">Every 2019–23 bet, split into five equal groups by value.</p>
            <ul className="quintiles">
              {output.quintiles.map((q, i) => (
                <li key={i}>
                  <span className="mono">
                    {q.from} to {q.to}
                  </span>
                  <span className="mono">{q.record}</span>
                  <span className={`mono ${tone(q.roi) ?? ''}`}>{signedPct(q.roi)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </details>
    );
  }
  if (part.type === 'tool-compareGroups') {
    const label = part.input?.groupBy ? `${GROUP_LABELS[part.input.groupBy]} · ${part.input.market}` : '';
    if (part.state !== 'output-available') return <Working label={`Comparing ${label}…`} />;
    const { best, buildLeadersInBlindTest: leaders } = part.output;
    return (
      <details className="tool-line">
        <summary>Compared {label}</summary>
        <p className="fine">Best groups by ROI: 2019–23, then the blind test (2024 on).</p>
        <ul className="quintiles">
          {best.map((group) => (
            <li key={group.label}>
              <span>{group.label}</span>
              <span className={`mono ${tone(group.buildSeasons.roi) ?? ''}`}>{signedPct(group.buildSeasons.roi)}</span>
              <span className={`mono ${tone(group.blindTest.roi) ?? ''}`}>{signedPct(group.blindTest.roi)}</span>
            </li>
          ))}
        </ul>
        <p className="fine">
          The 2019–23 top {leaders.groups.length} in the blind test: {leaders.record}, {signedPct(leaders.roi)}
        </p>
      </details>
    );
  }
  if (part.type === 'tool-runBacktest') {
    if (part.state === 'output-error') return <p className="notice neg">Backtest failed: {part.errorText}</p>;
    if (part.state !== 'output-available') return <div className="bt-card skeleton"><Working label="Backtesting every week since 2019…" /></div>;
    if (!part.output.ok) return <p className="notice neg">Rules rejected: {part.output.errors.join('; ')}</p>;
    return <BacktestCard runId={part.output.runId} spec={part.output.spec} report={part.output.report} onEdit={onEdit} />;
  }
  return null;
}

function Message({ message, onEdit }: { message: LabMessage; onEdit: (spec: StrategySpec) => void }) {
  if (message.role === 'user') {
    const text = message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
    const spec = editedSpec(text);
    return (
      <div className="msg user">
        {spec ? (
          <div className="bubble edited">
            <strong>Edited rules · {spec.name}</strong>
            <RuleChips spec={spec} />
          </div>
        ) : (
          <div className="bubble">{text}</div>
        )}
      </div>
    );
  }
  return (
    <div className="msg assistant">
      <span className="msg-author">Analyst</span>
      {message.parts.map((part, index) =>
        part.type === 'text' ? (
          <div key={index} className="assistant-text">
            <Markdown allowedElements={['p', 'strong', 'em', 'code', 'ul', 'ol', 'li']} unwrapDisallowed>
              {part.text}
            </Markdown>
          </div>
        ) : (
          <ToolPart key={index} part={part} onEdit={onEdit} />
        ),
      )}
    </div>
  );
}

export function LabChat({
  threadId,
  initialMessages,
  threads,
}: {
  threadId: string;
  initialMessages: LabMessage[];
  threads: Array<{ id: string; title: string; updatedAt: string }>;
}) {
  const { messages, sendMessage, status, stop, error, regenerate, clearError } = useChat<LabMessage>({
    id: threadId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState<{ spec?: StrategySpec }>();
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    if (messages.length === 0) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, status]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    if (messages.length === 0) window.history.replaceState(null, '', `/lab?thread=${threadId}`);
    clearError();
    void sendMessage({ text });
    setInput('');
  };

  const runEdited = (spec: StrategySpec) => {
    setEditing(undefined);
    send(`Backtest these edited rules exactly as written:\n\`\`\`json\n${JSON.stringify(spec)}\n\`\`\``);
  };

  return (
    <div className="lab">
      <div className="lab-head">
        <h1>Lab</h1>
        <div className="lab-tools">
          <button type="button" className="secondary" onClick={() => setEditing({})}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6" />
            </svg>
            Rules
          </button>
          <button type="button" className="secondary" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 7v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z" />
            </svg>
            History
          </button>
        </div>
      </div>

      {showHistory && (
        <nav className="history" aria-label="Previous chats">
          <Link href="/lab" className="history-new">
            New chat
          </Link>
          {threads.map((thread) => (
            <Link key={thread.id} href={`/lab?thread=${thread.id}`} className={thread.id === threadId ? 'active' : undefined}>
              <span>{thread.title}</span>
              <time>{new Date(thread.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</time>
            </Link>
          ))}
          {threads.length === 0 && <p className="fine">No saved chats yet.</p>}
        </nav>
      )}

      <div className="thread">
        {messages.length === 0 && (
          <div className="lab-empty">
            <h2>What should we test?</h2>
            <p className="lede">Describe a betting idea in plain English. Your analyst turns it into exact rules and tells you honestly whether it would have made money.</p>
            <ol className="steps">
              <li>
                <strong>Describe</strong>
                <span>an idea, like “home underdogs after a loss”</span>
              </li>
              <li>
                <strong>Test</strong>
                <span>rules are built on 2019–23, then run blind on 2024 onward</span>
              </li>
              <li>
                <strong>Track</strong>
                <span>save what holds up to get a weekly pick board</span>
              </li>
            </ol>
            <p className="eyebrow">Try one</p>
            <div className="suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" className="suggestion" onClick={() => send(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message) => (
          <Message key={message.id} message={message} onEdit={(spec) => setEditing({ spec })} />
        ))}
        {status === 'submitted' && <Working label="Thinking…" />}
        {error && (
          <div className="notice neg">
            <p>{error.message || 'Something went wrong.'}</p>
            <button type="button" className="secondary" onClick={() => regenerate()}>
              Retry
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder="Describe a strategy or ask a question…"
          aria-label="Message"
          enterKeyHint="send"
        />
        {busy ? (
          <button type="button" className="send stop" onClick={() => stop()} aria-label="Stop">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="7" y="7" width="10" height="10" rx="2" />
            </svg>
          </button>
        ) : (
          <button type="submit" className="send" disabled={!input.trim()} aria-label="Send">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        )}
      </form>

      {editing && <RuleEditor spec={editing.spec} onClose={() => setEditing(undefined)} onRun={runEdited} />}
    </div>
  );
}

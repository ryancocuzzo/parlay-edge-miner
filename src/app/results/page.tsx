import { listBenchmarks, latestSnapshot } from '@/lib/store';
import { prisma } from '@/lib/prisma';
import { pct, unitPl } from '@/lib/format';
import { hitRate, type SettledSlate } from '@/settle';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const strategyLabel: Record<string, string> = {
  single: 'Singles',
  two_leg: '2-leg parlays',
  three_leg: '3-leg parlays',
};

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ strategy?: string; book?: string }>;
}) {
  const params = await searchParams;
  const strategyFilter = params.strategy;
  const bookFilter = params.book;

  const benchmarks = await listBenchmarks();
  const settledRows = await prisma.slateSnapshot.findMany({
    where: { settledAt: { not: null }, settled: { not: Prisma.DbNull } },
    orderBy: { settledAt: 'desc' },
    take: 50,
  });
  const latest = await latestSnapshot();

  const picks = settledRows.flatMap((row) => {
    const settled = row.settled as unknown as SettledSlate;
    const singles = settled.legs.map((leg) => ({
      kind: 'single' as const,
      when: row.settledAt!,
      book: leg.bookTitle,
      label: `${leg.side} ${leg.american > 0 ? '+' : ''}${leg.american} ${leg.bookTitle}`,
      won: leg.won,
      profit: leg.profit,
    }));
    const parlays = settled.parlays.map((parlay) => ({
      kind: (parlay.legs.length === 2 ? 'two_leg' : 'three_leg') as 'two_leg' | 'three_leg',
      when: row.settledAt!,
      book: parlay.legs.map((l) => l.bookTitle).join('/'),
      label: parlay.legs.map((l) => l.side).join(' + '),
      won: parlay.won,
      profit: parlay.profit,
    }));
    return [...singles, ...parlays];
  });

  const filtered = picks.filter((pick) => {
    if (strategyFilter && pick.kind !== strategyFilter) return false;
    if (bookFilter && !pick.book.toLowerCase().includes(bookFilter.toLowerCase())) return false;
    return true;
  });

  const record = {
    n: filtered.length,
    wins: filtered.filter((p) => p.won).length,
    unitPl: filtered.reduce((sum, p) => sum + p.profit, 0),
  };

  return (
    <div>
      <h1>Results</h1>
      <p className="lede">
        Fixture benchmarks are locked in Vitest against committed NCAAF history. Live rows roll up weekly from
        settled snapshots.
      </p>

      <section className="panel">
        <h2>Strategy benchmarks</h2>
        {benchmarks.length === 0 ? (
          <p className="empty">No benchmarks yet. Run seed or weekly cron.</p>
        ) : (
          <>
            <div className="cards mobile-only">
              {benchmarks.map((row) => (
                <article key={row.id} className="pick-card">
                  <div className="pick-top">
                    <div>
                      <div className="side-cell">{strategyLabel[row.strategy] ?? row.strategy}</div>
                      <div className="pick-book">
                        <span className="tag">{row.source}</span> · {row.weekStart.toISOString().slice(0, 10)}
                      </div>
                    </div>
                    <div className={`pick-ev ${row.unitPl >= 0 ? 'pos' : 'neg'}`}>{unitPl(row.unitPl)}</div>
                  </div>
                  <div className="pick-row">
                    <span>
                      {row.wins}-{row.n - row.wins}
                    </span>
                    <span>Hit {pct(hitRate(row.wins, row.n))}</span>
                  </div>
                </article>
              ))}
            </div>
            <div className="table-wrap desktop-only">
              <table>
                <thead>
                  <tr>
                    <th>Strategy</th>
                    <th>Source</th>
                    <th>Week</th>
                    <th>Record</th>
                    <th>Hit</th>
                    <th>Unit P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarks.map((row) => (
                    <tr key={row.id}>
                      <td>{strategyLabel[row.strategy] ?? row.strategy}</td>
                      <td>
                        <span className="tag">{row.source}</span>
                      </td>
                      <td className="mono">{row.weekStart.toISOString().slice(0, 10)}</td>
                      <td className="mono">
                        {row.wins}-{row.n - row.wins}
                      </td>
                      <td className="mono">{pct(hitRate(row.wins, row.n))}</td>
                      <td className={`mono ${row.unitPl >= 0 ? 'pos' : 'neg'}`}>{unitPl(row.unitPl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Settled picks</h2>
        <form className="stack" method="get" style={{ marginBottom: '1rem', maxWidth: '100%' }}>
          <div className="grid2">
            <label>
              Strategy
              <select name="strategy" defaultValue={strategyFilter ?? ''}>
                <option value="">All</option>
                <option value="single">Singles</option>
                <option value="two_leg">2-leg</option>
                <option value="three_leg">3-leg</option>
              </select>
            </label>
            <label>
              Book contains
              <input name="book" defaultValue={bookFilter ?? ''} placeholder="DraftKings" />
            </label>
          </div>
          <button type="submit" className="secondary">
            Filter
          </button>
        </form>
        <div className="meta">
          <span>
            Record {record.wins}-{record.n - record.wins}
          </span>
          <span>Hit {pct(hitRate(record.wins, record.n))}</span>
          <span className={record.unitPl >= 0 ? 'pos' : 'neg'}>{unitPl(record.unitPl)}</span>
          {latest?.settledAt ? (
            <span>Latest settle {latest.settledAt.toISOString().slice(0, 10)}</span>
          ) : undefined}
        </div>
        {filtered.length === 0 ? (
          <p className="empty">No settled picks for this filter.</p>
        ) : (
          <>
            <div className="cards mobile-only">
              {filtered.map((pick, index) => (
                <article key={`${pick.when.toISOString()}-${index}`} className="pick-card">
                  <div className="pick-top">
                    <div>
                      <div className="side-cell">{pick.label}</div>
                      <div className="pick-book">
                        {strategyLabel[pick.kind]} · {pick.when.toISOString().slice(0, 10)}
                      </div>
                    </div>
                    <span className={`tag ${pick.won ? 'win' : 'loss'}`}>{pick.won ? 'Win' : 'Loss'}</span>
                  </div>
                  <div className="pick-row">
                    <span className={pick.profit >= 0 ? 'pos' : 'neg'}>{unitPl(pick.profit)}</span>
                  </div>
                </article>
              ))}
            </div>
            <div className="table-wrap desktop-only">
              <table className="compact">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Kind</th>
                    <th>Pick</th>
                    <th>Result</th>
                    <th>P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pick, index) => (
                    <tr key={`${pick.when.toISOString()}-${index}`}>
                      <td className="mono">{pick.when.toISOString().slice(0, 10)}</td>
                      <td>{strategyLabel[pick.kind]}</td>
                      <td>{pick.label}</td>
                      <td>
                        <span className={`tag ${pick.won ? 'win' : 'loss'}`}>{pick.won ? 'Win' : 'Loss'}</span>
                      </td>
                      <td className={`mono ${pick.profit >= 0 ? 'pos' : 'neg'}`}>{unitPl(pick.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

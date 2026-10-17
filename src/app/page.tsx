import { latestSnapshot } from '@/lib/store';
import { pct, formatAmerican } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  const snapshot = await latestSnapshot();

  if (!snapshot) {
    return (
      <div>
        <h1>Today&apos;s board</h1>
        <p className="lede">
          Fair probability = Pinnacle moneyline with vig removed. +EV when another book pays more than that
          fair price.
        </p>
        <p className="empty">No slate yet. An admin can refresh from Admin, or wait for cron.</p>
      </div>
    );
  }

  const { slate, games, fetchedAt } = snapshot;
  const gameById = new Map(games.map((game) => [game.id, game]));

  return (
    <div>
      <h1>Today&apos;s board</h1>
      <p className="lede">
        Fair = Pinnacle two-way moneyline, vig removed. EV = fair × decimal − 1. Every number below is an input
        that priced this slate.
      </p>
      <div className="meta">
        <span>
          Fetched <span className="mono">{fetchedAt.toISOString()}</span>
        </span>
        <span>{slate.gamesInWindow} games in window</span>
        <span>{slate.pricedGames} with Pinnacle</span>
        <span>{slate.legs.length} +EV legs</span>
      </div>

      <section className="panel">
        <h2>+EV singles</h2>
        {slate.legs.length === 0 ? (
          <p className="empty">No +EV legs on this slate.</p>
        ) : (
          <>
            <div className="cards mobile-only">
              {slate.legs.map((leg) => {
                const game = gameById.get(leg.gameId);
                const pinHome = game?.quotes.find((q) => q.book === 'pinnacle' && q.side === 'home');
                const pinAway = game?.quotes.find((q) => q.book === 'pinnacle' && q.side === 'away');
                return (
                  <article key={`${leg.gameId}-${leg.side}-${leg.book}`} className="pick-card">
                    <div className="pick-top">
                      <div>
                        <div className="side-cell">{leg.side}</div>
                        <div className="formula">
                          {game?.away} @ {game?.home}
                        </div>
                      </div>
                      <div className={`pick-ev ${leg.ev > 0 ? 'pos' : 'neg'}`}>{pct(leg.ev)}</div>
                    </div>
                    <div className="pick-book">{leg.bookTitle}</div>
                    <div className="pick-row">
                      <span>Price {formatAmerican(leg.american)}</span>
                      <span>Fair {pct(leg.fair)}</span>
                      <span>
                        Pin {pinHome ? formatAmerican(pinHome.american) : '—'} /{' '}
                        {pinAway ? formatAmerican(pinAway.american) : '—'}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="table-wrap desktop-only">
              <table>
                <thead>
                  <tr>
                    <th>Side</th>
                    <th>Book</th>
                    <th>Price</th>
                    <th>Fair</th>
                    <th>EV</th>
                    <th>Pinnacle</th>
                  </tr>
                </thead>
                <tbody>
                  {slate.legs.map((leg) => {
                    const game = gameById.get(leg.gameId);
                    const pinHome = game?.quotes.find((q) => q.book === 'pinnacle' && q.side === 'home');
                    const pinAway = game?.quotes.find((q) => q.book === 'pinnacle' && q.side === 'away');
                    return (
                      <tr key={`${leg.gameId}-${leg.side}-${leg.book}`}>
                        <td>
                          <div className="side-cell">{leg.side}</div>
                          <div className="formula">
                            {game?.away} @ {game?.home}
                          </div>
                        </td>
                        <td>{leg.bookTitle}</td>
                        <td className="mono">{formatAmerican(leg.american)}</td>
                        <td className="mono">{pct(leg.fair)}</td>
                        <td className={`mono ${leg.ev > 0 ? 'pos' : 'neg'}`}>{pct(leg.ev)}</td>
                        <td className="mono">
                          {pinHome ? formatAmerican(pinHome.american) : '—'} /{' '}
                          {pinAway ? formatAmerican(pinAway.american) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Top parlays</h2>
        {slate.parlays.length === 0 ? (
          <p className="empty">No +EV parlays.</p>
        ) : (
          <>
            <div className="cards mobile-only">
              {slate.parlays.slice(0, 10).map((parlay, index) => (
                <article key={index} className="pick-card">
                  <div className="pick-top">
                    <div className="side-cell">#{index + 1}</div>
                    <div className="pick-ev pos">{pct(parlay.ev)}</div>
                  </div>
                  {parlay.legs.map((leg) => (
                    <div key={`${leg.gameId}-${leg.side}`} className="pick-book">
                      {leg.side} {formatAmerican(leg.american)} · {leg.bookTitle}
                    </div>
                  ))}
                  <div className="pick-row">
                    <span>
                      {parlay.legs.length}-leg · {parlay.decimal.toFixed(3)}
                    </span>
                    <span>Fair {pct(parlay.fair)}</span>
                  </div>
                </article>
              ))}
            </div>
            <div className="table-wrap desktop-only">
              <table className="compact">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Legs</th>
                    <th>EV</th>
                    <th>Fair</th>
                  </tr>
                </thead>
                <tbody>
                  {slate.parlays.slice(0, 10).map((parlay, index) => (
                    <tr key={index}>
                      <td className="mono">{index + 1}</td>
                      <td>
                        {parlay.legs.map((leg) => (
                          <div key={`${leg.gameId}-${leg.side}`}>
                            {leg.side} {formatAmerican(leg.american)} · {leg.bookTitle}
                          </div>
                        ))}
                        <div className="formula">
                          {parlay.legs.length}-leg · decimal {parlay.decimal.toFixed(3)}
                        </div>
                      </td>
                      <td className="mono pos">{pct(parlay.ev)}</td>
                      <td className="mono">{pct(parlay.fair)}</td>
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

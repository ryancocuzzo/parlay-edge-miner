import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/legacy/week-4-2026.json';
import { buildTeamIndex, normalizeTeamName } from '../data/teams';
import { gradeCandidate } from './candidates';
import { legacyParlayRecord, legacyPicksFromSnapshots, type LegacySnapshot } from './legacy';

const snapshot = { ...fixture.snapshot, fetchedAt: new Date(fixture.snapshot.fetchedAt) } as LegacySnapshot;
const cfbGames = fixture.cfbGames.map((game) => ({ ...game, completed: true, startsAt: new Date(game.startsAt) }));
const teamIndex = buildTeamIndex(fixture.teams);

describe('legacyPicksFromSnapshots', () => {
  it('maps each +EV leg to its CFBD game and side, keeping the first price seen', () => {
    const later = { ...snapshot, id: 'later', fetchedAt: new Date('2026-09-25T06:00:00Z'), legs: snapshot.legs.map((leg) => ({ ...leg, american: 150 })) };

    const { picks, unmatched } = legacyPicksFromSnapshots([later, snapshot], teamIndex, cfbGames, new Set());

    expect(unmatched).toEqual([]);
    expect(picks.map((p) => [p.gameId, p.selection, p.team, p.price])).toEqual([
      [401858461, 'away', 'Northwestern', 1100],
      [401862778, 'home', 'UAB', 235],
      [401858234, 'home', 'California', 108],
    ]);
    expect(picks[0]?.inputs).toMatchObject({ pinnacleHome: -1601, pinnacleAway: 894, snapshotId: snapshot.id });
  });

  it('skips game sides that were already imported', () => {
    const { picks } = legacyPicksFromSnapshots([snapshot], teamIndex, cfbGames, new Set(['401862778:home']));

    expect(picks.map((p) => p.team)).toEqual(['Northwestern', 'California']);
  });
});

describe('legacyParlayRecord', () => {
  it('counts every distinct combination once and loses it on any losing leg', () => {
    const { picks } = legacyPicksFromSnapshots([snapshot], teamIndex, cfbGames, new Set());
    const resultBySide = new Map(
      picks.map((pick) => [pick.team, gradeCandidate({ ...pick, market: 'moneyline' }, cfbGames.find((g) => g.id === pick.gameId)!)?.result]),
    );

    const record = legacyParlayRecord([snapshot, snapshot], (leg) => resultBySide.get(teamIndex.get(normalizeTeamName(leg.side))!));

    expect([...resultBySide.values()]).toEqual(['loss', 'win', 'loss']);
    expect(record).toMatchObject({ rowsShown: 8, unique: 4, pending: 0 });
    expect(record.twoLeg.map((p) => p.result)).toEqual(['loss', 'loss', 'loss']);
    expect(record.threeLeg.map((p) => p.result)).toEqual(['loss']);
  });
});

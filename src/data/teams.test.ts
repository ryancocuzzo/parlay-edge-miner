import { describe, expect, it } from 'vitest';
import { buildTeamIndex, matchGame, normalizeTeamName } from './teams';

const teams = [
  { school: 'UCF', mascot: 'Knights', alternateNames: ['Central Florida', 'UCF'] },
  { school: 'Gardner-Webb', mascot: "Runnin' Bulldogs", alternateNames: ['Gardner Webb', 'GWEB'] },
  { school: 'Sam Houston', mascot: 'Bearkats', alternateNames: ['Sam Houston State', 'SHSU'] },
  { school: "Hawai'i", mascot: 'Rainbow Warriors', alternateNames: ['HAW'] },
  { school: 'San José State', mascot: 'Spartans', alternateNames: ['San Jose St.'] },
  { school: 'Miami', mascot: 'Hurricanes', alternateNames: [] },
  { school: 'Miami (OH)', mascot: 'RedHawks', alternateNames: ['Miami OH'] },
];

describe('team matching', () => {
  const index = buildTeamIndex(teams);

  it('maps Odds API "school mascot" names to CFBD schools across punctuation, accents and alternates', () => {
    const resolve = (name: string) => index.get(normalizeTeamName(name));

    expect(resolve('UCF Knights')).toBe('UCF');
    expect(resolve('Gardner-Webb Runnin Bulldogs')).toBe('Gardner-Webb');
    expect(resolve('Sam Houston State Bearkats')).toBe('Sam Houston');
    expect(resolve('Hawaii Rainbow Warriors')).toBe("Hawai'i");
    expect(resolve('San Jose State Spartans')).toBe('San José State');
    expect(resolve('Miami Hurricanes')).toBe('Miami');
    expect(resolve('Miami (OH) RedHawks')).toBe('Miami (OH)');
  });

  it('matches an event to the CFBD game within the kickoff window regardless of listed home side', () => {
    const games = [
      { id: 1, homeTeam: 'UCF', awayTeam: 'Sam Houston', startsAt: new Date('2026-10-11T23:00:00Z') },
      { id: 2, homeTeam: 'UCF', awayTeam: 'Sam Houston', startsAt: new Date('2025-10-11T23:00:00Z') },
    ];

    const match = matchGame(
      { home: 'Sam Houston State Bearkats', away: 'UCF Knights', startsAt: new Date('2026-10-11T23:30:00Z') },
      index,
      games,
    );

    expect(match?.id).toBe(1);
  });

  it('returns undefined when a team name is unknown', () => {
    const match = matchGame(
      { home: 'Nowhere Tech Owls', away: 'UCF Knights', startsAt: new Date('2026-10-11T23:00:00Z') },
      index,
      [],
    );

    expect(match).toBeUndefined();
  });
});

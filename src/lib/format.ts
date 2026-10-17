export const formatAmerican = (american: number): string => {
  const rounded = Math.round(american);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
};

export const formatLine = (line: number): string => (line > 0 ? `+${line}` : line === 0 ? 'PK' : `${line}`);

export const pct = (value: number, digits = 1): string => `${(value * 100).toFixed(digits)}%`;

export const signedPct = (value: number, digits = 1): string => `${value > 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;

export const signedNumber = (value: number, digits = 2): string => `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;

export const units = (value: number): string => `${signedNumber(value)} units`;

export const tone = (value: number): 'pos' | 'neg' | undefined => (value > 0 ? 'pos' : value < 0 ? 'neg' : undefined);

export const shortDate = (date: Date): string =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });

export const kickoff = (date: Date): string =>
  date.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

export const weekLabel = (seasonType: string, week: number): string =>
  seasonType === 'postseason' ? 'Bowls' : `Week ${week}`;

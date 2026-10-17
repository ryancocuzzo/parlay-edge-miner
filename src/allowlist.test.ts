import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './allowlist';

describe('normalizeEmail', () => {
  it('collapses gmail dots, plus tags, case and googlemail', () => {
    expect(normalizeEmail(' Ryan.Cocuzzo+bets@GMAIL.com ')).toBe('ryancocuzzo@gmail.com');
    expect(normalizeEmail('ryan.cocuzzo@googlemail.com')).toBe('ryancocuzzo@gmail.com');
  });

  it('keeps dots and plus tags for other domains', () => {
    expect(normalizeEmail('First.Last+x@Example.com')).toBe('first.last+x@example.com');
  });
});

import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('requires the odds key and treats Twilio as all or nothing', () => {
    expect(parseEnv({ ODDS_API_KEY: 'odds' })).toEqual({ oddsApiKey: 'odds' });
    expect(
      parseEnv({
        ODDS_API_KEY: 'odds',
        TWILIO_SID: 'sid',
        TWILIO_TOKEN: 'token',
        TWILIO_FROM: '+1',
        TWILIO_TO: '+2',
      }).twilio,
    ).toEqual({ sid: 'sid', token: 'token', from: '+1', to: '+2' });
    expect(() => parseEnv({ ODDS_API_KEY: 'odds', TWILIO_SID: 'sid' })).toThrow('all of TWILIO');
  });
});

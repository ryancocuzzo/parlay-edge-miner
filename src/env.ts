import { z } from 'zod';
import { TwilioConfig } from './run';

const envSchema = z.object({
  ODDS_API_KEY: z.string().min(1),
  TWILIO_SID: z.string().min(1).optional(),
  TWILIO_TOKEN: z.string().min(1).optional(),
  TWILIO_FROM: z.string().min(1).optional(),
  TWILIO_TO: z.string().min(1).optional(),
});

export const parseEnv = (
  env: Record<string, string | undefined>,
): { oddsApiKey: string; twilio?: TwilioConfig } => {
  const parsed = envSchema.parse(env);
  const { ODDS_API_KEY, TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, TWILIO_TO } = parsed;
  if (!TWILIO_SID && !TWILIO_TOKEN && !TWILIO_FROM && !TWILIO_TO) return { oddsApiKey: ODDS_API_KEY };
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM || !TWILIO_TO) {
    throw new Error('Set all of TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, TWILIO_TO, or none of them');
  }
  return {
    oddsApiKey: ODDS_API_KEY,
    twilio: { sid: TWILIO_SID, token: TWILIO_TOKEN, from: TWILIO_FROM, to: TWILIO_TO },
  };
};

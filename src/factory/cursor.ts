import { z } from 'zod';

const CURSOR_API = 'https://api.cursor.com/v1';
export const REPO_URL = 'https://github.com/ryancocuzzo/parlay-edge-miner';

const runSchema = z.object({
  id: z.string(),
  status: z.enum(['CREATING', 'RUNNING', 'FINISHED', 'ERROR', 'CANCELLED', 'EXPIRED']),
  result: z.string().nullish().transform((v) => v ?? undefined),
  git: z
    .object({ branches: z.array(z.object({ branch: z.string().nullish() })) })
    .nullish()
    .transform((v) => v ?? undefined),
});

const createSchema = z.object({ agent: z.object({ id: z.string() }), run: runSchema });

const usageSchema = z.object({
  totalUsage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheReadTokens: z.number(),
    cacheWriteTokens: z.number(),
  }),
});

export type AgentRun = z.infer<typeof runSchema>;
export type Screenshot = { mimeType: string; data: string };

const call = async <T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, init?: RequestInit): Promise<T> => {
  const apiKey = z.string().min(1).parse(process.env.CURSOR_API_KEY);
  const response = await fetch(`${CURSOR_API}${path}`, {
    ...init,
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(`Cursor ${response.status} ${path}: ${(await response.text()).slice(0, 500)}`);
  return schema.parse(await response.json());
};

export const launchAgent = (input: {
  name: string;
  prompt: string;
  images: Screenshot[];
  model: string;
  envVars: Record<string, string>;
}) =>
  call('/agents', createSchema, {
    method: 'POST',
    body: JSON.stringify({
      name: input.name.slice(0, 100),
      prompt: { text: input.prompt, images: input.images },
      model: { id: input.model },
      repos: [{ url: REPO_URL, startingRef: 'main' }],
      workOnCurrentBranch: true,
      envVars: input.envVars,
    }),
  });

export const getRun = (agentId: string, runId: string) => call(`/agents/${agentId}/runs/${runId}`, runSchema);

export const getUsage = async (agentId: string) => (await call(`/agents/${agentId}/usage`, usageSchema)).totalUsage;

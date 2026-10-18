'use server';

import { z } from 'zod';
import { requireUser } from '@/auth';
import { MAX_SCREENSHOTS } from '@/factory/policy';
import { submitRequest, type SubmitResult } from '@/factory/service';

const inputSchema = z.object({
  description: z.string().trim().min(10).max(2000),
  screenshots: z
    .array(z.object({ mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']), data: z.string().max(1_400_000) }))
    .max(MAX_SCREENSHOTS),
});

export async function submitFeatureRequest(description: string, screenshots: unknown[]): Promise<SubmitResult> {
  const user = await requireUser();
  const input = inputSchema.safeParse({ description, screenshots });
  if (!input.success) return { ok: false, message: 'Describe what you want in a sentence or two (at least 10 characters).' };
  return submitRequest(user.email, input.data.description, input.data.screenshots, new Date());
}

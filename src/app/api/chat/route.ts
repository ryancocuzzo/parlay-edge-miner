import { convertToModelMessages, isStepCount, streamText, validateUIMessages, type UIMessage } from 'ai';
import { z } from 'zod';
import { requireUser } from '@/auth';
import { callsSince, recordApiCall } from '@/data/usage';
import { LAB_INSTRUCTIONS, LAB_MODEL } from '@/lab/instructions';
import { labTools } from '@/lab/tools';
import { prisma } from '@/lib/prisma';

export const maxDuration = 120;

const HOURLY_LIMIT = 40;
const bodySchema = z.object({ id: z.string().min(1).max(64), messages: z.array(z.unknown()).min(1) });

const titleFrom = (message: UIMessage | undefined): string => {
  const text = message?.parts.find((part) => part.type === 'text')?.text ?? 'New strategy';
  return text.replace(/```[\s\S]*```/g, 'Edited rules').trim().slice(0, 80) || 'New strategy';
};

export async function POST(request: Request) {
  const user = await requireUser();
  const { id, messages: rawMessages } = bodySchema.parse(await request.json());

  const thread = await prisma.chatThread.findUnique({ where: { id }, select: { userEmail: true } });
  if (thread && thread.userEmail !== user.email) return new Response('Forbidden', { status: 403 });
  if ((await callsSince('llm', new Date(Date.now() - 60 * 60 * 1000), user.email)) >= HOURLY_LIMIT) {
    return new Response(`Limit of ${HOURLY_LIMIT} messages per hour reached`, { status: 429 });
  }

  const tools = labTools(user.email);
  const messages = await validateUIMessages<UIMessage>({ messages: rawMessages, tools });
  await recordApiCall('llm', user.email)({ path: LAB_MODEL, status: 200 });

  const result = streamText({
    model: LAB_MODEL,
    instructions: LAB_INSTRUCTIONS,
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    stopWhen: isStepCount(8),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onEnd: async ({ messages: finalMessages }) => {
      const data = { messages: finalMessages as unknown as object[] };
      await prisma.chatThread.upsert({
        where: { id },
        create: { id, userEmail: user.email, title: titleFrom(finalMessages.find((m) => m.role === 'user')), ...data },
        update: data,
      });
    },
  });
}

import { randomUUID } from 'node:crypto';
import { requireUser } from '@/auth';
import { prisma } from '@/lib/prisma';
import { LabChat, type LabMessage } from './lab-chat';

export const dynamic = 'force-dynamic';

export default async function LabPage({ searchParams }: { searchParams: Promise<{ thread?: string }> }) {
  const [user, { thread: threadId }] = await Promise.all([requireUser(), searchParams]);
  const [threads, thread] = await Promise.all([
    prisma.chatThread.findMany({
      where: { userEmail: user.email },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: { id: true, title: true, updatedAt: true },
    }),
    threadId ? prisma.chatThread.findFirst({ where: { id: threadId, userEmail: user.email } }) : undefined,
  ]);

  return (
    <LabChat
      key={thread?.id ?? 'new'}
      threadId={thread?.id ?? randomUUID()}
      initialMessages={(thread?.messages ?? []) as unknown as LabMessage[]}
      threads={threads.map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt.toISOString() }))}
    />
  );
}

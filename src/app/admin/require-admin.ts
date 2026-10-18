import { notFound } from 'next/navigation';
import { findAllowlisted } from '@/allowlist';
import { requireUser } from '@/auth';

export const requireAdmin = async () => {
  const user = await requireUser();
  if (!(await findAllowlisted(user.email))?.isAdmin) notFound();
  return user;
};

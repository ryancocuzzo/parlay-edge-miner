import { redirect } from 'next/navigation';
import { LEGACY_SLUG } from '@/strategy/legacy';

export default function ResultsPage() {
  redirect(`/strategies/${LEGACY_SLUG}?tab=record`);
}

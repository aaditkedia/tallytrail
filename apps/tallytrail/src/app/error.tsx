'use client';
import { RecoveryPanel } from '@hackathon/ui';

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RecoveryPanel app='TallyTrail' onRetry={retry} />;
}

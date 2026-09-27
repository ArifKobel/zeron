import { GitPullRequest } from 'lucide-react';
import type { ChangeRequest } from '@/types';

const STATE_LABEL = { open: 'Open', merged: 'Merged', closed: 'Closed' } as const;

export function PullRequestBadge({ pr, large }: { pr: ChangeRequest; large?: boolean }) {
  return (
    <a
      className={`pr-badge ${pr.state} ${large ? 'large' : ''}`}
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Pull request ${pr.number}, ${STATE_LABEL[pr.state]}, ${pr.title}`}
      title={pr.title}
      onClick={(e) => e.stopPropagation()}
    >
      <GitPullRequest size={large ? 14 : 10} strokeWidth={2} />
      {pr.number}
    </a>
  );
}

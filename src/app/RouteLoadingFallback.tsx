import React from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  label?: string;
}

export const RouteLoadingFallback: React.FC<Props> = ({ label = 'Loading section...' }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-[300px] flex flex-col items-center justify-center p-8 text-center text-[var(--ca-text-muted)]"
    >
      <div className="w-10 h-10 rounded-xl bg-[var(--ca-brand-soft)] border border-[var(--ca-brand-soft)] flex items-center justify-center mb-3 text-[var(--ca-brand)] animate-spin">
        <Loader2 className="w-5 h-5" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-[var(--ca-text-muted)]">{label}</p>
      <span className="sr-only">Please wait while the section content is loading.</span>
    </div>
  );
};

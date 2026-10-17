import React, { ReactNode, ErrorInfo } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  routeName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RouteErrorBoundary extends (React.Component as any) {
  props!: Props;
  state: State = {
    hasError: false,
    error: null,
  };
  setState!: (state: Partial<State>) => void;




  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[Route Error - ${this.props.routeName || 'Unknown'}]`, error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="p-6 m-4 bg-[var(--ca-surface-1)] border border-[var(--ca-border-default)] rounded-2xl text-center shadow-xl"
        >
          <div className="mx-auto w-12 h-12 rounded-xl bg-[var(--ca-warning-soft)] border border-transparent flex items-center justify-center mb-4 text-[var(--ca-warning)]">
            <AlertCircle className="w-6 h-6" aria-hidden="true" />
          </div>

          <h2 className="text-lg font-bold text-[var(--ca-text-primary)] mb-2">
            Unable to load {this.props.routeName || 'this section'}
          </h2>
          <p className="text-sm text-[var(--ca-text-muted)] max-w-md mx-auto mb-6">
            A temporary issue occurred while loading this view. You can retry loading or return to the main dashboard.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--ca-brand)] hover:bg-[var(--ca-brand-hover)] text-[var(--ca-brand-fg)] font-medium text-sm transition-colors cursor-pointer focus:outline-none focus:ring-3 focus:ring-[var(--ca-focus-ring)]"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Retry Loading
            </button>

            <a
              href="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--ca-surface-2)] hover:bg-[var(--ca-surface-3)] text-[var(--ca-text-primary)] font-medium text-sm transition-colors border border-[var(--ca-border-default)] focus:outline-none focus:ring-3 focus:ring-[var(--ca-focus-ring)]"
            >
              <Home className="w-4 h-4" aria-hidden="true" />
              Dashboard Home
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

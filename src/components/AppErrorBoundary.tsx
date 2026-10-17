import React, { ReactNode, ErrorInfo } from "react";
import { AlertTriangle, RefreshCw, Home, Mail } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends (React.Component as any) {
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
    console.error("[BlackArrow Boot Error]", error, errorInfo);
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
          className="min-h-screen flex items-center justify-center bg-[var(--ca-canvas-0)] text-[var(--ca-text-primary)] p-4 sm:p-6"
        >
          <div className="max-w-md w-full bg-[var(--ca-surface-1)] border border-[var(--ca-border-default)] rounded-2xl p-6 sm:p-8 text-center shadow-2xl">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-[var(--ca-warning-soft)] border border-transparent flex items-center justify-center mb-5 text-[var(--ca-warning)]">
              <AlertTriangle className="w-7 h-7" aria-hidden="true" />
            </div>

            <h1 className="text-xl font-bold text-[var(--ca-text-primary)] mb-2">
              BlackArrow could not start correctly
            </h1>
            <p className="text-sm text-[var(--ca-text-muted)] leading-relaxed mb-6">
              Please refresh the page. If the problem continues, contact contact-086473cbd844@example.invalid.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 justify-center">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--ca-brand)] hover:bg-[var(--ca-brand-hover)] text-[var(--ca-brand-fg)] font-medium text-sm transition-colors cursor-pointer focus:outline-none focus:ring-3 focus:ring-[var(--ca-focus-ring)]"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Refresh Page
              </button>

              <a
                href="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--ca-surface-2)] hover:bg-[var(--ca-surface-3)] text-[var(--ca-text-primary)] font-medium text-sm transition-colors border border-[var(--ca-border-default)] focus:outline-none focus:ring-3 focus:ring-[var(--ca-focus-ring)]"
              >
                <Home className="w-4 h-4" aria-hidden="true" />
                Return to Login
              </a>
            </div>

            <div className="mt-6 pt-5 border-t border-[var(--ca-border-subtle)] flex items-center justify-center gap-2 text-xs text-[var(--ca-text-muted)]">
              <Mail className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Need help? Email <a href="mailto:contact-086473cbd844@example.invalid" className="text-[var(--ca-brand)] hover:underline">contact-086473cbd844@example.invalid</a></span>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

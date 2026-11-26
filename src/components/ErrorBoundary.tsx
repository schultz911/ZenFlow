import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[zenFlow Global Error Boundary]:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--canvas)] text-[var(--text-primary)] p-6">
          <div className="ledger-frame max-w-md w-full">
            <div className="ledger-band flex items-center gap-2.5 px-5 py-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-red-600/10 text-red-600 dark:text-red-400 border border-red-600/20">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                Workspace Encountered an Error
              </h2>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                A component render exception occurred. Your persistent data remains safely preserved in storage.
              </p>

              {this.state.error?.message && (
                <details className="rounded-[7px] bg-[var(--surface-subtle)] border border-[var(--border)] p-3 text-left text-xs">
                  <summary className="cursor-pointer font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] select-none">
                    Technical details
                  </summary>
                  <div className="mt-2 font-mono text-[11px] break-words space-y-1.5 max-h-40 overflow-y-auto">
                    <p className="font-semibold text-red-700 dark:text-red-400">
                      {this.state.error.message}
                    </p>
                    {this.state.error.stack && (
                      <pre className="text-[11px] text-[var(--text-muted)] whitespace-pre-wrap overflow-x-auto">
                        {this.state.error.stack.split('\n').slice(0, 4).join('\n')}
                      </pre>
                    )}
                  </div>
                </details>
              )}

              <button
                type="button"
                onClick={this.handleReset}
                className="button-primary w-full"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reload Workspace</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

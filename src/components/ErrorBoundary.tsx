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
        <div className="min-h-screen flex items-center justify-center bg-neutral-900 text-white p-6">
          <div className="max-w-md w-full rounded-2xl border border-white/10 bg-[#111111] p-6 shadow-2xl text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight">
                Workspace Encountered an Error
              </h2>
              <p className="mt-1 text-xs text-white/50">
                A component render exception occurred. Your persistent data remains safely preserved in storage.
              </p>
            </div>
            {this.state.error?.message && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-left font-mono text-[11px] text-red-300 break-words">
                {import.meta.env.DEV
                  ? this.state.error.message
                  : 'An unexpected error occurred. Please reload.'}
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white transition-colors cursor-pointer w-full shadow-md shadow-blue-900/20"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reload Workspace</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

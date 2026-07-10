import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Nerdbot sidebar crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-bg p-6 text-center text-ink">
          <div className="text-[15px] font-semibold">Something went wrong</div>
          <div className="max-w-[280px] break-words text-[12.5px] text-muted">
            {this.state.error.message}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:bg-elevated"
          >
            Reload panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

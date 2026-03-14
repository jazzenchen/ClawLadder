import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground p-8">
        <div className="max-w-lg text-center space-y-4">
          <h1 className="text-2xl font-bold">出了点问题</h1>
          <p className="text-muted-foreground text-sm">
            应用遇到了意外错误，请尝试刷新页面。
          </p>
          <pre className="text-xs text-left bg-muted rounded p-3 overflow-auto max-h-40">
            {error.message}
          </pre>
          <button
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm"
            onClick={() => this.setState({ error: null })}
          >
            重试
          </button>
        </div>
      </div>
    );
  }
}

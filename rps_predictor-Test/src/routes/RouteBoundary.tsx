import React, { Suspense, useCallback } from "react";
import { useSafeBackNavigation } from "../lib/navigation";

export function RouteLoadingScreen(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
      <div className="rounded-3xl bg-white px-6 py-4 text-sm font-semibold shadow-lg">Loading…</div>
    </div>
  );
}

type RouteErrorBoundaryProps = {
  children: React.ReactNode;
  onReset: () => void;
};

type RouteErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

class RouteErrorBoundary extends React.Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("Route error boundary caught an error", error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 text-slate-600">
          <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="text-lg font-semibold text-slate-900">Something went wrong.</div>
            <p className="text-sm">We couldn’t load this screen. Let’s head back to the welcome page.</p>
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center justify-center rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700"
            >
              Go to welcome
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function RouteBoundary({ children }: { children: React.ReactNode }): JSX.Element {
  const safeBack = useSafeBackNavigation("/welcome");
  const handleReset = useCallback(() => {
    safeBack();
  }, [safeBack]);

  return (
    <RouteErrorBoundary onReset={handleReset}>
      <Suspense fallback={<RouteLoadingScreen />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}

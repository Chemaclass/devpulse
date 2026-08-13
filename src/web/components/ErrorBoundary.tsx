import { Component, ErrorInfo, ReactNode } from "react";

type TProps = {
  /** Rendered instead of the children once they have thrown. */
  fallback: ReactNode;
  children: ReactNode;
  /** Called once with the error, e.g. to switch the caller to a plain view. */
  onError?: (error: Error) => void;
};

type TState = { failed: boolean };

/**
 * Catches a render-time throw from its subtree.
 *
 * React unmounts the whole tree when a render throws, so one optional widget
 * failing takes the entire page down with it — the 3D skyline does exactly
 * that on a machine without a usable WebGL context. A boundary keeps the
 * failure local: the rest of the report stays on screen.
 */
export class ErrorBoundary extends Component<TProps, TState> {
  override state: TState = { failed: false };

  static getDerivedStateFromError(): TState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Component failed to render:", error, info.componentStack);
    this.props.onError?.(error);
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/** Catches render-time crashes in the canvas subtree so a single bad render
 *  does not blank the whole app. Shows a recoverable message with a reset
 *  button that clears the error boundary and re-mounts the canvas. */
export default class CanvasErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("[CanvasErrorBoundary] render crash", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-slate-50">
          <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl">
            <p className="text-sm font-semibold text-slate-900">Something went wrong displaying the board.</p>
            <p className="mt-1.5 text-xs text-slate-500">Your cards are saved. Try resetting the view.</p>
            <button
              type="button"
              onClick={this.handleReset}
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              Reset view
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

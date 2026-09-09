import { Component, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props { children: ReactNode }
interface State { error: string | null }

/** Last-resort crash screen: a route-level exception used to mean a blank
 *  white page with zero diagnostics. This keeps the shell alive and tells
 *  the analyst how to recover. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(e: unknown): State {
    return { error: e instanceof Error ? e.message : 'Unknown rendering error' }
  }

  componentDidCatch(e: unknown) {
    console.error('[CNAS] uncaught render error:', e)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4">
        <div className="card p-6 max-w-md text-center space-y-3">
          <AlertTriangle size={32} className="mx-auto text-yellow-400" />
          <h1 className="text-base font-bold text-white">This view crashed</h1>
          <p className="text-xs text-gray-400 font-mono break-words">{this.state.error}</p>
          <p className="text-xs text-gray-500">
            Your session and data are intact. Go back, or reload to retry.
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => window.history.back()} className="btn-ghost card">
              Go back
            </button>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload() }}
              className="btn-primary"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}

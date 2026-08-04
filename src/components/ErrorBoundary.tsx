import type { ReactNode } from 'react'
import { Component } from 'react'
import YaplyLogo from './YaplyLogo'

/** Full-viewport "something went wrong" page, styled to match the app's
 * loading screen. Reused as both a React error boundary fallback (render-time
 * errors) and the router's default error component (loader/route errors). */
export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <YaplyLogo size={56} variant="mark" />
      <div className="space-y-1">
        <h1 className="text-lg font-medium text-text">Something went wrong</h1>
        <p className="text-sm text-text-muted">An unexpected error occurred. Try again, or reload the page.</p>
      </div>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-medium transition-colors"
      >
        Reload
      </button>
    </div>
  )
}

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/** Catches render/lifecycle errors anywhere below it in the tree (router
 * loader/route errors are handled separately via `defaultErrorComponent` in
 * router.tsx — a React error boundary can't catch those). */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Unhandled render error:', error)
  }

  render() {
    if (this.state.hasError) {
      return <ErrorScreen onRetry={() => window.location.reload()} />
    }
    return this.props.children
  }
}

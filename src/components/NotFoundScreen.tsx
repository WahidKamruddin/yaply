import { Link } from '@tanstack/react-router'
import YaplyLogo from './YaplyLogo'

/** Full-viewport 404 page, styled to match LoadingScreen/ErrorScreen. */
export default function NotFoundScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <YaplyLogo size={56} variant="mark" />
      <div className="space-y-1">
        <h1 className="text-lg font-medium text-text">Page not found</h1>
        <p className="text-sm text-text-muted">The page you're looking for doesn't exist.</p>
      </div>
      <Link
        to="/chat"
        className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-medium transition-colors"
      >
        Back to yaply
      </Link>
    </div>
  )
}

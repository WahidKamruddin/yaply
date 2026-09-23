import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import YaplyLogo from './YaplyLogo'
import { WAITLIST_MODE } from '@/lib/waitlistMode'

/** Full-viewport 404 page, styled to match LoadingScreen/ErrorScreen. */
export default function NotFoundScreen() {
  const navigate = useNavigate()

  // Any unmatched path is "some other domain" too — bounce it to the
  // waitlist instead of showing a 404 that reveals nothing but also blocks
  // nothing.
  useEffect(() => {
    if (WAITLIST_MODE) void navigate({ to: '/auth', replace: true })
  }, [navigate])

  if (WAITLIST_MODE) return null

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Link
        to="/chat"
        aria-label="Back to Yaply"
        className="fixed top-[max(16px,var(--safe-top,0px))] left-[max(16px,var(--safe-left,0px))] z-[55] flex h-[38px] w-[38px] items-center justify-center rounded-full border border-border bg-tint text-text-muted transition-all hover:-translate-x-0.5 hover:bg-tint-strong hover:text-text"
      >
        <ArrowLeft size={17} strokeWidth={2.2} />
      </Link>
      <YaplyLogo size={56} variant="mark" />
      <div className="space-y-1">
        <h1 className="text-lg font-medium text-text">Page not found</h1>
        <p className="text-sm text-text-muted">The page you're looking for doesn't exist.</p>
      </div>
    </div>
  )
}

import YaplyLogo from './YaplyLogo'

/** Full-viewport loading state: pulsating Y mark, theme-aware. Used as the
 * router's default pending component and wherever a route waits on auth/user
 * state before it has anything to render (e.g. `if (!user) return null`). */
export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <YaplyLogo size={56} variant="mark" className="animate-[yaply-pulse_1.6s_ease-in-out_infinite]" />
    </div>
  )
}

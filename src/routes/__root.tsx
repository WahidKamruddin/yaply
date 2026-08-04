import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import Providers from '@/app/Providers'
import ErrorBoundary from '@/components/ErrorBoundary'
import NotFoundScreen from '@/components/NotFoundScreen'
import { useTheme } from '@/lib/useTheme'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'yaply' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  notFoundComponent: NotFoundScreen,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  // Applies the saved `.light` class to <html> for every route, not just the
  // chat app (BottomBar's own useTheme() call only runs once ChatView is
  // mounted) — otherwise LoadingScreen/ErrorScreen/NotFoundScreen and the
  // brief pre-ChatView-mount window always fell back to :root's dark defaults.
  useTheme()

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Providers>
          <ErrorBoundary>{children}</ErrorBoundary>
        </Providers>
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{ position: 'bottom-right' }}
            plugins={[{ name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> }]}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}

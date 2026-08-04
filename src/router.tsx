import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import LoadingScreen from './components/LoadingScreen'
import { ErrorScreen } from './components/ErrorBoundary'
import NotFoundScreen from './components/NotFoundScreen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: LoadingScreen,
    defaultErrorComponent: ({ reset }) => <ErrorScreen onRetry={reset} />,
    defaultNotFoundComponent: NotFoundScreen,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}

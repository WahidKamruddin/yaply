import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Queries that must always be fresh opt out with an explicit staleTime: 0.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

export default function Providers({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

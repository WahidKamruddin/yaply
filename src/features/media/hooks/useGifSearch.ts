import { useQuery } from '@tanstack/react-query'
import { searchGifs, getTrendingGifs } from '../api/gifs'

export function useGifSearch(query: string) {
  return useQuery({
    queryKey: ['gifs', query],
    queryFn: () => (query ? searchGifs(query) : getTrendingGifs()),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  })
}

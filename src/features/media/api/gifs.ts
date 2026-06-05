export interface GifResult {
  id: string
  title: string
  url: string
  previewUrl: string
  width: number
  height: number
}

const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY as string
const BASE = 'https://api.giphy.com/v1/gifs'

interface GiphyImage {
  url: string
  width: string
  height: string
}

interface GiphyItem {
  id: string
  title: string
  images: {
    original: GiphyImage
    fixed_height_small: GiphyImage
  }
}

async function giphyFetch(path: string): Promise<GifResult[]> {
  const res = await fetch(`${BASE}${path}&api_key=${GIPHY_KEY}&limit=20&rating=g`)
  if (!res.ok) throw new Error('Giphy API error')
  const json = (await res.json()) as { data: GiphyItem[] }
  return json.data.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.images.original.url,
    previewUrl: r.images.fixed_height_small.url,
    width: parseInt(r.images.original.width, 10),
    height: parseInt(r.images.original.height, 10),
  }))
}

export async function searchGifs(query: string): Promise<GifResult[]> {
  return giphyFetch(`/search?q=${encodeURIComponent(query)}`)
}

export async function getTrendingGifs(): Promise<GifResult[]> {
  return giphyFetch('/trending')
}

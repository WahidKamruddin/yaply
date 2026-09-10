export interface GifResult {
  id: string
  title: string
  /** Full-size URL sent as the message media_url. */
  url: string
  /** Small, grid-friendly URL used only in the picker. */
  previewUrl: string
  width: number
  height: number
}

const GIPHY_KEY = (import.meta.env.VITE_GIPHY_API_KEY as string | undefined)?.trim() ?? ''
const BASE = 'https://api.giphy.com/v1/gifs'

/**
 * Whether a usable Giphy key is configured. The picker uses this to show a
 * "set VITE_GIPHY_API_KEY" hint instead of an empty grid — the placeholder
 * value shipped in `.env.example` counts as unset.
 */
export const hasGiphyKey = GIPHY_KEY.length > 0 && GIPHY_KEY !== 'your-giphy-api-key'

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
    downsized?: GiphyImage
    fixed_height?: GiphyImage
    fixed_height_small?: GiphyImage
  }
}

function pick(...images: Array<GiphyImage | undefined>): GiphyImage {
  return images.find((i) => i && i.url) ?? { url: '', width: '0', height: '0' }
}

async function giphyFetch(path: string): Promise<GifResult[]> {
  if (!hasGiphyKey) throw new Error('missing-giphy-key')
  const res = await fetch(`${BASE}${path}&api_key=${GIPHY_KEY}&limit=24&rating=g&bundle=messaging_non_clips`)
  if (!res.ok) throw new Error(`Giphy API error (${res.status})`)
  const json = (await res.json()) as { data: GiphyItem[] }
  return json.data
    .map((r) => {
      // Send a downsized rendition, not `original` — an original Giphy GIF is
      // routinely several MB, and media_url is loaded inline in every open
      // conversation that referenced it.
      const full = pick(r.images.downsized, r.images.fixed_height, r.images.original)
      const preview = pick(r.images.fixed_height_small, r.images.fixed_height, full)
      return {
        id: r.id,
        title: r.title || 'GIF',
        url: full.url,
        previewUrl: preview.url,
        width: parseInt(full.width, 10) || 0,
        height: parseInt(full.height, 10) || 0,
      }
    })
    .filter((g) => g.url)
}

export async function searchGifs(query: string): Promise<GifResult[]> {
  return giphyFetch(`/search?q=${encodeURIComponent(query)}`)
}

export async function getTrendingGifs(): Promise<GifResult[]> {
  return giphyFetch('/trending?')
}

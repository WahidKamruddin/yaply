export interface GifResult {
  id: string
  title: string
  url: string
  previewUrl: string
  width: number
  height: number
}

const TENOR_KEY = import.meta.env.VITE_TENOR_API_KEY as string
const BASE = 'https://tenor.googleapis.com/v2'

async function tenorFetch(path: string): Promise<GifResult[]> {
  const res = await fetch(`${BASE}${path}&key=${TENOR_KEY}&client_key=yaply&media_filter=gif,tinygif`)
  if (!res.ok) throw new Error('Tenor API error')
  const json = await res.json() as { results: Array<{ id: string; title: string; media_formats: { gif: { url: string; dims: number[] }; tinygif: { url: string } } }> }
  return json.results.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.media_formats.gif.url,
    previewUrl: r.media_formats.tinygif.url,
    width: r.media_formats.gif.dims[0] ?? 0,
    height: r.media_formats.gif.dims[1] ?? 0,
  }))
}

export async function searchGifs(query: string): Promise<GifResult[]> {
  return tenorFetch(`/search?q=${encodeURIComponent(query)}&limit=20`)
}

export async function getTrendingGifs(): Promise<GifResult[]> {
  return tenorFetch('/featured?limit=20')
}

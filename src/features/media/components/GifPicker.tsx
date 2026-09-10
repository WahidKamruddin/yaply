import { useState, useRef } from 'react'
import { Search } from 'lucide-react'
import { useGifSearch } from '../hooks/useGifSearch'
import { hasGiphyKey } from '../api/gifs'
import type { GifResult } from '../api/gifs'

interface Props {
  onSelect: (gif: GifResult) => void
}

export default function GifPicker({ onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { data: gifs = [], isLoading, isError } = useGifSearch(debouncedQuery)

  function handleSearch(q: string) {
    setQuery(q)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebouncedQuery(q), 350)
  }

  return (
    <div className="flex flex-col h-72">
      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
        <input
          type="text"
          placeholder="Search GIFs..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          disabled={!hasGiphyKey}
          className="w-full pl-8 pr-3 py-2 bg-tint rounded-lg text-sm text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-[#5b8def]/40 border border-border disabled:opacity-50"
        />
      </div>

      {!hasGiphyKey ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1 text-center px-4">
          <p className="text-sm text-text-muted">GIF search isn’t configured</p>
          <p className="text-xs text-text-subtle">
            Set <code className="font-mono">VITE_GIPHY_API_KEY</code> to enable it.
          </p>
        </div>
      ) : isError ? (
        <div className="flex-1 flex items-center justify-center text-text-subtle text-sm px-4 text-center">
          Couldn’t load GIFs. Check your connection and try again.
        </div>
      ) : isLoading ? (
        <div className="flex-1 flex items-center justify-center text-text-subtle text-sm">Loading…</div>
      ) : gifs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-subtle text-sm">No GIFs found.</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {/* Two hand-distributed columns rather than CSS `columns` — a
              multi-column box inside a fixed-height scroller clips instead of
              scrolling vertically. */}
          <div className="flex items-start gap-1.5">
            {[0, 1].map((col) => (
              <div key={col} className="flex min-w-0 flex-1 flex-col gap-1.5">
                {gifs
                  .filter((_, i) => i % 2 === col)
                  .map((gif) => (
                    <button
                      key={gif.id}
                      onClick={() => onSelect(gif)}
                      className="block w-full overflow-hidden rounded-lg hover:opacity-80 transition-opacity"
                    >
                      <img
                        src={gif.previewUrl}
                        alt={gif.title}
                        className="block w-full h-auto"
                        style={gif.width && gif.height ? { aspectRatio: `${gif.width} / ${gif.height}` } : undefined}
                        loading="lazy"
                      />
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {hasGiphyKey && !isError && (
        <p className="text-[10px] text-text-faint text-center pt-1.5 flex-shrink-0">Powered by GIPHY</p>
      )}
    </div>
  )
}

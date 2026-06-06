import { useState, useRef } from 'react'
import { Search } from 'lucide-react'
import { useGifSearch } from '../hooks/useGifSearch'
import type { GifResult } from '../api/gifs'

interface Props {
  onSelect: (gif: GifResult) => void
}

export default function GifPicker({ onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { data: gifs = [], isLoading } = useGifSearch(debouncedQuery)

  function handleSearch(q: string) {
    setQuery(q)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebouncedQuery(q), 350)
  }

  return (
    <div className="flex flex-col h-72">
      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ab0cc]" />
        <input
          type="text"
          placeholder="Search GIFs..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 bg-[#f3f7ff] rounded-lg text-sm text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40 border border-[#dce7f8]"
        />
      </div>
      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-[#9ab0cc] text-sm">Loading…</div>
      )}
      <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-1.5">
        {gifs.map((gif) => (
          <button
            key={gif.id}
            onClick={() => onSelect(gif)}
            className="rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
          >
            <img src={gif.previewUrl} alt={gif.title} className="w-full h-24 object-cover" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  )
}

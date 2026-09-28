import type { LinkPreview } from '@yaply/shared/linkPreview'

interface Props {
  preview: LinkPreview
  isOwn: boolean
  // True when the bubble also has message text above this card, so the card
  // gets a top margin instead of acting as the whole bubble's content.
  hasText: boolean
}

// The whole card is a link, exactly like the existing file-attachment
// download link elsewhere in this file — tap anywhere to open the URL.
export default function LinkPreviewCard({ preview, isOwn, hasText }: Props) {
  let hostname = preview.url
  try {
    hostname = new URL(preview.url).hostname.replace(/^www\./, '')
  } catch {
    // Keep the raw url as a fallback label.
  }

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`block overflow-hidden rounded-xl border ${hasText ? 'mt-2' : ''} ${
        isOwn ? 'border-white/25 bg-white/10' : 'border-border-soft bg-tint'
      }`}
    >
      {preview.imageUrl && (
        <img
          src={preview.imageUrl}
          alt=""
          loading="lazy"
          className="w-full max-h-[180px] object-cover"
        />
      )}
      <div className="px-3 py-2 min-w-0">
        {preview.title && (
          <p className={`text-xs font-semibold line-clamp-2 ${isOwn ? 'text-white' : 'text-text'}`}>
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className={`text-xs mt-0.5 line-clamp-2 ${isOwn ? 'text-white/80' : 'text-text-muted'}`}>
            {preview.description}
          </p>
        )}
        <p className={`text-[10px] mt-1 truncate ${isOwn ? 'text-white/60' : 'text-text-subtle'}`}>
          {preview.siteName || hostname}
        </p>
      </div>
    </a>
  )
}

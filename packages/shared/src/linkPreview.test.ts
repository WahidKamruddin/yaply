import { describe, it, expect, beforeEach } from 'vitest'
import {
  extractFirstUrl,
  findUrls,
  encodeTextMessage,
  decodeTextMessage,
  configureLinkPreviewImages,
} from './linkPreview'
import type { LinkPreview } from './linkPreview'

const preview: LinkPreview = {
  url: 'https://example.com/article',
  title: 'An Article',
  description: 'A description of the article.',
  imageUrl: 'https://project.supabase.co/storage/v1/object/public/link-preview-images/abc.png',
  siteName: 'Example',
}

describe('extractFirstUrl', () => {
  it('finds a bare URL', () => {
    expect(extractFirstUrl('check this out https://example.com/article')).toBe(
      'https://example.com/article',
    )
  })

  it('trims trailing sentence punctuation', () => {
    expect(extractFirstUrl('see https://example.com/article.')).toBe('https://example.com/article')
    expect(extractFirstUrl('(https://example.com/article)')).toBe('https://example.com/article')
  })

  it('returns null when there is no URL', () => {
    expect(extractFirstUrl('just plain text')).toBeNull()
  })

  it('returns the first URL when there are several', () => {
    expect(extractFirstUrl('https://a.com then https://b.com')).toBe('https://a.com')
  })

  it('detects a bare domain with no protocol and adds https://', () => {
    expect(extractFirstUrl('go check google.com')).toBe('https://google.com')
    expect(extractFirstUrl('site is example.org for now')).toBe('https://example.org')
    expect(extractFirstUrl('try example.net')).toBe('https://example.net')
  })

  it('trims trailing punctuation off a bare domain', () => {
    expect(extractFirstUrl('see google.com.')).toBe('https://google.com')
    expect(extractFirstUrl('(google.com)')).toBe('https://google.com')
  })

  it('does not treat an email address domain as a link', () => {
    expect(extractFirstUrl('reach me at bob@example.com')).toBeNull()
  })

  it('does not false-positive on ordinary sentence punctuation', () => {
    expect(extractFirstUrl('etc. and Mr. Smith said v1.2 is out')).toBeNull()
  })

  it('does not double-count the domain inside a full URL', () => {
    const matches = findUrls('visit https://google.com today')
    expect(matches).toHaveLength(1)
    expect(matches[0].href).toBe('https://google.com')
  })
})

describe('encodeTextMessage / decodeTextMessage round-trip', () => {
  beforeEach(() => configureLinkPreviewImages('https://project.supabase.co'))

  it('round-trips plain text unchanged when there is no preview', () => {
    const encoded = encodeTextMessage('just some text')
    expect(encoded).toBe('just some text')
    expect(decodeTextMessage(encoded)).toEqual({ text: 'just some text' })
  })

  it('round-trips text with an attached preview', () => {
    const encoded = encodeTextMessage('check this out', preview)
    expect(decodeTextMessage(encoded)).toEqual({ text: 'check this out', linkPreview: preview })
  })

  it('falls back to raw text on malformed JSON', () => {
    const raw = '{not valid json'
    expect(decodeTextMessage(raw)).toEqual({ text: raw })
  })

  it('falls back to raw text when a user literally typed JSON that is not our envelope', () => {
    const raw = '{"hello":"world"}'
    expect(decodeTextMessage(raw)).toEqual({ text: raw })
  })

  it('falls back to raw text when v does not match', () => {
    const raw = JSON.stringify({ v: 2, text: 'hi' })
    expect(decodeTextMessage(raw)).toEqual({ text: raw })
  })

  it('treats text not starting with "{" as plain text without attempting to parse', () => {
    expect(decodeTextMessage('hello world')).toEqual({ text: 'hello world' })
  })
})

describe('decodeTextMessage preview images', () => {
  beforeEach(() => configureLinkPreviewImages('https://project.supabase.co'))
  const wrap = (lp: unknown) => JSON.stringify({ v: 1, text: 'hi', linkPreview: lp })

  it('drops an image from a third-party host but keeps the preview', () => {
    const out = decodeTextMessage(wrap({ ...preview, imageUrl: 'https://attacker.example/pixel?id=victim' }))
    expect(out.linkPreview).toEqual({ ...preview, imageUrl: null })
  })

  it('drops an image that only mimics our bucket path on another host', () => {
    const fake = 'https://attacker.example/storage/v1/object/public/link-preview-images/x.png'
    expect(decodeTextMessage(wrap({ ...preview, imageUrl: fake })).linkPreview?.imageUrl).toBeNull()
  })

  it('drops an image from our own host but a different bucket', () => {
    const other = 'https://project.supabase.co/storage/v1/object/public/avatars/x.png'
    expect(decodeTextMessage(wrap({ ...preview, imageUrl: other })).linkPreview?.imageUrl).toBeNull()
  })

  it('drops every image until the origin is configured (fail closed)', () => {
    configureLinkPreviewImages(undefined)
    expect(decodeTextMessage(wrap(preview)).linkPreview?.imageUrl).toBeNull()
  })

  it('accepts an image-less preview that omits the nil keys, as iOS sends it', () => {
    const out = decodeTextMessage(wrap({ url: 'https://example.com/a' }))
    expect(out.linkPreview).toEqual({
      url: 'https://example.com/a',
      title: null,
      description: null,
      imageUrl: null,
      siteName: null,
    })
  })

  it('still rejects a non-http(s) preview url', () => {
    expect(decodeTextMessage(wrap({ ...preview, url: 'javascript:alert(1)' })).linkPreview).toBeUndefined()
  })
})

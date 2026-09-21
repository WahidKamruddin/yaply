import { describe, it, expect } from 'vitest'
import { activeMentionQuery, extractMentions, tokenizeMentions, MENTION_EVERYONE } from './mentions'

const members = [
  { userId: 'u-bob', username: 'bob' },
  { userId: 'u-bobby', username: 'bobby' },
  { userId: 'u-alice', username: 'alice' },
]

describe('extractMentions', () => {
  it('resolves a single mention', () => {
    const r = extractMentions('hey @alice check this', members, 'u-sender')
    expect(r.mentionedUserIds).toEqual(['u-alice'])
    expect(r.mentionsEveryone).toBe(false)
  })

  it('resolves @everyone', () => {
    const r = extractMentions('@everyone dinner at 7', members, 'u-sender')
    expect(r.mentionsEveryone).toBe(true)
    expect(r.mentionedUserIds).toEqual([])
  })

  it('resolves the longest matching username on punctuation (@bob. / @bob\'s)', () => {
    expect(extractMentions('@bob.', members, 'u-sender').mentionedUserIds).toEqual(['u-bob'])
    expect(extractMentions("@bob's turn", members, 'u-sender').mentionedUserIds).toEqual(['u-bob'])
  })

  it('prefers the longest username prefix (@bobby over @bob)', () => {
    expect(extractMentions('@bobby', members, 'u-sender').mentionedUserIds).toEqual(['u-bobby'])
  })

  it('does not trigger mid-word (a@bob)', () => {
    expect(extractMentions('a@bob', members, 'u-sender').mentionedUserIds).toEqual([])
  })

  it('is case-insensitive', () => {
    expect(extractMentions('@Bob hi', members, 'u-sender').mentionedUserIds).toEqual(['u-bob'])
  })

  it('ignores an unmatched candidate', () => {
    expect(extractMentions('@bo hi', members, 'u-sender').mentionedUserIds).toEqual([])
  })

  it('never includes the sender', () => {
    expect(extractMentions('@bob', members, 'u-bob').mentionedUserIds).toEqual([])
  })

  it('de-dupes repeated mentions', () => {
    expect(extractMentions('@alice @alice', members, 'u-sender').mentionedUserIds).toEqual(['u-alice'])
  })
})

describe('tokenizeMentions', () => {
  it('splits text around mentions', () => {
    const tokens = tokenizeMentions('hey @alice how are you', members)
    expect(tokens).toEqual([
      { kind: 'text', value: 'hey ' },
      { kind: 'mention', value: '@alice', userId: 'u-alice', everyone: false },
      { kind: 'text', value: ' how are you' },
    ])
  })

  it('returns a single text token when there are no mentions', () => {
    expect(tokenizeMentions('plain text', members)).toEqual([{ kind: 'text', value: 'plain text' }])
  })

  it('marks @everyone with everyone: true and userId: null', () => {
    const tokens = tokenizeMentions('@everyone', members)
    expect(tokens).toEqual([{ kind: 'mention', value: `@${MENTION_EVERYONE}`, userId: null, everyone: true }])
  })
})

describe('activeMentionQuery', () => {
  it('detects an in-progress mention at the caret', () => {
    const text = 'hey @al'
    expect(activeMentionQuery(text, text.length)).toEqual({ query: 'al', start: 4, end: 7 })
  })

  it('returns null with no @ before the caret', () => {
    expect(activeMentionQuery('hello', 5)).toBeNull()
  })

  it('does not trigger mid-word (an email-like string)', () => {
    expect(activeMentionQuery('a@b', 3)).toBeNull()
  })
})

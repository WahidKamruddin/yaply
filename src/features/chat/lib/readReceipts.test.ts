import { describe, expect, it } from 'vitest'
import { formatStatus, messageStatus, seenHeads, withImpliedReads, type MemberWatermark } from './readReceipts'

const ME = 'me'
const msg = (id: string, senderId: string, minute: number, type = 'text') => ({
  id,
  senderId,
  type,
  createdAt: new Date(Date.UTC(2026, 8, 27, 12, minute)).toISOString(),
})
const at = (minute: number) => new Date(Date.UTC(2026, 8, 27, 12, minute)).toISOString()
const wm = (userId: string, read: number | null, delivered: number | null = read): MemberWatermark => ({
  userId,
  readAt: read === null ? null : at(read),
  deliveredAt: delivered === null ? null : at(delivered),
})

describe('seenHeads', () => {
  const messages = [msg('a', ME, 0), msg('b', 'ana', 1), msg('c', ME, 2), msg('d', ME, 3)]

  it('puts each reader under the newest message at or before their watermark', () => {
    expect(seenHeads(messages, [wm('ana', 2), wm('ben', 3)], ME)).toEqual({ c: ['ana'], d: ['ben'] })
  })

  it('stacks readers who reached the same message', () => {
    expect(seenHeads(messages, [wm('ana', 3), wm('ben', 3)], ME)).toEqual({ d: ['ana', 'ben'] })
  })

  it('shows a member under their own message when that is where they left off', () => {
    expect(seenHeads(messages, [wm('ana', 1)], ME)).toEqual({ b: ['ana'] })
  })

  it('ignores me, members who never read, system and pending messages', () => {
    const withSystem = [...messages, msg('s', ME, 4, 'system'), msg('p', ME, 5)]
    expect(seenHeads(withSystem, [wm(ME, 9), wm('ana', null), wm('ben', 9)], ME, new Set(['p']))).toEqual({
      d: ['ben'],
    })
  })
})

describe('withImpliedReads', () => {
  const messages = [msg('a', ME, 0), msg('b', 'ana', 5), msg('c', ME, 6)]

  it("moves a stale watermark up to the member's own latest message", () => {
    const adjusted = withImpliedReads(messages, [wm('ana', 1, 1)])
    expect(adjusted).toEqual([{ userId: 'ana', readAt: at(5), deliveredAt: at(5) }])
    expect(seenHeads(messages, adjusted, ME)).toEqual({ b: ['ana'] })
  })

  it('never moves a watermark backwards, and ignores pending messages', () => {
    expect(withImpliedReads(messages, [wm('ana', 9)])).toEqual([wm('ana', 9)])
    expect(withImpliedReads(messages, [wm(ME, null)], new Set(['c']))).toEqual([
      { userId: ME, readAt: at(0), deliveredAt: at(0) },
    ])
  })

  it('counts a reply as having seen what came before it', () => {
    const adjusted = withImpliedReads([msg('x', ME, 1), msg('y', 'ana', 2)], [wm('ana', null, null)])
    expect(messageStatus(msg('x', ME, 1), adjusted, ME, false)).toEqual({ kind: 'seen', readerIds: ['ana'], everyone: true })
  })
})

describe('messageStatus', () => {
  const m = msg('x', ME, 5)

  it('is sending while pending', () => {
    expect(messageStatus(m, [wm('ana', 9)], ME, true)).toEqual({ kind: 'sending' })
  })

  it('walks sent → delivered → seen', () => {
    expect(messageStatus(m, [wm('ana', 1, 1)], ME, false)).toEqual({ kind: 'sent' })
    expect(messageStatus(m, [wm('ana', 1, 5)], ME, false)).toEqual({ kind: 'delivered' })
    expect(messageStatus(m, [wm('ana', 5)], ME, false)).toEqual({ kind: 'seen', readerIds: ['ana'], everyone: true })
  })

  it('is delivered only when every other member has it', () => {
    expect(messageStatus(m, [wm('ana', 1, 6), wm('ben', 1, 2)], ME, false)).toEqual({ kind: 'sent' })
  })

  it('reports partial readers in a group', () => {
    expect(messageStatus(m, [wm(ME, 9), wm('ana', 6), wm('ben', 2)], ME, false)).toEqual({
      kind: 'seen',
      readerIds: ['ana'],
      everyone: false,
    })
  })
})

describe('formatStatus', () => {
  const name = (id: string) => id.toUpperCase()
  it('labels each state', () => {
    expect(formatStatus({ kind: 'sending' }, false, name)).toBe('Sending…')
    expect(formatStatus({ kind: 'sent' }, false, name)).toBe('Sent')
    expect(formatStatus({ kind: 'delivered' }, false, name)).toBe('Delivered')
    expect(formatStatus({ kind: 'seen', readerIds: ['a'], everyone: true }, false, name)).toBe('Seen')
    expect(formatStatus({ kind: 'seen', readerIds: ['a', 'b'], everyone: true }, true, name)).toBe('Seen by everyone')
    expect(formatStatus({ kind: 'seen', readerIds: ['a', 'b'], everyone: false }, true, name)).toBe('Seen by A, B')
    expect(formatStatus({ kind: 'seen', readerIds: ['a', 'b', 'c', 'd', 'e'], everyone: false }, true, name)).toBe(
      'Seen by A, B, C and 2 others',
    )
  })
})

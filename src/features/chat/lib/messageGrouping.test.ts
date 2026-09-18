import { describe, expect, it } from 'vitest'
import type { DecryptedMessage } from '@/features/chat/types'
import { getGroupPositions } from './messageGrouping'

const BASE = new Date(2026, 8, 18, 12, 0, 0).getTime()

function msg(senderId: string, minutes: number, type = 'text'): DecryptedMessage {
  return {
    id: `${senderId}-${minutes}`,
    conversationId: 'c',
    senderId,
    content: 'hi',
    type,
    mediaUrl: null,
    replyToId: null,
    threadId: null,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date(BASE + minutes * 60_000).toISOString(),
  }
}

describe('getGroupPositions', () => {
  it('marks a lone message single', () => {
    expect(getGroupPositions([msg('a', 0)])).toEqual(['single'])
  })

  it('groups a run of two', () => {
    expect(getGroupPositions([msg('a', 0), msg('a', 1)])).toEqual(['first', 'last'])
  })

  it('groups a run of three or more', () => {
    expect(getGroupPositions([msg('a', 0), msg('a', 1), msg('a', 2), msg('a', 3)])).toEqual([
      'first', 'middle', 'middle', 'last',
    ])
  })

  it('breaks on a different sender', () => {
    expect(getGroupPositions([msg('a', 0), msg('b', 1), msg('b', 2), msg('a', 3)])).toEqual([
      'single', 'first', 'last', 'single',
    ])
  })

  it('breaks on a gap over five minutes', () => {
    expect(getGroupPositions([msg('a', 0), msg('a', 5), msg('a', 11)])).toEqual([
      'first', 'last', 'single',
    ])
  })

  it('breaks across days', () => {
    // 11:59pm and 12:01am the next day — two minutes apart but a separator between them.
    const late = msg('a', 11 * 60 + 59)
    const early = msg('a', 12 * 60 + 1)
    expect(getGroupPositions([late, early])).toEqual(['single', 'single'])
  })

  it('never groups system messages', () => {
    expect(getGroupPositions([msg('a', 0), msg('a', 1, 'system'), msg('a', 2)])).toEqual([
      'single', 'single', 'single',
    ])
  })
})

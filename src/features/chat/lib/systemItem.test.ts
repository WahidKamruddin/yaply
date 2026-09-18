import { describe, expect, it } from 'vitest'
import { encodeSystemItem, parseSystemItem, opensInPanelOnly } from './systemItem'

describe('systemItem', () => {
  it('round-trips an item', () => {
    const item = { kind: 'plan' as const, id: 'abc', title: 'Beach "day" ☀️' }
    expect(parseSystemItem(encodeSystemItem(item))).toEqual(item)
  })

  it('encodes with a fixed key order', () => {
    expect(encodeSystemItem({ kind: 'task', id: '1', title: 't' })).toBe('{"v":1,"kind":"task","id":"1","title":"t"}')
  })

  it('treats legacy plain text as not an item', () => {
    expect(parseSystemItem('📋 Task created: "Buy milk"')).toBeNull()
  })

  it('rejects unknown versions, kinds, and malformed JSON', () => {
    expect(parseSystemItem('{"v":2,"kind":"task","id":"1","title":"t"}')).toBeNull()
    expect(parseSystemItem('{"v":1,"kind":"poll","id":"1","title":"t"}')).toBeNull()
    expect(parseSystemItem('{"v":1,"kind":"task","title":"t"}')).toBeNull()
    expect(parseSystemItem('{not json')).toBeNull()
  })

  it('only tasks and reminders open in the panel', () => {
    expect(opensInPanelOnly('task')).toBe(true)
    expect(opensInPanelOnly('reminder')).toBe(true)
    expect(opensInPanelOnly('plan')).toBe(false)
    expect(opensInPanelOnly('note')).toBe(false)
  })
})

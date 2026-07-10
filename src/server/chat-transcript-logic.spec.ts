import { describe, expect, it } from 'vitest'

import {
  formatToolCallEndMessage,
  formatToolCallStartMessage,
  parseSseBuffer,
  truncateToolOutputPreview,
} from './chat-transcript-logic.js'

describe('parseSseBuffer', () => {
  it('extracts complete frames and keeps an incomplete tail as remainder', () => {
    const buffer = 'event: text_delta\ndata: {"text":"hi"}\n\nevent: tool_call_start\ndata: {"na'
    const result = parseSseBuffer(buffer)
    expect(result.frames).toEqual([{ eventType: 'text_delta', data: '{"text":"hi"}' }])
    expect(result.remainder).toBe('event: tool_call_start\ndata: {"na')
  })

  it('defaults eventType to message when no event: line is present', () => {
    const result = parseSseBuffer('data: {"delta":"x"}\n\n')
    expect(result.frames).toEqual([{ eventType: 'message', data: '{"delta":"x"}' }])
  })

  it('skips frames with no data line', () => {
    const result = parseSseBuffer('event: done\n\n')
    expect(result.frames).toEqual([])
    expect(result.remainder).toBe('')
  })

  it('parses multiple frames delivered in one chunk', () => {
    const buffer = 'data: {"a":1}\n\ndata: {"a":2}\n\n'
    const result = parseSseBuffer(buffer)
    expect(result.frames.map((f) => f.data)).toEqual(['{"a":1}', '{"a":2}'])
    expect(result.remainder).toBe('')
  })
})

describe('truncateToolOutputPreview', () => {
  it('leaves short output untouched', () => {
    expect(truncateToolOutputPreview('hello')).toBe('hello')
  })

  it('truncates long output with an ellipsis', () => {
    const long = 'x'.repeat(500)
    const preview = truncateToolOutputPreview(long)
    expect(preview.length).toBe(401)
    expect(preview.endsWith('…')).toBe(true)
  })
})

describe('formatToolCallStartMessage / formatToolCallEndMessage', () => {
  it('formats a start message', () => {
    expect(formatToolCallStartMessage('read_file')).toBe('🔧 calling read_file...')
  })

  it('formats a successful end message', () => {
    expect(formatToolCallEndMessage('read_file', 'contents', false)).toBe('✓ read_file → contents')
  })

  it('formats an error end message', () => {
    expect(formatToolCallEndMessage('bash', 'boom', true)).toBe('⚠️ bash → boom')
  })
})

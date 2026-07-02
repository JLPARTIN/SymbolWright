import { describe, expect, it } from 'vitest'

import { redactMcpText, redactMcpToolResult } from './mcp-redaction.js'

describe('redactMcpText', () => {
  it('redacts secret-shaped tokens', () => {
    expect(redactMcpText('token: ghp_1234567890123456789012345678901234ab')).toContain('[REDACTED]')
  })

  it('leaves ordinary text untouched', () => {
    expect(redactMcpText('hello world')).toBe('hello world')
  })
})

describe('redactMcpToolResult', () => {
  it('redacts secrets embedded in text content blocks', () => {
    const result = redactMcpToolResult({
      isError: false,
      content: [{ type: 'text', text: 'api_key: super-secret-value' }],
    })

    expect(result.content[0]?.text).toContain('[REDACTED]')
  })

  it('leaves non-text content blocks unchanged', () => {
    const block = { type: 'image' }
    const result = redactMcpToolResult({ isError: false, content: [block] })

    expect(result.content[0]).toBe(block)
  })

  it('preserves isError and non-secret text', () => {
    const result = redactMcpToolResult({
      isError: true,
      content: [{ type: 'text', text: 'plain failure message' }],
    })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toBe('plain failure message')
  })
})

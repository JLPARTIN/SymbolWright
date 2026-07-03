import { describe, expect, it } from 'vitest'

import { DEFAULT_MCP_SERVER_MODE, parseMcpServerArgs } from './cli-mcp-server.js'

describe('parseMcpServerArgs', () => {
  it('defaults to READ_ONLY when no flags are given', () => {
    expect(parseMcpServerArgs([])).toEqual({ mode: 'READ_ONLY' })
    expect(DEFAULT_MCP_SERVER_MODE).toBe('READ_ONLY')
  })

  it('parses --mode <mode>', () => {
    expect(parseMcpServerArgs(['--mode', 'APPROVED_EXECUTION'])).toEqual({
      mode: 'APPROVED_EXECUTION',
    })
  })

  it('parses --mode=<mode> and normalizes aliases/case', () => {
    expect(parseMcpServerArgs(['--mode=approved'])).toEqual({ mode: 'APPROVED_EXECUTION' })
    expect(parseMcpServerArgs(['--mode', 'read-only'])).toEqual({ mode: 'READ_ONLY' })
  })

  it('rejects an invalid mode', () => {
    expect(() => parseMcpServerArgs(['--mode', 'NOT_A_MODE'])).toThrow('--mode must be one of')
  })

  it('rejects unknown flags', () => {
    expect(() => parseMcpServerArgs(['--bogus'])).toThrow('Unknown mcp-server flag')
  })
})

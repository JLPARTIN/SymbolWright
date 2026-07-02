import { describe, expect, it } from 'vitest'

import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import { assertMcpAllowed } from './mcp-policy.js'

describe('assertMcpAllowed', () => {
  it('allows MCP execution when shell execution is allowed', () => {
    const policy = createRuntimePolicyForMode('APPROVED_EXECUTION')
    expect(() => assertMcpAllowed(policy)).not.toThrow()
  })

  it('blocks MCP execution when shell execution is disabled', () => {
    const policy = createRuntimePolicyForMode('READ_ONLY')
    expect(() => assertMcpAllowed(policy)).toThrow(/MCP tool execution is disabled/)
  })
})

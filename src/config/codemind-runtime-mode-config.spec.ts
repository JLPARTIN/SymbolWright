import { describe, expect, it } from 'vitest'

import { resolveCodemindConfig, validateCodemindConfig } from './codemind-config.js'

describe('runtime mode config', () => {
  it('reads CODEMIND_RUNTIME_MODE from env', () => {
    const config = resolveCodemindConfig({
      env: { CODEMIND_RUNTIME_MODE: 'READ_ONLY' },
      homeConfigPath: '/nonexistent/config.json',
      projectConfigPath: '/nonexistent/config.json',
    })

    expect(config.runtimeMode).toBe('READ_ONLY')
  })

  it('normalizes direct/off aliases onto APPROVED_EXECUTION', () => {
    const direct = resolveCodemindConfig({
      env: { CODEMIND_RUNTIME_MODE: 'direct' },
      homeConfigPath: '/nonexistent/config.json',
      projectConfigPath: '/nonexistent/config.json',
    })
    const off = resolveCodemindConfig({
      env: { CODEMIND_RUNTIME_MODE: 'off' },
      homeConfigPath: '/nonexistent/config.json',
      projectConfigPath: '/nonexistent/config.json',
    })

    expect(direct.runtimeMode).toBe('APPROVED_EXECUTION')
    expect(off.runtimeMode).toBe('APPROVED_EXECUTION')
  })

  it('lets CLI runtime mode override env mode', () => {
    const config = resolveCodemindConfig({
      cliFlags: { runtimeMode: 'PROPOSAL_ONLY' },
      env: { CODEMIND_RUNTIME_MODE: 'READ_ONLY' },
      homeConfigPath: '/nonexistent/config.json',
      projectConfigPath: '/nonexistent/config.json',
    })

    expect(config.runtimeMode).toBe('PROPOSAL_ONLY')
  })

  it('ignores invalid runtime mode values instead of creating a second mode system', () => {
    const config = resolveCodemindConfig({
      env: { CODEMIND_RUNTIME_MODE: 'LOCKDOWN' },
      homeConfigPath: '/nonexistent/config.json',
      projectConfigPath: '/nonexistent/config.json',
    })

    expect(config.runtimeMode).toBeUndefined()
  })

  it('includes runtime mode in validation summary', () => {
    const result = validateCodemindConfig({
      anthropicApiKey: 'sk-test-key-12345678',
      runtimeMode: 'APPROVED_EXECUTION',
    })

    expect(result.redactedSummary.runtimeMode).toBe('APPROVED_EXECUTION')
  })
})

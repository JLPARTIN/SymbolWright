import { describe, expect, it, vi } from 'vitest'

import { readEnvWithLegacyFallback } from './env-compat.js'

describe('readEnvWithLegacyFallback', () => {
  it('returns undefined when neither variable is set', () => {
    expect(
      readEnvWithLegacyFallback('SYMBOLWRIGHT_MODEL', 'CODEMIND_MODEL', { env: {} }),
    ).toBeUndefined()
  })

  it('uses the canonical value when only the canonical variable is set', () => {
    const env = { SYMBOLWRIGHT_MODEL: 'claude' }
    expect(readEnvWithLegacyFallback('SYMBOLWRIGHT_MODEL', 'CODEMIND_MODEL', { env })).toBe(
      'claude',
    )
  })

  it('falls back to the legacy value when only the legacy variable is set', () => {
    const env = { CODEMIND_MODEL: 'legacy-model' }
    expect(readEnvWithLegacyFallback('SYMBOLWRIGHT_MODEL', 'CODEMIND_MODEL', { env })).toBe(
      'legacy-model',
    )
  })

  it('prefers the canonical value when both are set to the same value, without warning', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const env = { SYMBOLWRIGHT_MODEL: 'claude', CODEMIND_MODEL: 'claude' }
    expect(readEnvWithLegacyFallback('SYMBOLWRIGHT_MODEL', 'CODEMIND_MODEL', { env })).toBe(
      'claude',
    )
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('prefers the canonical value and warns when both are set to conflicting values', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const env = { SYMBOLWRIGHT_MODEL: 'new-model', CODEMIND_MODEL: 'old-model' }
    expect(readEnvWithLegacyFallback('SYMBOLWRIGHT_MODEL', 'CODEMIND_MODEL', { env })).toBe(
      'new-model',
    )
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[0]).toContain('SYMBOLWRIGHT_MODEL')
    spy.mockRestore()
  })

  it('never includes raw values in the conflict warning for sensitive variables', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const env = {
      SYMBOLWRIGHT_API_KEY: 'sk-new-secret-value',
      CODEMIND_API_KEY: 'sk-old-secret-value',
    }
    readEnvWithLegacyFallback('SYMBOLWRIGHT_API_KEY', 'CODEMIND_API_KEY', {
      env,
      sensitive: true,
    })
    expect(spy).toHaveBeenCalledTimes(1)
    const message = String(spy.mock.calls[0]?.[0])
    expect(message).not.toContain('sk-new-secret-value')
    expect(message).not.toContain('sk-old-secret-value')
    spy.mockRestore()
  })

  it('treats an empty-string value as unset', () => {
    const env = { SYMBOLWRIGHT_MODEL: '', CODEMIND_MODEL: 'legacy-model' }
    expect(readEnvWithLegacyFallback('SYMBOLWRIGHT_MODEL', 'CODEMIND_MODEL', { env })).toBe(
      'legacy-model',
    )
  })
})
